use std::sync::LazyLock;

static LOGIN_PATH: LazyLock<Option<String>> = LazyLock::new(resolve);

pub fn preload() {
    std::thread::spawn(|| LazyLock::force(&LOGIN_PATH));
}

pub fn login_path() -> Option<&'static str> {
    LOGIN_PATH.as_deref()
}

#[cfg(unix)]
fn resolve() -> Option<String> {
    let shell_path = login_shell_path()?;
    let current = std::env::var("PATH").unwrap_or_default();
    let merged = merge_paths(&shell_path, &current);
    (merged != current).then_some(merged)
}

#[cfg(not(unix))]
fn resolve() -> Option<String> {
    None
}

#[cfg(unix)]
const MARKER: &str = "__FRW_PATH__";

#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::Duration;

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| s.starts_with('/'))
        .unwrap_or_else(|| "/bin/sh".to_string());
    let script = format!("printf '{MARKER}%s{MARKER}' \"$PATH\"");
    let mut child = Command::new(&shell)
        .args(["-ilc", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.read_to_string(&mut out);
        let _ = tx.send(out);
    });
    let output = rx.recv_timeout(Duration::from_secs(3));
    if output.is_err() {
        let _ = child.kill();
    }
    let _ = child.wait();
    extract(&output.ok()?)
}

#[cfg(unix)]
fn extract(output: &str) -> Option<String> {
    let start = output.find(MARKER)? + MARKER.len();
    let len = output[start..].find(MARKER)?;
    let path = output[start..start + len].trim();
    (!path.is_empty()).then(|| path.to_string())
}

#[cfg(unix)]
fn merge_paths(first: &str, second: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    first
        .split(':')
        .chain(second.split(':'))
        .filter(|dir| !dir.is_empty() && seen.insert(*dir))
        .collect::<Vec<_>>()
        .join(":")
}

#[cfg(all(test, unix))]
mod tests {
    use super::{extract, merge_paths};

    #[test]
    fn finds_the_path_between_markers_despite_shell_noise() {
        let out = "Welcome!\n__FRW_PATH__/opt/homebrew/bin:/usr/bin__FRW_PATH__";
        assert_eq!(extract(out).as_deref(), Some("/opt/homebrew/bin:/usr/bin"));
        assert_eq!(extract("no markers here"), None);
        assert_eq!(extract("__FRW_PATH____FRW_PATH__"), None);
    }

    #[test]
    fn shell_entries_come_first_without_duplicates() {
        assert_eq!(
            merge_paths("/nvm/bin:/usr/bin", "/usr/bin:/bin::/usr/sbin"),
            "/nvm/bin:/usr/bin:/bin:/usr/sbin"
        );
    }
}
