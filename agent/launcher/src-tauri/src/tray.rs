use crate::launcher::{Launcher, Snapshot, Status};
use crate::windows;
use std::sync::Arc;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const TRAY_ID: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dot {
    Connected,
    Working,
    Idle,
    Error,
}

pub fn dot_for(status: &Status, pending: usize) -> Dot {
    if pending > 0 {
        return Dot::Error;
    }
    match status {
        Status::Connected => Dot::Connected,
        Status::Connecting
        | Status::Reconnecting { .. }
        | Status::Updating { .. }
        | Status::Restarting { .. } => Dot::Working,
        Status::Stopped | Status::Setup => Dot::Idle,
        Status::Attention { .. } => Dot::Error,
    }
}

pub fn status_line(status: &Status, profile: Option<&str>) -> String {
    let word = match status {
        Status::Setup => "Not set up",
        Status::Stopped => "Stopped",
        Status::Connecting => "Connecting…",
        Status::Connected => "Connected",
        Status::Reconnecting { .. } => "Reconnecting…",
        Status::Updating { .. } => "Updating",
        Status::Restarting { .. } => "Restarting…",
        Status::Attention { .. } => "Needs attention",
    };
    match profile {
        Some(profile) => format!("{word} — {profile}"),
        None => word.to_string(),
    }
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn dot_rgba(dot: Dot) -> [u8; 4] {
    match dot {
        Dot::Connected => [63, 184, 164, 255],
        Dot::Working => [203, 190, 255, 255],
        Dot::Idle => [157, 167, 186, 255],
        Dot::Error => [255, 180, 171, 255],
    }
}

pub fn draw_dot(rgba: &mut [u8], width: u32, height: u32, color: [u8; 4], hollow: bool) {
    let radius = (width.min(height) as f32) * 0.19;
    let cx = width as f32 - radius - 1.0;
    let cy = height as f32 - radius - 1.0;
    let gap = radius + (width as f32 * 0.07).max(1.5);
    let ring = (width as f32 * 0.07).max(1.5);
    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let distance = (dx * dx + dy * dy).sqrt();
            let i = ((y * width + x) * 4) as usize;
            if distance <= radius && (!hollow || distance >= radius - ring) {
                rgba[i..i + 4].copy_from_slice(&color);
            } else if distance <= gap {
                rgba[i + 3] = 0;
            }
        }
    }
}

fn icon_for(dot: Dot) -> Option<Image<'static>> {
    #[cfg(target_os = "macos")]
    let (bytes, color, hollow) = (
        include_bytes!("../icons/tray-template.png").as_slice(),
        [0, 0, 0, 255],
        dot != Dot::Connected,
    );
    #[cfg(not(target_os = "macos"))]
    let (bytes, color, hollow) = (
        include_bytes!("../icons/32x32.png").as_slice(),
        dot_rgba(dot),
        false,
    );
    let base = Image::from_bytes(bytes).ok()?;
    let (width, height) = (base.width(), base.height());
    let mut rgba = base.rgba().to_vec();
    draw_dot(&mut rgba, width, height, color, hollow);
    Some(Image::new_owned(rgba, width, height))
}

