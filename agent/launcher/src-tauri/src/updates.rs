use crate::launcher::Launcher;
use crate::notify;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

const FIRST_CHECK: Duration = Duration::from_secs(30);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

pub fn spawn_checks(app: AppHandle, launcher: Arc<Launcher>) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            if let Err(message) = check(&app, &launcher).await {
                launcher.warn(&message);
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

pub async fn check(app: &AppHandle, launcher: &Arc<Launcher>) -> Result<Option<String>, String> {
    let found = app
        .updater()
        .map_err(|e| format!("Couldn't check for updates: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Couldn't check for updates: {e}"))?;
    let version = found.map(|update| update.version);
    let fresh = version.is_some() && launcher.app_update() != version;
    launcher.set_app_update(version.clone());
    if let (true, Some(next)) = (fresh, version.as_deref()) {
        launcher.note(&format!("FileReadWrite {next} is available"));
        notify::send(
            app,
            "Update available",
            &format!("FileReadWrite {next} is ready. Open FileReadWrite to install it."),
        );
    }
    Ok(version)
}

pub async fn install(app: &AppHandle, launcher: &Arc<Launcher>) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| format!("Couldn't check for updates: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Couldn't check for updates: {e}"))?
        .ok_or("FileReadWrite is already up to date.")?;
    launcher.note(&format!("Downloading FileReadWrite {}", update.version));
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Couldn't download the update: {e}"))?;
    let was_running = launcher.status().is_running();
    launcher.stop().await;
    launcher.quitting.store(true, Ordering::SeqCst);
    launcher.note(&format!("Installing FileReadWrite {}", update.version));
    if let Err(e) = update.install(bytes) {
        launcher.quitting.store(false, Ordering::SeqCst);
        if was_running {
            launcher.start();
        }
        return Err(format!("Couldn't install the update: {e}"));
    }
    app.restart();
}
