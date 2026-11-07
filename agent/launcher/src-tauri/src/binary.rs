use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub const AGENT_OVERRIDE_ENV: &str = "FRW_AGENT_BIN";
const AGENT_NAME: &str = "frw-agent";
const MARKER: &str = "bundled.sha256";

pub fn agent_file_name() -> String {
    format!("{AGENT_NAME}{}", std::env::consts::EXE_SUFFIX)
}

pub fn bundled_agent() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("The app's folder could not be found")?;
    let path = dir.join(agent_file_name());
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!(
            "FileReadWrite's helper is missing from {}",
            dir.display()
        ))
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(hex::encode(Sha256::digest(&bytes)))
}

pub type Version = (u64, u64, u64);

pub fn parse_version(output: &str) -> Option<Version> {
    let word = output.split_whitespace().last()?;
    let mut parts = word.trim_start_matches('v').split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    Some((next()?, next()?, next()?))
}

fn agent_version(path: &Path) -> Option<Version> {
    let mut command = std::process::Command::new(path);
    command.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_version(&String::from_utf8_lossy(&output.stdout))
}

pub fn install_copy(bundled: &Path, bin_dir: &Path) -> Result<PathBuf, String> {
    install_copy_with(bundled, bin_dir, agent_version)
}

fn install_copy_with(
    bundled: &Path,
    bin_dir: &Path,
    version_of: impl Fn(&Path) -> Option<Version>,
) -> Result<PathBuf, String> {
    let target = bin_dir.join(agent_file_name());
    let marker = bin_dir.join(MARKER);
    let bundled_hash = sha256_file(bundled)?;
    let installed_hash = fs::read_to_string(&marker).unwrap_or_default();
    if target.is_file() && installed_hash.trim() == bundled_hash {
        return Ok(target);
    }
    if target.is_file()
        && let (Some(installed), Some(shipped)) = (version_of(&target), version_of(bundled))
        && installed >= shipped
    {
        fs::write(&marker, &bundled_hash).map_err(|e| e.to_string())?;
        return Ok(target);
    }
    fs::create_dir_all(bin_dir).map_err(|e| format!("{}: {e}", bin_dir.display()))?;
    let tmp = bin_dir.join(format!("{}.tmp", agent_file_name()));
    fs::copy(bundled, &tmp).map_err(|e| format!("Couldn't copy the helper: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &target).map_err(|e| format!("Couldn't install the helper: {e}"))?;
    fs::write(&marker, &bundled_hash).map_err(|e| e.to_string())?;
    Ok(target)
}

pub fn resolve(bin_dir: &Path) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os(AGENT_OVERRIDE_ENV) {
        let path = PathBuf::from(path);
        return if path.is_file() {
            Ok(path)
        } else {
            Err(format!(
                "{AGENT_OVERRIDE_ENV} points at a missing file: {}",
                path.display()
            ))
        };
    }
    install_copy(&bundled_agent()?, bin_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "frw-launcher-{tag}-{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn copy_is_made_once_and_kept_after_a_self_update() {
        let tmp = TempDir::new("copy");
        let bundled = tmp.0.join("bundled-agent");
        let bin = tmp.0.join("bin");
        fs::write(&bundled, b"v1").unwrap();
        let installed = install_copy(&bundled, &bin).unwrap();
        assert_eq!(fs::read(&installed).unwrap(), b"v1");

        fs::write(&installed, b"v1-self-updated").unwrap();
        install_copy(&bundled, &bin).unwrap();
        assert_eq!(fs::read(&installed).unwrap(), b"v1-self-updated");

        fs::write(&bundled, b"v2").unwrap();
        install_copy(&bundled, &bin).unwrap();
        assert_eq!(fs::read(&installed).unwrap(), b"v2");
    }

    fn content_version(path: &Path) -> Option<Version> {
        parse_version(&fs::read_to_string(path).ok()?)
    }

    #[test]
    fn a_newer_self_updated_agent_is_not_downgraded() {
        let tmp = TempDir::new("versions");
        let bundled = tmp.0.join("bundled-agent");
        let bin = tmp.0.join("bin");
        fs::write(&bundled, "frw-agent 1.0.1").unwrap();
        let installed = install_copy_with(&bundled, &bin, content_version).unwrap();

        fs::write(&installed, "frw-agent 1.0.4").unwrap();
        fs::write(&bundled, "frw-agent 1.0.2").unwrap();
        install_copy_with(&bundled, &bin, content_version).unwrap();
        assert_eq!(fs::read_to_string(&installed).unwrap(), "frw-agent 1.0.4");

        fs::write(&bundled, "frw-agent 1.1.0").unwrap();
        install_copy_with(&bundled, &bin, content_version).unwrap();
        assert_eq!(fs::read_to_string(&installed).unwrap(), "frw-agent 1.1.0");
    }

    #[test]
    fn version_output_parses() {
        assert_eq!(parse_version("frw-agent 1.0.1\n"), Some((1, 0, 1)));
        assert_eq!(parse_version("v2.10.0"), Some((2, 10, 0)));
        assert_eq!(parse_version("frw-agent"), None);
        assert_eq!(parse_version(""), None);
    }

    #[cfg(unix)]
    #[test]
    fn copy_is_executable() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = TempDir::new("exec");
        let bundled = tmp.0.join("bundled-agent");
        fs::write(&bundled, b"x").unwrap();
        let installed = install_copy(&bundled, &tmp.0.join("bin")).unwrap();
        assert_eq!(
            fs::metadata(installed).unwrap().permissions().mode() & 0o111,
            0o111
        );
    }
}
