use dialoguer::Confirm;
use std::{
    fs,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::Duration,
};

use std::io::{IsTerminal, Write};

pub fn get_agent_dir() -> PathBuf {
    let base = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("file-read-write-agent");
    fs::create_dir_all(&base).ok();
    base
}

pub fn get_machine_name() -> String {
    Command::new("hostname")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .and_then(|out| {
            let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if name.is_empty() { None } else { Some(name) }
        })
        .unwrap_or_else(|| String::from("My machine"))
}

pub fn clear_terminal() {
    let mut out = std::io::stdout();
    if out.is_terminal() {
        // clear screen + scrollback, move cursor home
        let _ = write!(out, "\x1B[2J\x1B[3J\x1B[H");
        let _ = out.flush();
    }
}

// Top-level approval — picks the right dialog for the current platform.
// Returns true if the user approved, false if denied or timed out.
pub fn request_approval(preview: &str, timeout_sec: u64) -> bool {
    if cfg!(target_os = "macos") {
        return request_approval_mac(preview, timeout_sec);
    }
    if cfg!(windows)
        && let Some(approved) = request_approval_windows(preview, timeout_sec)
    {
        return approved;
    }
    if cfg!(target_os = "linux")
        && let Some(approved) = request_approval_gui(preview, timeout_sec)
    {
        return approved;
    }
    request_approval_tty(preview, timeout_sec)
}

// macOS native dialog via osascript.
fn request_approval_mac(preview: &str, timeout_sec: u64) -> bool {
    let script = format!(
        "on run argv\n\
         display dialog \"Approve running this command?\" & return & return & (item 1 of argv) \
         buttons {{\"Reject\", \"Approve\"}} \
         default button \"Reject\" with title \"MCP Command Approval\" \
         with icon caution giving up after {}\n\
         end run",
        timeout_sec
    );

    let output = Command::new("osascript")
        .args(["-e", &script, "--", preview])
        .output();

    match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).contains("button returned:Approve"),
        Err(_) => false,
    }
}

fn request_approval_windows(preview: &str, timeout_sec: u64) -> Option<bool> {
    let script = format!(
        "$r = (New-Object -ComObject WScript.Shell).Popup($env:FRW_APPROVAL_TEXT, {timeout_sec}, 'MCP Command Approval', 0x134); if ($r -eq 6) {{ exit 0 }} else {{ exit 1 }}"
    );
    let text = format!("Approve running this command?\n\n{preview}");
    run_approval_proc(
        "powershell",
        &["-NoProfile", "-NonInteractive", "-Command", &script],
        &[("FRW_APPROVAL_TEXT", &text)],
        timeout_sec,
    )
}

// Linux GUI dialog — tries zenity first, then kdialog.
// Returns Some(true/false) if a GUI tool was available, None if none found.
fn request_approval_gui(preview: &str, timeout_sec: u64) -> Option<bool> {
    if std::env::var("DISPLAY").is_err() && std::env::var("WAYLAND_DISPLAY").is_err() {
        return None; // no display, skip GUI
    }

    let title = "MCP Agent - approve command";
    let text = format!("Approve running this command?\n\n{}", preview);

    // Try zenity first
    let zenity = run_approval_proc(
        "zenity",
        &[
            "--question",
            "--no-markup",
            &format!("--title={}", title),
            &format!("--text={}", text),
            "--width=460",
            "--ok-label=Approve",
            "--cancel-label=Deny",
        ],
        &[],
        timeout_sec,
    );
    if zenity.is_some() {
        return zenity;
    }

    // Fallback to kdialog
    run_approval_proc(
        "kdialog",
        &["--yesno", &text, "--title", title],
        &[],
        timeout_sec,
    )
}

// Spawns a dialog subprocess. Returns:
// - Some(true)  — user approved (exit 0)
// - Some(false) — user denied or timed out
// - None        — binary not found (ENOENT), try next option
fn run_approval_proc(
    cmd: &str,
    args: &[&str],
    envs: &[(&str, &str)],
    timeout_sec: u64,
) -> Option<bool> {
    let mut child = match Command::new(cmd)
        .args(args)
        .envs(envs.iter().copied())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return None, // binary missing
        Err(_) => return Some(false),
    };

    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_sec);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status.success()),
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Some(false); // timed out → deny
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(_) => return Some(false),
        }
    }
}

fn request_approval_tty(preview: &str, timeout_sec: u64) -> bool {
    use std::io::IsTerminal;
    // No interactive terminal to prompt on (headless / background service):
    // deny fast instead of blocking until the timeout, which would otherwise
    // hold a worker and starve the socket.io client into a disconnect.
    if !std::io::stdin().is_terminal() {
        log::warn!("Command approval requested but no interactive terminal is attached; denying");
        return false;
    }
    let prompt = format!("Approve running this command?\n\n{}", preview);
    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let result = Confirm::new()
            .with_prompt(prompt)
            .default(false)
            .show_default(false)
            .interact_opt()
            .ok()
            .flatten()
            .unwrap_or(false);
        let _ = tx.send(result);
    });

    rx.recv_timeout(Duration::from_secs(timeout_sec))
        .unwrap_or(false)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

