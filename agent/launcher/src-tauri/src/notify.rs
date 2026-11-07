use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn send(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

pub fn ask_permission_once(app: &AppHandle) {
    let notifications = app.notification();
    if !matches!(
        notifications.permission_state(),
        Ok(tauri_plugin_notification::PermissionState::Granted)
    ) {
        let _ = notifications.request_permission();
    }
}
