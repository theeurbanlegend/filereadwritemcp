use std::fs;

use crate::common::lib::{curl, get_agent_dir, get_machine_name};
use crate::common::profiles::{env_file, profile_dir, sanitize};
use dialoguer::Input;
use serde_json::{Value, json};

// Enroll a new machine as a named config profile. Returns the profile name.
pub fn setup() -> Result<String, String> {
    let default_router_url: String = String::from("https://file-read-write-mcp.about-bewton.dev");
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
        if profile_dir(&agent_dir, &candidate).join(".env").exists() {
            eprintln!("⚠️  A profile named '{candidate}' already exists. Choose another.");
            continue;
        }
        break candidate;
    };

    let default_root = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("projects")
        .display()
        .to_string();
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
    let payload = json!({ "code": enrollment_code, "name": machine_name });
    let body = curl(&[
        "-fsS",
        "-X",
        "POST",
        &format!("{}/agent/enroll", router_url),
        "-H",
        "content-type: application/json",
        "-d",
        &payload.to_string(),
    ])?;

    let parsed: Value =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {e}"))?;
    let token = parsed["token"]
        .as_str()
        .ok_or_else(|| "No token in router response".to_string())?;
    let agent_id = parsed["agentId"].as_str().unwrap_or("Null");

    println!("Configuring.....");
    let dir = profile_dir(&agent_dir, &profile_name);
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create profile dir: {e}"))?;
    let config_path = dir.join("file-access.json");
    let env_path = dir.join(".env");

    let config = json!({
        "allowedRoots": [directory_access],
        "allowedExecutables": ["node", "yarn", "npm", "npx", "git", "tsc"],
        "autoUpdate": true
    });
    let env_content = env_file(&router_url, token, &config_path.display().to_string());
    fs::write(&config_path, config.to_string())
        .map_err(|e| format!("Error creating config file: {e}"))?;
    fs::write(&env_path, &env_content).map_err(|e| format!("Error writing .env file: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&env_path, std::fs::Permissions::from_mode(0o600)).ok();
    }

    println!("Setup complete! Agent id: {agent_id}, profile: {profile_name}");
    Ok(profile_name)
}
