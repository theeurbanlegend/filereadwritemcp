use crate::common::{
    constants::AGENT_VERSION,
    file_tools_core::FileToolsCore,
    file_tools_use::{dispatch, get_tools},
    launcher::{self, Event, LaunchedFrom},
    lib::{clear_terminal, get_agent_dir},
    profiles::{self, ConfigArgs},
    setup::{NewArgs, setup_interactive, setup_noninteractive},
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
    #[arg(
        long,
        value_enum,
        default_value_t = LaunchedFrom::Tty,
        help = "Who started the agent: a terminal (tty) or the desktop launcher (JSON lines on stdout/stdin)"
    )]
    launched_from: LaunchedFrom,
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Enroll a new machine as a config profile (prompts unless --code is given)")]
    New(NewArgs),
    #[command(about = "Edit or read a profile's settings (prompts unless flags are given)")]
    Config(ConfigArgs),
    #[command(about = "List config profiles")]
    Profiles {
        #[arg(long, help = "Print the profiles as JSON")]
        json: bool,
    },
}

fn fail(message: &str) -> ! {
    fail_with(1, message)
}

fn fail_with(code: i32, message: &str) -> ! {
    let one_line = message
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    eprintln!("{one_line}");
    std::process::exit(code);
}

fn exit_if_profile_missing(agent_dir: &Path, name: &str) {
    if let Some(message) = profiles::missing_profile(agent_dir, name) {
        fail_with(launcher::PROFILE_MISSING_EXIT_CODE, &message);
    }
}

fn run_config(agent_dir: &Path, args: &ConfigArgs) {
    if !args.json && !args.has_changes() {
        if let Err(e) = profiles::edit_interactive(agent_dir, args.profile.as_deref()) {
            fail(&format!("Edit failed: {e}"));
        }
        println!("\nConfig saved. Now run the agent with no flags to start it.");
        return;
    }
    let Some(name) = args.profile.as_deref() else {
        fail("--profile is required with --json, --root, --exe or --auto-update");
    };
    exit_if_profile_missing(agent_dir, name);
    let result = if args.has_changes() {
        profiles::apply_changes(agent_dir, name, args)
    } else {
        profiles::details(agent_dir, name)
    };
    match result {
        Ok(details) if args.json => match serde_json::to_string(&details) {
            Ok(output) => println!("{output}"),
            Err(e) => fail(&e.to_string()),
        },
        Ok(_) => println!("Updated profile '{name}'."),
        Err(e) => fail(&e),
    }
}

