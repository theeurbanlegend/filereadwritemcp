use std::path::{Path, PathBuf};

use crate::common::lib::{curl, get_agent_dir, get_machine_name};
use crate::common::profiles::{
    clean_executables, env_file, profile_dir, profile_exists, sanitize, validate_roots,
    write_atomic,
};
use dialoguer::Input;
use serde_json::{Value, json};

pub const DEFAULT_ROUTER_URL: &str = "https://file-read-write.about-bewton.dev";
pub const DEFAULT_EXECUTABLES: [&str; 6] = ["node", "yarn", "npm", "npx", "git", "tsc"];

#[derive(clap::Args, Debug, Default)]
pub struct NewArgs {
    #[arg(
        long,
        value_name = "URL",
        help = "Router URL (defaults to the hosted router)"
    )]
    pub router: Option<String>,
    #[arg(
        long,
        help = "Enrollment code from your dashboard; passing it skips all prompts"
    )]
    pub code: Option<String>,
    #[arg(
        long,
        help = "Name for this machine; its sanitized form becomes the profile name"
    )]
    pub name: Option<String>,
    #[arg(
        long = "root",
        value_name = "DIR",
        help = "Folder the agent may access (repeatable)"
    )]
    pub roots: Vec<String>,
    #[arg(
        long = "exe",
        value_name = "PROGRAM",
        help = "Program the agent may run (repeatable)"
    )]
    pub executables: Vec<String>,
    #[arg(
        long,
        value_name = "true|false",
        action = clap::ArgAction::Set,
        help = "Let the agent update itself (default: true)"
    )]
    pub auto_update: Option<bool>,
}

impl NewArgs {
    pub fn is_empty(&self) -> bool {
        self.router.is_none()
            && self.code.is_none()
            && self.name.is_none()
            && self.roots.is_empty()
            && self.executables.is_empty()
            && self.auto_update.is_none()
    }
}

#[derive(Debug, PartialEq)]
pub struct Enrollment {
    pub router_url: String,
    pub code: String,
    pub machine_name: String,
    pub profile_name: String,
    pub roots: Vec<String>,
    pub executables: Vec<String>,
    pub auto_update: bool,
}

impl Enrollment {
    pub fn from_flags(agent_dir: &Path, args: &NewArgs) -> Result<Self, String> {
        let code = non_blank(&args.code)
            .ok_or("Missing --code (the enrollment code from your dashboard)")?
            .to_string();
        let router_url = non_blank(&args.router)
            .unwrap_or(DEFAULT_ROUTER_URL)
            .trim_end_matches('/')
            .to_string();
        let machine_name = non_blank(&args.name)
            .map(str::to_string)
            .unwrap_or_else(get_machine_name);
        let profile_name = sanitize(&machine_name);
        if profile_exists(agent_dir, &profile_name) {
            return Err(format!(
                "A profile named '{profile_name}' already exists. Pass a different --name."
            ));
        }
        let roots = if args.roots.is_empty() {
            vec![default_root()]
        } else {
            validate_roots(&args.roots)?
        };
        let executables = if args.executables.is_empty() {
            DEFAULT_EXECUTABLES.iter().map(|e| e.to_string()).collect()
        } else {
            clean_executables(&args.executables)?
        };
        Ok(Self {
            router_url,
            code,
            machine_name,
            profile_name,
            roots,
            executables,
            auto_update: args.auto_update.unwrap_or(true),
        })
    }
}

fn non_blank(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|v| !v.is_empty())
}

pub fn default_root() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("projects")
        .display()
        .to_string()
}

