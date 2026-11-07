mod binary;
mod cli;
mod commands;
mod launcher;
mod lifecycle;
mod notify;
mod prefs;
mod protocol;
mod tray;
mod updates;
mod windows;

use launcher::Launcher;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

pub const HIDDEN_FLAG: &str = "--hidden";

fn on_main_close(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else {
        return;
    };
    let mut saved = prefs::load(&dir);
    if saved.told_about_tray {
        return;
    }
    saved.told_about_tray = true;
    let _ = prefs::save(&dir, &saved);
    let place = if cfg!(target_os = "macos") {
        "menu bar"
    } else {
        "system tray"
    };
    notify::send(
        app,
        "FileReadWrite is still running",
        &format!("Find it in the {place}. Quit from there to stop it."),
    );
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_main(app, None);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_FLAG]),
        ))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            let agent = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .and_then(|dir| binary::resolve(&dir.join("bin")));
            let launcher = Launcher::new(handle.clone(), agent);
            app.manage(Arc::clone(&launcher));
            tray::create(&handle, &launcher.snapshot())?;
            updates::spawn_checks(handle.clone(), Arc::clone(&launcher));
            let hidden = std::env::args().any(|arg| arg == HIDDEN_FLAG);
            tauri::async_runtime::spawn(async move {
                launcher.boot(hidden).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            let WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            let app = window.app_handle().clone();
            match window.label() {
                windows::MAIN => {
                    api.prevent_close();
                    let _ = window.hide();
                    on_main_close(&app);
                }
                windows::APPROVAL => {
                    let launcher = app.state::<Arc<Launcher>>().inner().clone();
                    tauri::async_runtime::spawn(async move {
                        launcher.deny_all().await;
                    });
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_logs,
            commands::defaults,
            commands::get_profile,
            commands::enroll,
            commands::save_settings,
            commands::start_agent,
            commands::stop_agent,
            commands::restart_agent,
            commands::select_profile,
            commands::decide,
            commands::get_autostart,
            commands::save_logs,
            commands::open_dashboard,
            commands::check_app_update,
            commands::install_app_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the FileReadWrite launcher");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, code, .. } => {
            let launcher = app.state::<Arc<Launcher>>();
            if code.is_none() && !launcher.quitting.load(Ordering::SeqCst) {
                api.prevent_exit();
            }
        }
        RunEvent::Exit => {
            app.state::<Arc<Launcher>>().kill_now();
        }
        _ => {}
    });
}
