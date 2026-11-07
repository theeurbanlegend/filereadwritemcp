use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    #[serde(default)]
    pub active_profile: Option<String>,
    #[serde(default)]
    pub told_about_tray: bool,
}

pub fn path(config_dir: &Path) -> PathBuf {
    config_dir.join("launcher.json")
}

pub fn load(config_dir: &Path) -> Prefs {
    fs::read_to_string(path(config_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(config_dir: &Path, prefs: &Prefs) -> Result<(), String> {
    fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let tmp = config_dir.join("launcher.json.tmp");
    let text = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path(config_dir)).map_err(|e| e.to_string())
}

pub fn pick_profile(saved: Option<&str>, available: &[String]) -> Option<String> {
    saved
        .filter(|name| available.iter().any(|a| a == name))
        .map(str::to_string)
        .or_else(|| available.first().cloned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_profile_wins_when_it_still_exists() {
        let available = vec!["home".to_string(), "work".to_string()];
        assert_eq!(pick_profile(Some("work"), &available), Some("work".into()));
        assert_eq!(pick_profile(Some("gone"), &available), Some("home".into()));
        assert_eq!(pick_profile(None, &available), Some("home".into()));
        assert_eq!(pick_profile(Some("work"), &[]), None);
    }

    #[test]
    fn prefs_round_trip_and_missing_file_is_default() {
        let dir = std::env::temp_dir().join(format!("frw-prefs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(load(&dir), Prefs::default());
        let prefs = Prefs {
            active_profile: Some("work".into()),
            told_about_tray: true,
        };
        save(&dir, &prefs).unwrap();
        assert_eq!(load(&dir), prefs);
        let _ = fs::remove_dir_all(&dir);
    }
}