// Enroll a new machine as a named config profile. Returns the profile name.
pub fn setup_interactive() -> Result<String, String> {
    let default_router_url = DEFAULT_ROUTER_URL.to_string();
    println!("FileReadWrite agent setup");
    println!("=========================");
    println!(" ");

    let router_url: String = Input::new()
        .with_prompt("Enter router url or hit enter to accept the default")
        .default(default_router_url.clone())
        .interact_text()
        .unwrap_or(default_router_url);

    let enrollment_code: String = Input::new()
        .with_prompt("Enter the enrollment code from your dashboard")
        .interact_text()
        .map_err(|e| format!("An enrollment code is required: {e}"))?;

    let curr_machine_name = get_machine_name();
    let machine_name: String = Input::new()
        .with_prompt("Name/Alias for your machine")
        .default(curr_machine_name.clone())
        .interact_text()
        .unwrap_or(curr_machine_name);

    // Profile folder name (short id); defaults to a sanitized machine name.
    let agent_dir = get_agent_dir();
    let default_profile = sanitize(&machine_name);
    let profile_name = loop {
        let candidate: String = Input::new()
            .with_prompt("Profile name (a short id for this config)")
            .default(default_profile.clone())
            .interact_text()
            .unwrap_or_else(|_| default_profile.clone());
        let candidate = sanitize(&candidate);
        if profile_exists(&agent_dir, &candidate) {
            eprintln!("⚠️  A profile named '{candidate}' already exists. Choose another.");
            continue;
        }
        break candidate;
    };

    let default_root = default_root();
    let directory_access = loop {
        let dir: String = Input::new()
            .with_prompt("Directory the agent may access. Use absolute paths please")
            .default(default_root.clone())
            .interact_text()
            .unwrap_or_else(|_| default_root.clone());
        let path = std::path::Path::new(&dir);
        if path.is_dir() || dir == default_root {
            break dir;
        }
        eprintln!("❌ Directory doesn't exist: {dir}. Please try again.");
    };

    println!("Enrolling {} with {}...", machine_name, router_url);
    let enrollment = Enrollment {
        router_url,
        code: enrollment_code,
        machine_name,
        profile_name,
        roots: vec![directory_access],
        executables: DEFAULT_EXECUTABLES.iter().map(|e| e.to_string()).collect(),
        auto_update: true,
    };
    let agent_id = enroll(&agent_dir, &enrollment)?;

    println!(
        "Setup complete! Agent id: {agent_id}, profile: {}",
        enrollment.profile_name
    );
    Ok(enrollment.profile_name)
}

pub fn setup_noninteractive(agent_dir: &Path, args: &NewArgs) -> Result<String, String> {
    let enrollment = Enrollment::from_flags(agent_dir, args)?;
    enroll(agent_dir, &enrollment)?;
    Ok(enrollment.profile_name)
}

fn enroll(agent_dir: &Path, enrollment: &Enrollment) -> Result<String, String> {
    let payload = json!({ "code": enrollment.code, "name": enrollment.machine_name });
    let output = curl(&[
        "-sS",
        "-w",
        "\n%{http_code}",
        "-X",
        "POST",
        &format!("{}/agent/enroll", enrollment.router_url),
        "-H",
        "content-type: application/json",
        "-d",
        &payload.to_string(),
    ])
    .map_err(|e| format!("Could not reach {}: {e}", enrollment.router_url))?;
    let (body, status) = split_status(&output);
    if !(200..300).contains(&status) {
        return Err(enroll_error(status, body));
    }

    let parsed: Value =
        serde_json::from_str(body).map_err(|e| format!("Failed to parse response: {e}"))?;
    let token = parsed["token"]
        .as_str()
        .ok_or_else(|| "No token in router response".to_string())?;
    let agent_id = parsed["agentId"].as_str().unwrap_or("Null").to_string();

    let dir = profile_dir(agent_dir, &enrollment.profile_name);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create profile dir: {e}"))?;
    let config_path = dir.join("file-access.json");
    let env_path = dir.join(".env");

    let config = json!({
        "allowedRoots": enrollment.roots,
        "allowedExecutables": enrollment.executables,
        "autoUpdate": enrollment.auto_update
    });
    let env_content = env_file(
        &enrollment.router_url,
        token,
        &config_path.display().to_string(),
    );
    write_atomic(&config_path, &config.to_string())
        .map_err(|e| format!("Error creating config file: {e}"))?;
    write_atomic(&env_path, &env_content).map_err(|e| format!("Error writing .env file: {e}"))?;

    Ok(agent_id)
}

fn split_status(output: &str) -> (&str, u16) {
    let (body, code) = output.rsplit_once('\n').unwrap_or(("", output));
    (body, code.trim().parse().unwrap_or(0))
}