pub fn unix_secs_to_iso(secs: u64) -> String {
    let secs = secs as i64;
    let mut remaining = if secs >= 0 { secs } else { 0 };
    let days = remaining / 86400;
    remaining %= 86400;
    let hours = remaining / 3600;
    remaining %= 3600;
    let minutes = remaining / 60;
    let seconds = remaining % 60;

    let mut y = 1970i64;
    let mut d = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if d < md {
            m = i + 1;
            break;
        }
        d -= md;
    }
    if m == 0 {
        m = 12;
    }
    let day = d + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, day, hours, minutes, seconds
    )
}

pub fn default_ignore_set() -> std::collections::HashSet<&'static str> {
    std::collections::HashSet::from([
        "node_modules",
        ".git",
        "dist",
        "build",
        "out",
        "coverage",
        ".next",
        ".nuxt",
        ".svelte-kit",
        ".vercel",
        ".output",
        ".cache",
        ".turbo",
        "__pycache__",
        ".venv",
        "venv",
        "vendor",
        "target",
        ".idea",
        ".gradle",
    ])
}

pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

fn http_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .provider(ureq::tls::TlsProvider::NativeTls)
                .build(),
        )
        .http_status_as_error(false)
        .timeout_connect(Some(std::time::Duration::from_secs(15)))
        .user_agent(concat!("frw-agent/", env!("CARGO_PKG_VERSION")))
        .build()
        .into()
}

pub fn post_json(url: &str, body: &serde_json::Value) -> Result<HttpResponse, String> {
    let mut response = http_agent()
        .post(url)
        .header("content-type", "application/json")
        .send(body.to_string())
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("could not read the response: {e}"))?;
    Ok(HttpResponse { status, body })
}

pub fn download(url: &str, bearer: &str, dest: &std::path::Path) -> Result<(), String> {
    let mut response = http_agent()
        .get(url)
        .header("authorization", format!("Bearer {bearer}"))
        .call()
        .map_err(|e| e.to_string())?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.body_mut().read_to_string().unwrap_or_default();
        return Err(format!(
            "download failed (HTTP {}): {}",
            status.as_u16(),
            detail.trim()
        ));
    }
    let mut file = std::fs::File::create(dest)
        .map_err(|e| format!("could not create {}: {e}", dest.display()))?;
    std::io::copy(&mut response.body_mut().as_reader(), &mut file)
        .map_err(|e| format!("download interrupted: {e}"))?;
    file.sync_all().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{download, post_json};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    fn serve_once(response: &'static str) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let n = stream.read(&mut buf).unwrap();
                request.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&request);
                if let Some(end) = text.find("\r\n\r\n") {
                    let length = text[..end]
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length || n == 0 {
                        break;
                    }
                }
            }
            stream.write_all(response.as_bytes()).unwrap();
            tx.send(String::from_utf8_lossy(&request).to_string())
                .unwrap();
        });
        (url, rx)
    }

    #[test]
    fn download_sends_the_token_and_writes_the_body() {
        let (url, request) =
            serve_once("HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nbinary");
        let dest = std::env::temp_dir().join(format!("frw-download-{}", std::process::id()));
        download(&format!("{url}/agent/update/download"), "tok123", &dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"binary");
        assert!(
            request
                .recv()
                .unwrap()
                .to_ascii_lowercase()
                .contains("authorization: bearer tok123")
        );
        std::fs::remove_file(dest).unwrap();
    }

    #[test]
    fn download_reports_http_errors() {
        let (url, _request) = serve_once(
            "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nno binary",
        );
        let dest = std::env::temp_dir().join(format!("frw-download-404-{}", std::process::id()));
        let err = download(&url, "tok", &dest).unwrap_err();
        assert_eq!(err, "download failed (HTTP 404): no binary");
        assert!(!dest.exists());
    }

    #[test]
    fn post_json_returns_status_and_body_for_any_status() {
        let (url, request) = serve_once(
            "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 15\r\nConnection: close\r\n\r\n{\"message\":\"x\"}",
        );
        let response = post_json(&url, &serde_json::json!({"code": "abc"})).unwrap();
        assert_eq!(response.status, 400);
        assert_eq!(response.body, "{\"message\":\"x\"}");
        let sent = request.recv().unwrap();
        assert!(
            sent.to_ascii_lowercase()
                .contains("content-type: application/json")
        );
        assert!(sent.ends_with("{\"code\":\"abc\"}"));
    }

    #[test]
    fn unreachable_hosts_are_errors() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        assert!(post_json(&url, &serde_json::json!({})).is_err());
    }
}
