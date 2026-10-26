use crate::common::{
    constants::AGENT_VERSION,
    file_tools_core::FileToolsCore,
    file_tools_use::{dispatch, get_tools},
    lib::{clear_terminal, get_agent_dir},
    profiles,
    setup::setup,
    types::ToolTypeEnum,
    updater,
};
use clap::{Parser, Subcommand};
use futures_util::FutureExt;
use rust_socketio::{
    Payload,
    asynchronous::{Client, ClientBuilder},
};
use serde_json::{Value, json};
use std::io::IsTerminal;
use std::{env, fs, path::Path};
mod common;

#[derive(Parser)]
#[command(name = "frw-agent", version, about = "FileReadWrite agent")]
struct Cli {
    /// Run a specific config profile without the interactive picker (headless/service).
    #[arg(short, long)]
    profile: Option<String>,
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Enroll a new machine as a config profile.
    New,
    /// Edit an existing profile's settings.
    Config,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        env::set_var("RUST_LOG", "agent");
    }
    env_logger::init();

    let cli = Cli::parse();
    let agent_dir = get_agent_dir();
    profiles::migrate_flat_if_needed(&agent_dir);

    match &cli.command {
        Some(Commands::New) => {
            let name = setup().unwrap_or_else(|e| {
                eprintln!("Setup failed: {e}");
                std::process::exit(1);
            });
            println!("\nProfile '{name}' saved. Now run the agent with no flags to start it.");
            return Ok(());
        }
        Some(Commands::Config) => {
            if let Err(e) = profiles::edit(&agent_dir) {
                eprintln!("Edit failed: {e}");
                std::process::exit(1);
            }
            println!("\nConfig saved. Now run the agent with no flags to start it.");
            return Ok(());
        }
        None => {}
    }

    // ---- run path: resolve the profile BEFORE any socket work ----
    let profile = match profiles::resolve_for_run(&agent_dir, cli.profile.clone()) {
        Ok(Some(name)) => name,
        Ok(None) => {
            if !std::io::stdin().is_terminal() {
                eprintln!(
                    "No config profile found. Run `frw-agent new` on a terminal to enroll one."
                );
                std::process::exit(1);
            }
            setup().unwrap_or_else(|e| panic!("Error when setting up: {e}"))
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };

    profiles::load_env(&agent_dir, &profile).unwrap_or_else(|e| panic!("{e}"));

    clear_terminal();

    let router_url = env::var("ROUTER_URL").expect("Missing ROUTER_URL");
    let token = env::var("AGENT_TOKEN").expect("Missing AGENT_TOKEN");
    let cfg_path = env::var("FILE_ACCESS_CONFIG").expect("Missing FILE_ACCESS_CONFIG");

    let cfg: Value =
        serde_json::from_str(&fs::read_to_string(cfg_path)?).expect("Failed to parse config JSON");

    let auto_update = cfg
        .get("autoUpdate")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let allowed_dirs: Vec<String> = cfg
        .get("allowedRoots")
        .and_then(|r| r.as_array())
        .unwrap_or(&Vec::new())
        .iter()
        .filter_map(|r| r.as_str())
        .filter_map(|r| dunce::canonicalize(Path::new(r)).ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    let allowed_executables: Vec<String> = cfg
        .get("allowedExecutables")
        .and_then(|r| r.as_array())
        .unwrap_or(&Vec::new())
        .iter()
        .filter_map(|r| r.as_str())
        .map(|s| s.to_string())
        .collect();

    let allowed_dir_len = allowed_dirs.len();
    let allowed_exec_len = allowed_executables.len();
    let core = FileToolsCore::new(allowed_dirs, allowed_executables);

    log::info!("Starting profile '{}'", profile);
    log::info!("To enroll another account or router, run `frw-agent new`");
    log::info!("To change this profile's settings, run `frw-agent config`");
    log::info!("Loaded {} allowed root(s)", allowed_dir_len);
    log::info!("Loaded {} allowed executables(s)", allowed_exec_len);

    let core = std::sync::Arc::new(core);

    log::info!("Connecting to router at {}", router_url);
    let update_router = router_url.clone();
    let update_token = token.clone();

    let client = ClientBuilder::new(router_url)
        .namespace("/agent")
        .auth(json!({"token": token}))
        .reconnect_on_disconnect(true)
        .transport_type(rust_socketio::TransportType::Websocket)
        .on("connect", |_, socket: Client| {
            async move {
                let tools = get_tools();
                socket
                    .emit(
                        "hello",
                        json!({ "agentVersion": AGENT_VERSION, "tools": tools, "target": updater::TARGET }),
                    )
                    .await
                    .expect("Failed to emit hello");
                log::info!("Connected to router; advertised {} tool(s).", tools.len());
            }
            .boxed()
        })
        .on("call", {
            move |payload: Payload, socket: Client| {
                let core = core.clone();
                async move {
                    match payload {
                        Payload::Text(msgs) => {
                            if let Some(msg) = msgs.first().cloned() {
                                let tool_name: ToolTypeEnum = msg
                                    .get("tool")
                                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                                    .unwrap_or(ToolTypeEnum::ListAllowedResources);
                                let args = msg.get("args").cloned().unwrap_or(json!({}));
                                let id = msg.get("id").cloned();
                                let result = tokio::task::spawn_blocking(move || {
                                    dispatch(&core, tool_name, args)
                                })
                                .await
                                .unwrap_or_else(|e| Err(format!("dispatch worker panicked: {e}")));
                                match result {
                                    Ok(val) => {
                                        if let Some(id_val) = id
                                            && let Err(err) = socket
                                                .emit("result", json!({"id": id_val, "ok": true, "result": val}))
                                                .await
                                            {
                                                log::warn!("Failed to emit result: {err:?}");
                                            }
                                    }
                                    Err(e) => {
                                        if let Some(id_val) = id
                                            && let Err(err) = socket
                                                .emit("error", json!({"id": id_val, "ok": false, "error": e}))
                                                .await
                                            {
                                                log::warn!("Failed to emit error: {err:?}");
                                            }
                                    }
                                };

                            }
                        }
                        Payload::Binary(_) => {
                            log::warn!("Received unexpected binary payload");
                        }
                        _ => {}
                    }
                }
                .boxed()
            }
        })
        .on("update-available", move |payload: Payload, _socket: Client| {
            let update_router = update_router.clone();
            let update_token = update_token.clone();
            async move {
                let msg = match payload {
                    Payload::Text(msgs) => msgs.into_iter().next(),
                    _ => None,
                };
                let Some(msg) = msg else { return };
                let version = msg
                    .get("version")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?")
                    .to_string();
                let sha256 = msg
                    .get("sha256")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if !auto_update {
                    log::info!(
                        "Update v{version} available — auto-update disabled; not applying"
                    );
                    return;
                }
                if sha256.is_empty() {
                    log::warn!("update-available for v{version} missing sha256; ignoring");
                    return;
                }

                log::info!("Update v{version} available — downloading and applying");
                let res = tokio::task::spawn_blocking(move || {
                    updater::apply_update(&update_router, &update_token, &sha256)
                })
                .await;
                match res {
                    Ok(Ok(())) => {} // unreachable: exec replaces the process image
                    Ok(Err(e)) => log::error!("Update failed: {e}"),
                    Err(e) => log::error!("Update task join error: {e}"),
                }
            }
            .boxed()
        })
        .on("disconnect", |payload, _| {
            async move {
                match payload {
                    Payload::Text(reason) => {
                        log::info!("Disconnected from router with reason: {:?}", reason);
                    }
                    _ => {
                        log::info!("Disconnected from router");
                    }
                }
            }
            .boxed()
        })
        .on("connect_error", |payload, _| {
            async move {
                match payload {
                    Payload::Text(reason) => {
                        log::error!("Error connecting due to reason: {:?}", reason);
                    }
                    _ => {
                        log::error!("Error connecting");
                    }
                }
            }
            .boxed()
        })
        .connect()
        .await
        .expect("Connection failed");

    log::info!("FileMCPAgent ready, Version {}", AGENT_VERSION);

    // Periodic safety-net check (primary trigger is the router pushing
    // `update-available` on connect / on new release). Gated by autoUpdate.
    if auto_update {
        let update_client = client.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(300));
            ticker.tick().await; // consume the immediate first tick; `hello` already triggered a compare
            loop {
                ticker.tick().await;
                if let Err(e) = update_client
                    .emit(
                        "check-update",
                        json!({ "agentVersion": AGENT_VERSION, "target": updater::TARGET }),
                    )
                    .await
                {
                    log::warn!("Failed to emit check-update: {e:?}");
                }
            }
        });
    }

    // Keep the client handle alive for the lifetime of the process.
    let _keep_alive = client;

    tokio::signal::ctrl_c().await?;

    log::info!("Shutting down");

    Ok(())
}