fn enroll_error(status: u16, body: &str) -> String {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| match &value["message"] {
            Value::String(text) => Some(text.clone()),
            Value::Array(items) => Some(
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("; "),
            ),
            _ => None,
        })
        .filter(|text| !text.trim().is_empty());
    message.unwrap_or_else(|| format!("Enrollment failed: the server answered {status}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::profiles::test_support::TempAgentDir;

    #[test]
    fn enroll_errors_use_the_server_message() {
        let body = r#"{"message":"Invalid or expired enrollment code","error":"Bad Request","statusCode":400}"#;
        let output = format!("{body}\n400");
        let (parsed_body, status) = split_status(&output);
        assert_eq!(status, 400);
        assert_eq!(
            enroll_error(status, parsed_body),
            "Invalid or expired enrollment code"
        );
        assert_eq!(
            enroll_error(
                400,
                r#"{"message":["code must be a string","name too long"]}"#
            ),
            "code must be a string; name too long"
        );
        assert_eq!(
            enroll_error(502, "<html>Bad gateway</html>"),
            "Enrollment failed: the server answered 502"
        );
        assert_eq!(split_status("404"), ("", 404));
    }

    fn flags(code: Option<&str>) -> NewArgs {
        NewArgs {
            code: code.map(str::to_string),
            ..NewArgs::default()
        }
    }

    #[test]
    fn missing_code_is_an_error() {
        let dir = TempAgentDir::new();
        let err = Enrollment::from_flags(dir.path(), &flags(None)).unwrap_err();
        assert!(err.contains("--code"));
        let err = Enrollment::from_flags(dir.path(), &flags(Some("  "))).unwrap_err();
        assert!(err.contains("--code"));
    }

    #[test]
    fn defaults_match_the_interactive_flow() {
        let dir = TempAgentDir::new();
        let args = NewArgs {
            name: Some("Work MacBook".into()),
            ..flags(Some("ABC"))
        };
        let enrollment = Enrollment::from_flags(dir.path(), &args).unwrap();
        assert_eq!(enrollment.router_url, DEFAULT_ROUTER_URL);
        assert_eq!(enrollment.machine_name, "Work MacBook");
        assert_eq!(enrollment.profile_name, "work-macbook");
        assert_eq!(enrollment.roots, vec![default_root()]);
        assert_eq!(enrollment.executables, DEFAULT_EXECUTABLES.to_vec());
        assert!(enrollment.auto_update);
    }

    #[test]
    fn flags_override_defaults() {
        let dir = TempAgentDir::new();
        let root = dir.path().display().to_string();
        let args = NewArgs {
            router: Some("http://localhost:3000/".into()),
            name: Some("box".into()),
            roots: vec![root.clone(), root.clone()],
            executables: vec!["cargo".into(), " git ".into()],
            auto_update: Some(false),
            ..flags(Some("ABC"))
        };
        let enrollment = Enrollment::from_flags(dir.path(), &args).unwrap();
        assert_eq!(enrollment.router_url, "http://localhost:3000");
        assert_eq!(enrollment.roots, vec![root]);
        assert_eq!(enrollment.executables, vec!["cargo", "git"]);
        assert!(!enrollment.auto_update);
    }

    #[test]
    fn name_taken_is_an_error() {
        let dir = TempAgentDir::new();
        dir.add_profile("work", "https://r.example", "secret");
        let args = NewArgs {
            name: Some("Work".into()),
            ..flags(Some("ABC"))
        };
        let err = Enrollment::from_flags(dir.path(), &args).unwrap_err();
        assert!(err.contains("'work' already exists"));
    }

    #[test]
    fn names_cannot_escape_the_profiles_folder() {
        let dir = TempAgentDir::new();
        let args = NewArgs {
            name: Some("../evil".into()),
            ..flags(Some("ABC"))
        };
        let enrollment = Enrollment::from_flags(dir.path(), &args).unwrap();
        assert_eq!(enrollment.profile_name, "---evil");
    }

    #[test]
    fn missing_folder_is_an_error() {
        let dir = TempAgentDir::new();
        let args = NewArgs {
            roots: vec!["/does/not/exist".into()],
            ..flags(Some("ABC"))
        };
        assert!(
            Enrollment::from_flags(dir.path(), &args)
                .unwrap_err()
                .contains("/does/not/exist")
        );
    }
}
