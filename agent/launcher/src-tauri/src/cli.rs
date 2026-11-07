use crate::lifecycle::last_meaningful_line;
use crate::protocol::PROFILE_MISSING_EXIT_CODE;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub name: String,
    pub router_url: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDetails {
    pub name: String,
    pub router_url: String,
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

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnrollForm {
    pub router_url: String,
    pub code: String,
    pub machine_name: String,
    pub roots: Vec<String>,
    pub executables: Vec<String>,
    pub auto_update: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsForm {
    pub roots: Vec<String>,
    pub executables: Vec<String>,
    pub auto_update: bool,
}

pub fn command(agent: &Path) -> Command {
    let mut command = Command::new(agent);
    if let Some(path) = crate::shell_path::login_path() {
        command.env("PATH", path);
    }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    command.kill_on_drop(true);
    command
}

#[derive(Debug, Clone, PartialEq)]
pub enum CliError {
    ProfileMissing(String),
    Failed(String),
}

impl CliError {
    fn from_exit(code: Option<i32>, message: String) -> Self {
        if code == Some(PROFILE_MISSING_EXIT_CODE) {
            CliError::ProfileMissing(message)
        } else {
            CliError::Failed(message)
        }
    }
}

impl From<CliError> for String {
    fn from(error: CliError) -> Self {
        match error {
            CliError::ProfileMissing(message) | CliError::Failed(message) => message,
        }
    }
}

async fn run(agent: &Path, args: &[String]) -> Result<String, CliError> {
    let output = command(agent)
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .map_err(|e| CliError::Failed(format!("Couldn't start FileReadWrite: {e}")))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(CliError::from_exit(
            output.status.code(),
            last_meaningful_line(&String::from_utf8_lossy(&output.stderr)),
        ))
    }
}

fn parse_details(out: &str) -> Result<ProfileDetails, CliError> {
    serde_json::from_str(out)
        .map_err(|e| CliError::Failed(format!("Unexpected profile details: {e}")))
}

pub async fn list_profiles(agent: &Path) -> Result<Vec<ProfileSummary>, String> {
    let out = run(agent, &["profiles".into(), "--json".into()]).await?;
    serde_json::from_str(&out).map_err(|e| format!("Unexpected profile list: {e}"))
}

pub async fn profile_details(agent: &Path, name: &str) -> Result<ProfileDetails, CliError> {
    let args = ["config", "-p", name, "--json"].map(String::from);
    parse_details(&run(agent, &args).await?)
}

pub fn enroll_args(form: &EnrollForm) -> Vec<String> {
    let mut args = vec![
        "new".to_string(),
        "--router".to_string(),
        form.router_url.trim().to_string(),
        "--code".to_string(),
        form.code.trim().to_string(),
    ];
    let name = form.machine_name.trim();
    if !name.is_empty() {
        args.push("--name".into());
        args.push(name.into());
    }
    for root in &form.roots {
        args.push("--root".into());
        args.push(root.clone());
    }
    for exe in &form.executables {
        args.push("--exe".into());
        args.push(exe.clone());
    }
    args.push("--auto-update".into());
    args.push(form.auto_update.to_string());
    args
}

pub async fn enroll(agent: &Path, form: &EnrollForm) -> Result<String, String> {
    let out = run(agent, &enroll_args(form)).await?;
    out.lines()
        .last()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .ok_or_else(|| "Enrollment finished without a profile name.".to_string())
}

pub fn settings_args(profile: &str, form: &SettingsForm) -> Vec<String> {
    let mut args = vec![
        "config".to_string(),
        "-p".to_string(),
        profile.to_string(),
        "--json".to_string(),
    ];
    for root in &form.roots {
        args.push("--root".into());
        args.push(root.clone());
    }
    if form.executables.is_empty() {
        args.push("--clear-exes".into());
    }
    for exe in &form.executables {
        args.push("--exe".into());
        args.push(exe.clone());
    }
    args.push("--auto-update".into());
    args.push(form.auto_update.to_string());
    args
}

pub async fn save_settings(
    agent: &Path,
    profile: &str,
    form: &SettingsForm,
) -> Result<ProfileDetails, CliError> {
    parse_details(&run(agent, &settings_args(profile, form)).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enroll_flags_match_the_agent_cli() {
        let form = EnrollForm {
            router_url: " https://r.example ".into(),
            code: "ABCD-1234 ".into(),
            machine_name: "sam-mac".into(),
            roots: vec!["/Users/sam/site".into()],
            executables: vec!["git".into(), "node".into()],
            auto_update: false,
        };
        assert_eq!(
            enroll_args(&form),
            [
                "new",
                "--router",
                "https://r.example",
                "--code",
                "ABCD-1234",
                "--name",
                "sam-mac",
                "--root",
                "/Users/sam/site",
                "--exe",
                "git",
                "--exe",
                "node",
                "--auto-update",
                "false"
            ]
        );
    }

    #[test]
    fn blank_machine_name_lets_the_agent_choose() {
        let form = EnrollForm {
            router_url: "https://r.example".into(),
            code: "C".into(),
            machine_name: "  ".into(),
            roots: vec![],
            executables: vec![],
            auto_update: true,
        };
        assert!(!enroll_args(&form).contains(&"--name".to_string()));
    }

    #[test]
    fn empty_program_list_is_cleared_explicitly() {
        let form = SettingsForm {
            roots: vec!["/a".into()],
            executables: vec![],
            auto_update: true,
        };
        let args = settings_args("work", &form);
        assert!(args.contains(&"--clear-exes".to_string()));
        assert!(!args.contains(&"--exe".to_string()));
        let form = SettingsForm {
            executables: vec!["git".into()],
            ..form
        };
        assert!(!settings_args("work", &form).contains(&"--clear-exes".to_string()));
    }

    #[test]
    fn exit_78_means_the_profile_is_gone() {
        assert_eq!(
            CliError::from_exit(Some(78), "gone".into()),
            CliError::ProfileMissing("gone".into())
        );
        assert_eq!(
            CliError::from_exit(Some(1), "bad".into()),
            CliError::Failed("bad".into())
        );
        assert_eq!(
            String::from(CliError::ProfileMissing("gone".into())),
            "gone"
        );
    }

    #[test]
    fn profile_json_from_the_agent_parses() {
        let json = r#"{"name":"demo","routerUrl":"http://localhost:3100","allowedRoots":["/p"],"allowedExecutables":["git"],"autoUpdate":false}"#;
        let details: ProfileDetails = serde_json::from_str(json).unwrap();
        assert_eq!(details.allowed_executables, vec!["git"]);
        assert!(!details.auto_update);
        let list: Vec<ProfileSummary> =
            serde_json::from_str(r#"[{"name":"demo","routerUrl":"http://localhost:3100"}]"#)
                .unwrap();
        assert_eq!(list[0].name, "demo");
    }
}