fn payload_reason(payload: &Payload, fallback: &str) -> String {
    let reason = match payload {
        Payload::Text(values) => values
            .iter()
            .map(|v| {
                v.as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| v.to_string())
            })
            .collect::<Vec<_>>()
            .join(", "),
        _ => String::new(),
    };
    if reason.is_empty() {
        fallback.to_string()
    } else {
        reason
    }
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {}
                    _ = terminate.recv() => {}
                }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
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
        Some(Commands::New(args)) if args.is_empty() => {
            let name = setup_interactive().unwrap_or_else(|e| fail(&format!("Setup failed: {e}")));
            println!("\nProfile '{name}' saved. Now run the agent with no flags to start it.");
            return Ok(());
        }
        Some(Commands::New(args)) => {
            match setup_noninteractive(&agent_dir, args) {
                Ok(name) => println!("{name}"),
                Err(e) => fail(&format!("Setup failed: {e}")),
            }
            return Ok(());
        }
        Some(Commands::Config(args)) => {
            run_config(&agent_dir, args);
            return Ok(());
        }
        Some(Commands::Profiles { json }) => {
            let summaries = profiles::summaries(&agent_dir);
            if *json {
                println!("{}", serde_json::to_string(&summaries)?);
            } else {
                for profile in summaries {
                    println!("{}\t{}", profile.name, profile.router_url);
                }
            }
            return Ok(());
        }
        None => {}
    }

    if cli.launched_from == LaunchedFrom::Launcher {
        if cli.profile.is_none() {
            fail("--launched-from launcher needs --profile <name>");
        }
        launcher::start();
    }

    if let Some(name) = cli.profile.as_deref() {
        exit_if_profile_missing(&agent_dir, name);
    }

    let profile = match profiles::resolve_for_run(&agent_dir, cli.profile.clone()) {
        Ok(Some(name)) => name,
        Ok(None) => {
            if !std::io::stdin().is_terminal() {
                eprintln!(
                    "No config profile found. Run `frw-agent new` on a terminal to enroll one."
                );
                std::process::exit(1);
            }
            setup_interactive().unwrap_or_else(|e| panic!("Error when setting up: {e}"))
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
    launcher::emit(Event::Started {
        version: AGENT_VERSION.to_string(),
        profile: profile.clone(),
    });

    let core = std::sync::Arc::new(core);

    log::info!("Connecting to router at {}", router_url);
    let update_router = router_url.clone();
    let update_token = token.clone();

    let client = ClientBuilder::new(router_url)
        .namespace("/agent")
        .auth(json!({"token": token}))
        .reconnect_on_disconnect(true)
        .transport_type(rust_socketio::TransportType::Websocket)
        .on("open", |_, socket: Client| {
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
                launcher::emit(Event::Connected);
            }
            .boxed()
        })
        .on("call", {
            move |payload: Payload, socket: Client| {
                let core = core.clone();
                tokio::spawn(async move {
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
                });
                async {}.boxed()
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
                    let exe = updater::install_update(&update_router, &update_token, &sha256)?;
                    if launcher::is_active() {
                        log::info!("Binary replaced; exiting so the launcher restarts v{version}");
                        launcher::emit(Event::Update {
                            from: AGENT_VERSION.to_string(),
                            to: version,
                        });
                        std::process::exit(launcher::UPDATED_EXIT_CODE);
                    }
                    updater::restart(&exe)
                })
                .await;
                match res {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => log::error!("Update failed: {e}"),
                    Err(e) => log::error!("Update task join error: {e}"),
                }
            }
            .boxed()
        })
        .on("close", |payload, _| {
            async move {
                launcher::emit(Event::Disconnected {
                    reason: payload_reason(&payload, "router closed the connection"),
                });
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
        .on("error", |payload, _| {
            async move {
                launcher::emit(Event::Disconnected {
                    reason: payload_reason(&payload, "connection error"),
                });
                match payload {
                    Payload::Text(reason) => {
                        log::error!("Connection error: {:?}", reason);
                    }
                    _ => {
                        log::error!("Connection error");
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

    shutdown_signal().await;

    log::info!("Shutting down");
    launcher::emit(Event::Stopping);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<Commands, clap::Error> {
        let mut argv = vec!["frw-agent"];
        argv.extend_from_slice(args);
        Cli::try_parse_from(argv).map(|cli| cli.command.expect("a subcommand"))
    }

    #[test]
    fn launched_from_defaults_to_tty() {
        let cli = Cli::try_parse_from(["frw-agent"]).unwrap();
        assert_eq!(cli.launched_from, LaunchedFrom::Tty);
        let cli = Cli::try_parse_from([
            "frw-agent",
            "--launched-from",
            "launcher",
            "--profile",
            "work",
        ])
        .unwrap();
        assert_eq!(cli.launched_from, LaunchedFrom::Launcher);
        assert_eq!(cli.profile.as_deref(), Some("work"));
        assert!(Cli::try_parse_from(["frw-agent", "--launched-from", "gui"]).is_err());
    }

    #[test]
    fn bare_new_stays_interactive() {
        let Commands::New(args) = parse(&["new"]).unwrap() else {
            panic!("expected new");
        };
        assert!(args.is_empty());
    }

    #[test]
    fn new_parses_repeated_flags() {
        let Commands::New(args) = parse(&[
            "new",
            "--router",
            "http://localhost:3000",
            "--code",
            "ABC",
            "--name",
            "box",
            "--root",
            "/a",
            "--root",
            "/b,c",
            "--exe",
            "git",
            "--exe",
            "cargo",
            "--auto-update",
            "false",
        ])
        .unwrap() else {
            panic!("expected new");
        };
        assert!(!args.is_empty());
        assert_eq!(args.router.as_deref(), Some("http://localhost:3000"));
        assert_eq!(args.code.as_deref(), Some("ABC"));
        assert_eq!(args.name.as_deref(), Some("box"));
        assert_eq!(args.roots, vec!["/a", "/b,c"]);
        assert_eq!(args.executables, vec!["git", "cargo"]);
        assert_eq!(args.auto_update, Some(false));
    }

    #[test]
    fn auto_update_needs_a_boolean() {
        assert!(parse(&["new", "--code", "A", "--auto-update"]).is_err());
        assert!(parse(&["new", "--code", "A", "--auto-update", "maybe"]).is_err());
    }

    #[test]
    fn config_parses_read_and_edit_flags() {
        let Commands::Config(args) = parse(&["config"]).unwrap() else {
            panic!("expected config");
        };
        assert!(!args.json && !args.has_changes() && args.profile.is_none());

        let Commands::Config(args) = parse(&["config", "--profile", "work", "--json"]).unwrap()
        else {
            panic!("expected config");
        };
        assert!(args.json && !args.has_changes());
        assert_eq!(args.profile.as_deref(), Some("work"));

        let Commands::Config(args) = parse(&[
            "config",
            "-p",
            "work",
            "--exe",
            "node",
            "--auto-update",
            "true",
        ])
        .unwrap() else {
            panic!("expected config");
        };
        assert!(args.has_changes());
        assert!(args.roots.is_empty());
        assert_eq!(args.auto_update, Some(true));
    }

    #[test]
    fn profiles_parses_json_flag() {
        assert!(matches!(
            parse(&["profiles", "--json"]).unwrap(),
            Commands::Profiles { json: true }
        ));
    }
}
