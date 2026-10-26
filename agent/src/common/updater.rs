use crate::common::lib::curl;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::process::Command;

/// The compile-time target triple (e.g. "aarch64-apple-darwin"), injected by build.rs.
/// Must match the CI release asset suffix `agent-<triple>` so the router serves the right binary.
pub const TARGET: &str = env!("TARGET");

fn sha256_hex(path: &Path) -> std::io::Result<String> {
    let bytes = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

/// Download the target-matched binary from the router, verify its SHA-256,
/// atomically replace the running executable, and re-exec into the new version.
///
/// On success this never returns — the process image is replaced by `exec`.
pub fn apply_update(router_url: &str, token: &str, expected_sha: &str) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let tmp = exe.with_extension("new");
    let tmp_str = tmp.to_str().ok_or("temp path is not valid UTF-8")?;

    let url = format!(
        "{}/agent/update/download?target={}",
        router_url.trim_end_matches('/'),
        TARGET
    );

    // Reuse the existing curl helper. `-o` writes the body straight to disk, so
    // stdout stays empty (the helper's UTF-8 decode of empty stdout is fine here).
    curl(&[
        "-fsSL",
        "-H",
        &format!("authorization: Bearer {token}"),
        "-o",
        tmp_str,
        &url,
    ])?;

    let got = sha256_hex(&tmp).map_err(|e| e.to_string())?;
    if !got.eq_ignore_ascii_case(expected_sha) {
        let _ = fs::remove_file(&tmp);
        return Err(format!(
            "sha256 mismatch (expected {expected_sha}, got {got}); refusing to install"
        ));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }

    // Atomically swap the running executable for the downloaded binary.
    self_replace::self_replace(&tmp).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&tmp);

    log::info!("Binary replaced; re-executing into the new version");
    let args: Vec<String> = std::env::args().skip(1).collect();

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // exec replaces the current process image; only returns on failure.
        let err = Command::new(&exe).args(&args).exec();
        Err(format!("re-exec failed: {err}"))
    }
    #[cfg(not(unix))]
    {
        Command::new(&exe)
            .args(&args)
            .spawn()
            .map_err(|e| e.to_string())?;
        std::process::exit(0);
    }
}
