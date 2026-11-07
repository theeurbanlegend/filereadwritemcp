use dialoguer::{Confirm, Input, MultiSelect, Select};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::io::{IsTerminal, Write};
use std::path::{Path, PathBuf};

// {config_root}/profiles
pub fn profiles_root(agent_dir: &Path) -> PathBuf {
    agent_dir.join("profiles")
}

pub fn profile_dir(agent_dir: &Path, name: &str) -> PathBuf {
    profiles_root(agent_dir).join(name)
}

// Profile names = subfolders of profiles/ that contain a .env.
pub fn list(agent_dir: &Path) -> Vec<String> {
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(profiles_root(agent_dir)) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && path.join(".env").exists()
                && let Some(name) = entry.file_name().to_str()
            {
                names.push(name.to_string());
            }
        }
    }
    names.sort();
    names
}

pub fn profile_exists(agent_dir: &Path, name: &str) -> bool {
    profile_dir(agent_dir, name).join(".env").exists()
}

pub fn missing_profile(agent_dir: &Path, name: &str) -> Option<String> {
    require_profile(agent_dir, name).err()
}

fn require_profile(agent_dir: &Path, name: &str) -> Result<PathBuf, String> {
    let profiles = list(agent_dir);
    if profiles.iter().any(|p| p == name) {
        return Ok(profile_dir(agent_dir, name));
    }
    if profiles.is_empty() {
        Err("No profiles exist yet. Run `frw-agent new` to enroll one.".to_string())
    } else {
        Err(format!(
            "No profile named '{name}'. Available: {}",
            profiles.join(", ")
        ))
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileAccess {
    #[serde(default)]
    pub allowed_roots: Vec<String>,
    #[serde(default)]
    pub allowed_executables: Vec<String>,
    #[serde(default = "enabled")]
    pub auto_update: bool,
}

fn enabled() -> bool {
    true
}

impl Default for FileAccess {
    fn default() -> Self {
        Self {
            allowed_roots: Vec::new(),
            allowed_executables: Vec::new(),
            auto_update: true,
        }
    }
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub name: String,
    pub router_url: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDetails {
    pub name: String,
    pub router_url: String,
    #[serde(flatten)]
    pub access: FileAccess,
}

#[derive(clap::Args, Debug, Default)]
pub struct ConfigArgs {
    #[arg(
        short,
        long,
        help = "Profile to read or edit (default: choose interactively)"
    )]
    pub profile: Option<String>,
    #[arg(long, help = "Print the profile's settings as JSON (never the token)")]
    pub json: bool,
    #[arg(
        long = "root",
        value_name = "DIR",
        help = "Folder the agent may access (repeatable; replaces the whole list)"
    )]
    pub roots: Vec<String>,
    #[arg(
        long = "exe",
        value_name = "PROGRAM",
        help = "Program the agent may run (repeatable; replaces the whole list)"
    )]
    pub executables: Vec<String>,
    #[arg(
        long,
        conflicts_with = "executables",
        help = "Remove every allowed program"
    )]
    pub clear_exes: bool,
    #[arg(
        long,
        value_name = "true|false",
        action = clap::ArgAction::Set,
        help = "Let the agent update itself"
    )]
    pub auto_update: Option<bool>,
}

impl ConfigArgs {
    pub fn has_changes(&self) -> bool {
        !self.roots.is_empty()
            || !self.executables.is_empty()
            || self.clear_exes
            || self.auto_update.is_some()
    }
}

