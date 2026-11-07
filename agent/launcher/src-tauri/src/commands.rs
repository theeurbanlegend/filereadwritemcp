use crate::cli::{self, CliError, EnrollForm, ProfileDetails, SettingsForm};
use crate::launcher::{Launcher, Snapshot};
use crate::{notify, updates};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

pub const DEFAULT_ROUTER_URL: &str = "https://file-read-write.about-bewton.dev";

type LauncherState<'a> = State<'a, Arc<Launcher>>;

#[tauri::command]
pub fn get_snapshot(launcher: LauncherState<'_>) -> Snapshot {
    launcher.snapshot()
}

#[tauri::command]
pub fn get_logs(launcher: LauncherState<'_>) -> Vec<String> {
    launcher.logs()
}

#[tauri::command]
pub fn defaults() -> serde_json::Value {
    let host = gethostname::gethostname().to_string_lossy().to_string();
    let machine = host
        .strip_suffix(".local")
        .unwrap_or(&host)
        .trim()
        .to_string();
    serde_json::json!({ "routerUrl": DEFAULT_ROUTER_URL, "machineName": machine })
}

#[tauri::command]
pub async fn get_profile(launcher: LauncherState<'_>) -> Result<ProfileDetails, String> {
    let name = launcher
        .active_profile()
        .ok_or("This machine isn't set up yet.")?;
    let launcher = launcher.inner().clone();
    let result = cli::profile_details(&launcher.agent_path()?, &name).await;
    settle(&launcher, result).await
}

async fn settle<T>(launcher: &Arc<Launcher>, result: Result<T, CliError>) -> Result<T, String> {
    if let Err(CliError::ProfileMissing(_)) = &result {
        launcher.profile_vanished().await;
    }
    result.map_err(String::from)
}

#[tauri::command]
pub async fn enroll(
    app: AppHandle,
    launcher: LauncherState<'_>,
    form: EnrollForm,
) -> Result<String, String> {
    let launcher = launcher.inner().clone();
    let name = cli::enroll(&launcher.agent_path()?, &form).await?;
    launcher.note(&format!("Enrolled this machine as profile '{name}'"));
    launcher.refresh_profiles().await?;
    launcher.set_profile(Some(name.clone()));
    let _ = app.autolaunch().enable();
    notify::ask_permission_once(&app);
    launcher.start();
    Ok(name)
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    launcher: LauncherState<'_>,
    form: SettingsForm,
    start_at_login: bool,
) -> Result<ProfileDetails, String> {
    let launcher = launcher.inner().clone();
    let name = launcher
        .active_profile()
        .ok_or("This machine isn't set up yet.")?;
    let result = cli::save_settings(&launcher.agent_path()?, &name, &form).await;
    let details = settle(&launcher, result).await?;
    let autolaunch = app.autolaunch();
    let _ = if start_at_login {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    launcher.note("Settings saved");
    if launcher.status().is_running() {
        launcher.restart().await;
    }
    Ok(details)
}

#[tauri::command]
pub fn start_agent(launcher: LauncherState<'_>) {
    launcher.inner().start();
}

#[tauri::command]
pub async fn stop_agent(launcher: LauncherState<'_>) -> Result<(), String> {
    launcher.inner().clone().stop().await;
    Ok(())
}

#[tauri::command]
pub async fn restart_agent(launcher: LauncherState<'_>) -> Result<(), String> {
    launcher.inner().clone().restart().await;
    Ok(())
}

#[tauri::command]
pub async fn select_profile(launcher: LauncherState<'_>, name: String) -> Result<(), String> {
    let launcher = launcher.inner().clone();
    let profiles = launcher.refresh_profiles().await?;
    if !profiles.iter().any(|p| p.name == name) {
        return Err(format!("No profile named '{name}'."));
    }
    launcher.stop().await;
    launcher.set_profile(Some(name));
    launcher.start();
    Ok(())
}

#[tauri::command]
pub async fn decide(launcher: LauncherState<'_>, id: u64, approved: bool) -> Result<bool, String> {
    Ok(launcher.decide(id, approved).await)
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    launcher: LauncherState<'_>,
) -> Result<Option<String>, String> {
    updates::check(&app, launcher.inner()).await
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle, launcher: LauncherState<'_>) -> Result<(), String> {
    updates::install(&app, launcher.inner()).await
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn save_logs(launcher: LauncherState<'_>, path: String) -> Result<(), String> {
    let mut text = launcher.logs().join("\n");
    text.push('\n');
    std::fs::write(&path, text).map_err(|e| format!("Couldn't save the logs: {e}"))
}

#[tauri::command]
pub fn open_dashboard(app: AppHandle, launcher: LauncherState<'_>) -> Result<(), String> {
    let url = launcher
        .snapshot()
        .router_url
        .unwrap_or_else(|| DEFAULT_ROUTER_URL.to_string());
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
