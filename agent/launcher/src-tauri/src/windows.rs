use tauri::{AppHandle, Emitter, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

pub const MAIN: &str = "main";
pub const APPROVAL: &str = "approval";

fn bring_app_forward(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

pub fn show_main(app: &AppHandle, tab: Option<&str>) {
    bring_app_forward(app);
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(tab) = tab {
            let _ = window.emit_to(MAIN, "navigate", tab);
        }
    }
}

pub fn show_approval(app: &AppHandle) {
    bring_app_forward(app);
    if let Some(window) = app.get_webview_window(APPROVAL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, APPROVAL, WebviewUrl::App("index.html".into()))
        .title("Command approval")
        .inner_size(460.0, 520.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .center()
        .focused(true)
        .theme(Some(Theme::Dark))
        .build();
    if let Ok(window) = built {
        let _ = window.set_focus();
    }
}

pub fn approval_focused(app: &AppHandle) -> bool {
    app.get_webview_window(APPROVAL)
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false)
}