fn read_access(dir: &Path) -> Result<FileAccess, String> {
    let path = dir.join("file-access.json");
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content)
            .map_err(|e| format!("Could not read {}: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(FileAccess::default()),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

pub fn summaries(agent_dir: &Path) -> Vec<ProfileSummary> {
    list(agent_dir)
        .into_iter()
        .map(|name| {
            let env_path = profile_dir(agent_dir, &name).join(".env");
            ProfileSummary {
                router_url: read_env_value(&env_path, "ROUTER_URL").unwrap_or_default(),
                name,
            }
        })
        .collect()
}

pub fn details(agent_dir: &Path, name: &str) -> Result<ProfileDetails, String> {
    let dir = require_profile(agent_dir, name)?;
    Ok(ProfileDetails {
        name: name.to_string(),
        router_url: read_env_value(&dir.join(".env"), "ROUTER_URL").unwrap_or_default(),
        access: read_access(&dir)?,
    })
}

pub fn apply_changes(
    agent_dir: &Path,
    name: &str,
    args: &ConfigArgs,
) -> Result<ProfileDetails, String> {
    let dir = require_profile(agent_dir, name)?;
    let mut access = read_access(&dir)?;
    if !args.roots.is_empty() {
        access.allowed_roots = validate_roots(&args.roots)?;
    }
    if args.clear_exes {
        access.allowed_executables.clear();
    } else if !args.executables.is_empty() {
        access.allowed_executables = clean_executables(&args.executables)?;
    }
    if let Some(auto_update) = args.auto_update {
        access.auto_update = auto_update;
    }
    let content = serde_json::to_string(&access).map_err(|e| e.to_string())?;
    write_atomic(&dir.join("file-access.json"), &content)?;
    details(agent_dir, name)
}

pub fn validate_roots(roots: &[String]) -> Result<Vec<String>, String> {
    let mut valid: Vec<String> = Vec::new();
    for root in roots {
        let root = root.trim();
        let path = Path::new(root);
        if !path.is_absolute() {
            return Err(format!("Folder must be an absolute path: {root}"));
        }
        if !path.is_dir() {
            return Err(format!("Folder doesn't exist: {root}"));
        }
        if !valid.iter().any(|r| r.as_str() == root) {
            valid.push(root.to_string());
        }
    }
    Ok(valid)
}

pub fn clean_executables(executables: &[String]) -> Result<Vec<String>, String> {
    let mut clean: Vec<String> = Vec::new();
    for exe in executables {
        let exe = exe.trim();
        if exe.is_empty() {
            return Err("Program names can't be empty".to_string());
        }
        if !clean.iter().any(|e| e.as_str() == exe) {
            clean.push(exe.to_string());
        }
    }
    Ok(clean)
}

pub fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid path: {}", path.display()))?;
    let tmp = path.with_file_name(format!("{file_name}.tmp"));
    let _ = fs::remove_file(&tmp);

    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&tmp)
        .map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("Could not save {}: {e}", path.display()))
}

// Turn a machine name into a safe folder name.
pub fn sanitize(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if s.is_empty() {
        "profile".to_string()
    } else {
        s.to_lowercase()
    }
}

