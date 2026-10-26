use dialoguer::{Confirm, Input, MultiSelect, Select};
use serde_json::{Value, json};
use std::fs;
use std::io::IsTerminal;
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
pub fn edit(agent_dir: &Path) -> Result<(), String> {
    if !std::io::stdin().is_terminal() {
        return Err("`config` needs an interactive terminal.".to_string());
    }
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
    let name = &profiles[idx];
    let dir = profile_dir(agent_dir, name);
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

    let new_cfg = json!({
        "allowedRoots": allowed_roots,
        "allowedExecutables": allowed_execs,
        "autoUpdate": auto_update,
    });
    fs::write(&cfg_path, new_cfg.to_string()).map_err(|e| e.to_string())?;

    // Preserve AGENT_TOKEN + FILE_ACCESS_CONFIG; only ROUTER_URL is editable here.
    let token = read_env_value(&env_path, "AGENT_TOKEN").unwrap_or_default();
    let facfg = read_env_value(&env_path, "FILE_ACCESS_CONFIG")
        .unwrap_or_else(|| cfg_path.display().to_string());
    let env_content = env_file(&router_url, &token, &facfg);
    fs::write(&env_path, env_content).map_err(|e| e.to_string())?;

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
mod tests {
    use super::env_file;

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
}