fn build_menu(app: &AppHandle, snapshot: &Snapshot) -> tauri::Result<Menu<Wry>> {
    let status = MenuItem::with_id(
        app,
        "status",
        status_line(&snapshot.status, snapshot.profile.as_deref()),
        false,
        None::<&str>,
    )?;
    let menu = Menu::new(app)?;
    menu.append(&status)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let waiting = snapshot.approvals.len();
    if waiting > 0 {
        let label = if waiting == 1 {
            "Review 1 waiting command…".to_string()
        } else {
            format!("Review {waiting} waiting commands…")
        };
        menu.append(&MenuItem::with_id(
            app,
            "review",
            label,
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Open FileReadWrite",
        true,
        None::<&str>,
    )?)?;
    if snapshot.profile.is_some() {
        let running = snapshot.status.is_running();
        menu.append(&MenuItem::with_id(
            app,
            "toggle",
            if running { "Stop" } else { "Start" },
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if let Some(version) = &snapshot.app_update {
        menu.append(&MenuItem::with_id(
            app,
            "update",
            format!("Install FileReadWrite {version}…"),
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&MenuItem::with_id(
        app,
        "settings",
        "Settings…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "logs",
        "Logs…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "quit",
        "Quit FileReadWrite",
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
}

fn launcher(app: &AppHandle) -> Arc<Launcher> {
    app.state::<Arc<Launcher>>().inner().clone()
}

pub fn quit(app: &AppHandle) {
    let waiting = launcher(app).approvals().len();
    if waiting == 0 {
        do_quit(app.clone());
        return;
    }
    let noun = if waiting == 1 {
        "1 command is waiting for approval and will be denied.".to_string()
    } else {
        format!("{waiting} commands are waiting for approval and will be denied.")
    };
    let handle = app.clone();
    app.dialog()
        .message(format!(
            "{noun} AI apps won't reach this machine until you open FileReadWrite again."
        ))
        .title("Quit FileReadWrite?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Quit".into(),
            "Cancel".into(),
        ))
        .show(move |confirmed| {
            if confirmed {
                do_quit(handle);
            }
        });
}

fn do_quit(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let launcher = launcher(&app);
        launcher
            .quitting
            .store(true, std::sync::atomic::Ordering::SeqCst);
        launcher.deny_all().await;
        launcher.stop().await;
        app.exit(0);
    });
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "review" => windows::show_approval(app),
        "open" | "update" => windows::show_main(app, Some("status")),
        "settings" => windows::show_main(app, Some("settings")),
        "logs" => windows::show_main(app, Some("logs")),
        "toggle" => {
            let launcher = launcher(app);
            tauri::async_runtime::spawn(async move {
                if launcher.status().is_running() {
                    launcher.stop().await;
                } else {
                    launcher.start();
                }
            });
        }
        "quit" => quit(app),
        _ => {}
    }
}

pub fn create(app: &AppHandle, snapshot: &Snapshot) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&build_menu(app, snapshot)?)
        .tooltip(status_line(&snapshot.status, snapshot.profile.as_deref()))
        .icon_as_template(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "windows")
                && let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
            {
                windows::show_main(tray.app_handle(), None);
            }
        });
    if cfg!(target_os = "windows") {
        builder = builder.show_menu_on_left_click(false);
    }
    if let Some(icon) = icon_for(dot_for(&snapshot.status, snapshot.approvals.len())) {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

pub fn refresh(app: &AppHandle, snapshot: &Snapshot) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app, snapshot) {
        let _ = tray.set_menu(Some(menu));
    }
    let _ = tray.set_tooltip(Some(status_line(
        &snapshot.status,
        snapshot.profile.as_deref(),
    )));
    if let Some(icon) = icon_for(dot_for(&snapshot.status, snapshot.approvals.len())) {
        let _ = tray.set_icon(Some(icon));
        #[cfg(target_os = "macos")]
        let _ = tray.set_icon_as_template(true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_approvals_win_over_status_colour() {
        assert_eq!(dot_for(&Status::Connected, 0), Dot::Connected);
        assert_eq!(dot_for(&Status::Connected, 1), Dot::Error);
        assert_eq!(dot_for(&Status::Restarting { seconds: 2 }, 0), Dot::Working);
        assert_eq!(dot_for(&Status::Stopped, 0), Dot::Idle);
        assert_eq!(
            dot_for(
                &Status::Attention {
                    message: "x".into()
                },
                0
            ),
            Dot::Error
        );
    }

    #[test]
    fn status_line_names_state_and_profile() {
        assert_eq!(
            status_line(&Status::Connected, Some("personal")),
            "Connected — personal"
        );
        assert_eq!(status_line(&Status::Setup, None), "Not set up");
    }

    #[test]
    fn dot_is_drawn_bottom_right_with_a_clear_gap() {
        let (w, h) = (32u32, 32u32);
        let mut rgba = vec![255u8; (w * h * 4) as usize];
        draw_dot(&mut rgba, w, h, [1, 2, 3, 255], false);
        let px = |x: u32, y: u32| {
            let i = ((y * w + x) * 4) as usize;
            [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
        };
        assert_eq!(px(26, 26), [1, 2, 3, 255]);
        assert_eq!(px(2, 2), [255, 255, 255, 255]);
        assert_eq!(px(18, 26)[3], 0);
    }

    #[test]
    fn colours_match_the_status_tokens() {
        assert_eq!(dot_rgba(Dot::Connected), [63, 184, 164, 255]);
        assert_eq!(dot_rgba(Dot::Error), [255, 180, 171, 255]);
    }
}