// One-time migration: an old flat {root}/.env (+ file-access.json) becomes the
// "default" profile so existing installs keep working after the upgrade.
pub fn migrate_flat_if_needed(agent_dir: &Path) {
    let flat_env = agent_dir.join(".env");
    if !flat_env.exists() || !list(agent_dir).is_empty() {
        return;
    }
    let dest = profile_dir(agent_dir, "default");
    if fs::create_dir_all(&dest).is_err() {
        return;
    }
    let new_cfg = dest.join("file-access.json");
    let flat_cfg = agent_dir.join("file-access.json");
    if flat_cfg.exists() {
        let _ = fs::rename(&flat_cfg, &new_cfg);
    }
    if let Ok(content) = fs::read_to_string(&flat_env) {
        let rewritten = content
            .lines()
            .map(|line| {
                if line.starts_with("FILE_ACCESS_CONFIG=") {
                    env_line("FILE_ACCESS_CONFIG", &new_cfg.display().to_string())
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        if fs::write(dest.join(".env"), format!("{rewritten}\n")).is_ok() {
            let _ = fs::remove_file(&flat_env);
            log::info!("Migrated existing config into profile 'default'");
        }
    }
}

// Which profile should a bare run use?
// - explicit (--profile): must exist.
// - 0 profiles: Ok(None) -> caller runs first-time enrollment.
// - 1 profile: use it.
// - many: interactive Select (only when a terminal is attached).
pub fn resolve_for_run(
    agent_dir: &Path,
    explicit: Option<String>,
) -> Result<Option<String>, String> {
    let profiles = list(agent_dir);
    if let Some(name) = explicit {
        return if profiles.iter().any(|p| p == &name) {
            Ok(Some(name))
        } else if profiles.is_empty() {
            Err("No profiles exist yet. Run `frw-agent new` to enroll one.".to_string())
        } else {
            Err(format!(
                "No profile named '{name}'. Available: {}",
                profiles.join(", ")
            ))
        };
    }
    match profiles.len() {
        0 => Ok(None),
        1 => Ok(Some(profiles[0].clone())),
        _ => {
            if !std::io::stdin().is_terminal() {
                return Err(format!(
                    "Multiple profiles ({}) and no terminal to choose from. Re-run with --profile <name>.",
                    profiles.join(", ")
                ));
            }
            let idx = Select::new()
                .with_prompt("Choose a config to start")
                .items(&profiles)
                .default(0)
                .interact()
                .map_err(|e| e.to_string())?;
            Ok(Some(profiles[idx].clone()))
        }
    }
}

// Load a profile's .env into the process environment.
pub fn load_env(agent_dir: &Path, name: &str) -> Result<(), String> {
    let env_path = profile_dir(agent_dir, name).join(".env");
    dotenvy::from_path(&env_path).map_err(|e| format!("Failed to load profile '{name}': {e}"))
}

// Interactive editor for an existing profile's settings.
pub fn edit_interactive(agent_dir: &Path, preselected: Option<&str>) -> Result<(), String> {
    if !std::io::stdin().is_terminal() {
        return Err("`config` needs an interactive terminal.".to_string());
    }
    let name = match preselected {
        Some(name) => {
            require_profile(agent_dir, name)?;
            name.to_string()
        }
        None => {
            let profiles = list(agent_dir);
            if profiles.is_empty() {
                return Err("No profiles to edit yet. Run `frw-agent new` first.".to_string());
            }
            let idx = Select::new()
                .with_prompt("Which config do you want to update?")
                .items(&profiles)
                .default(0)
                .interact()
                .map_err(|e| e.to_string())?;
            profiles[idx].clone()
        }
    };
    let dir = profile_dir(agent_dir, &name);
    let env_path = dir.join(".env");
    let cfg_path = dir.join("file-access.json");

    let cfg: Value = fs::read_to_string(&cfg_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    let cur_router = read_env_value(&env_path, "ROUTER_URL").unwrap_or_default();
    let cur_auto = cfg
        .get("autoUpdate")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let cur_roots = str_vec(cfg.get("allowedRoots"));
    let cur_execs = str_vec(cfg.get("allowedExecutables"));

    let router_url: String = Input::new()
        .with_prompt("Router URL")
        .default(cur_router)
        .interact_text()
        .map_err(|e| e.to_string())?;
    let allowed_roots = edit_list("allowed root", cur_roots)?;
    let allowed_execs = edit_list("allowed executable", cur_execs)?;
    let auto_update = Confirm::new()
        .with_prompt("Auto-update this agent?")
        .default(cur_auto)
        .interact()
        .map_err(|e| e.to_string())?;

    // Preserve AGENT_TOKEN + FILE_ACCESS_CONFIG; only ROUTER_URL is editable here.
    let token = read_env_value(&env_path, "AGENT_TOKEN")
        .filter(|t| !t.is_empty())
        .ok_or_else(|| format!("Profile '{name}' has no agent token; re-enroll it."))?;
    let facfg = read_env_value(&env_path, "FILE_ACCESS_CONFIG")
        .unwrap_or_else(|| cfg_path.display().to_string());

    let new_cfg = json!({
        "allowedRoots": allowed_roots,
        "allowedExecutables": allowed_execs,
        "autoUpdate": auto_update,
    });
    write_atomic(&cfg_path, &new_cfg.to_string())?;
    write_atomic(&env_path, &env_file(&router_url, &token, &facfg))?;

    println!("Updated profile '{name}'.");
    Ok(())
}

// MultiSelect (choose which current entries to keep) + an add loop.
fn edit_list(label: &str, current: Vec<String>) -> Result<Vec<String>, String> {
    let mut kept: Vec<String> = if current.is_empty() {
        Vec::new()
    } else {
        let picks = MultiSelect::new()
            .with_prompt(format!(
                "{label}s: space toggles which to KEEP, enter confirms"
            ))
            .items(&current)
            .defaults(&vec![true; current.len()])
            .interact()
            .map_err(|e| e.to_string())?;
        picks.into_iter().map(|i| current[i].clone()).collect()
    };
    loop {
        let add: String = Input::new()
            .with_prompt(format!("Add another {label} (blank to finish)"))
            .allow_empty(true)
            .interact_text()
            .map_err(|e| e.to_string())?;
        let add = add.trim().to_string();
        if add.is_empty() {
            break;
        }
        if !kept.contains(&add) {
            kept.push(add);
        }
    }
    Ok(kept)
}

fn str_vec(v: Option<&Value>) -> Vec<String> {
    v.and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

pub fn env_line(key: &str, value: &str) -> String {
    format!("{key}='{value}'")
}

pub fn env_file(router_url: &str, token: &str, file_access_config: &str) -> String {
    format!(
        "ROUTER_URL={router_url}\nAGENT_TOKEN={token}\n{}\n",
        env_line("FILE_ACCESS_CONFIG", file_access_config)
    )
}

fn read_env_value(env_path: &Path, key: &str) -> Option<String> {
    let content = fs::read_to_string(env_path).ok()?;
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix(&format!("{key}=")) {
            return Some(rest.trim().trim_matches(['"', '\'']).to_string());
        }
    }
    None
}

#[cfg(test)]
pub mod test_support {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    pub struct TempAgentDir(PathBuf);

    impl TempAgentDir {
        pub fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let dir = std::env::temp_dir().join(format!(
                "frw-agent-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        pub fn path(&self) -> &Path {
            &self.0
        }

        pub fn add_profile(&self, name: &str, router_url: &str, token: &str) -> PathBuf {
            let dir = profile_dir(&self.0, name);
            fs::create_dir_all(&dir).unwrap();
            let cfg_path = dir.join("file-access.json");
            fs::write(
                dir.join(".env"),
                env_file(router_url, token, &cfg_path.display().to_string()),
            )
            .unwrap();
            fs::write(
                &cfg_path,
                json!({
                    "allowedRoots": [self.0.display().to_string()],
                    "allowedExecutables": ["git"],
                    "autoUpdate": false
                })
                .to_string(),
            )
            .unwrap();
            dir
        }
    }

    impl Drop for TempAgentDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::TempAgentDir;
    use super::*;

    #[test]
    fn windows_paths_survive_env_round_trip() {
        let path = r"C:\Users\me\AppData\Roaming\file-read-write-agent\profiles\x\file-access.json";
        let content = env_file("https://r.example", "tok", path);
        let vars: Vec<(String, String)> = dotenvy::from_read_iter(content.as_bytes())
            .map(|r| r.unwrap())
            .collect();
        assert!(vars.contains(&("FILE_ACCESS_CONFIG".to_string(), path.to_string())));
    }

    #[test]
    fn legacy_double_quoted_unix_paths_still_load() {
        let content = "FILE_ACCESS_CONFIG=\"/Users/me/profiles/x/file-access.json\"\n";
        let vars: Vec<(String, String)> = dotenvy::from_read_iter(content.as_bytes())
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(vars[0].1, "/Users/me/profiles/x/file-access.json");
    }

    fn changes(roots: &[String], executables: &[&str], auto_update: Option<bool>) -> ConfigArgs {
        ConfigArgs {
            roots: roots.to_vec(),
            executables: executables.iter().map(|e| e.to_string()).collect(),
            auto_update,
            ..ConfigArgs::default()
        }
    }

    #[test]
    fn summaries_list_name_and_router() {
        let dir = TempAgentDir::new();
        assert!(summaries(dir.path()).is_empty());
        dir.add_profile("work", "https://r.example", "secret");
        assert_eq!(
            serde_json::to_value(summaries(dir.path())).unwrap(),
            json!([{ "name": "work", "routerUrl": "https://r.example" }])
        );
    }

    #[test]
    fn details_never_include_the_token() {
        let dir = TempAgentDir::new();
        dir.add_profile("work", "https://r.example", "secret-token");
        let output = serde_json::to_string(&details(dir.path(), "work").unwrap()).unwrap();
        assert!(!output.contains("secret-token"));
        assert_eq!(
            serde_json::from_str::<Value>(&output).unwrap(),
            json!({
                "name": "work",
                "routerUrl": "https://r.example",
                "allowedRoots": [dir.path().display().to_string()],
                "allowedExecutables": ["git"],
                "autoUpdate": false
            })
        );
    }

    #[test]
    fn unknown_profile_is_an_error() {
        let dir = TempAgentDir::new();
        assert!(details(dir.path(), "nope").is_err());
        dir.add_profile("work", "https://r.example", "secret");
        let err = details(dir.path(), "nope").unwrap_err();
        assert!(err.contains("Available: work"));
        assert!(details(dir.path(), "../work").is_err());
    }

    #[test]
    fn passed_lists_replace_the_old_ones() {
        let dir = TempAgentDir::new();
        dir.add_profile("work", "https://r.example", "secret");
        let other = dir.path().join("other");
        fs::create_dir_all(&other).unwrap();
        let other = other.display().to_string();
        let updated = apply_changes(
            dir.path(),
            "work",
            &changes(std::slice::from_ref(&other), &["node", "npm"], None),
        )
        .unwrap();
        assert_eq!(updated.access.allowed_roots, vec![other]);
        assert_eq!(updated.access.allowed_executables, vec!["node", "npm"]);
    }

    #[test]
    fn omitted_flags_leave_settings_unchanged() {
        let dir = TempAgentDir::new();
        dir.add_profile("work", "https://r.example", "secret");
        let before = details(dir.path(), "work").unwrap();
        let updated = apply_changes(dir.path(), "work", &changes(&[], &["node"], None)).unwrap();
        assert_eq!(updated.access.allowed_roots, before.access.allowed_roots);
        assert!(!updated.access.auto_update);
        let updated = apply_changes(dir.path(), "work", &changes(&[], &[], Some(true))).unwrap();
        assert_eq!(updated.access.allowed_executables, vec!["node"]);
        assert!(updated.access.auto_update);
    }

    #[test]
    fn invalid_folder_is_rejected_and_nothing_is_written() {
        let dir = TempAgentDir::new();
        let profile = dir.add_profile("work", "https://r.example", "secret");
        let cfg_before = fs::read_to_string(profile.join("file-access.json")).unwrap();
        for bad in ["/does/not/exist", "relative/path"] {
            let err = apply_changes(
                dir.path(),
                "work",
                &changes(&[bad.to_string()], &["node"], Some(true)),
            )
            .unwrap_err();
            assert!(err.contains(bad));
        }
        assert_eq!(
            fs::read_to_string(profile.join("file-access.json")).unwrap(),
            cfg_before
        );
    }

    #[test]
    fn clear_exes_empties_the_program_list() {
        let dir = TempAgentDir::new();
        dir.add_profile("work", "https://r.example", "secret");
        apply_changes(dir.path(), "work", &changes(&[], &["node"], None)).unwrap();
        let cleared = ConfigArgs {
            clear_exes: true,
            ..ConfigArgs::default()
        };
        assert!(cleared.has_changes());
        let updated = apply_changes(dir.path(), "work", &cleared).unwrap();
        assert!(updated.access.allowed_executables.is_empty());
    }

    #[test]
    fn edits_keep_the_token_and_router() {
        let dir = TempAgentDir::new();
        let profile = dir.add_profile("work", "https://r.example", "secret");
        let env_before = fs::read_to_string(profile.join(".env")).unwrap();
        apply_changes(dir.path(), "work", &changes(&[], &["node"], Some(true))).unwrap();
        assert_eq!(
            fs::read_to_string(profile.join(".env")).unwrap(),
            env_before
        );
        assert!(!profile.join("file-access.json.tmp").exists());
    }
}
