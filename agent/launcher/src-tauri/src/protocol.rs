use serde::Deserialize;
use serde_json::json;

pub const UPDATED_EXIT_CODE: i32 = 75;
pub const PROFILE_MISSING_EXIT_CODE: i32 = 78;

#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AgentEvent {
    Started {
        version: String,
        profile: String,
    },
    Connected,
    Disconnected {
        reason: String,
    },
    Approval {
        id: u64,
        exe: String,
        args: Vec<String>,
        cwd: String,
        timeout_sec: u64,
    },
    Update {
        from: String,
        to: String,
    },
    Stopping,
    #[serde(other)]
    Unknown,
}

pub fn parse_event(line: &str) -> Option<AgentEvent> {
    serde_json::from_str(line.trim()).ok()
}

pub fn decision_line(id: u64, approved: bool) -> String {
    format!(
        "{}\n",
        json!({ "type": "decision", "id": id, "approved": approved })
    )
}

const RISKY_PROGRAMS: &[&str] = &[
    "node",
    "npx",
    "npm",
    "yarn",
    "pnpm",
    "bun",
    "bunx",
    "deno",
    "python",
    "python3",
    "ruby",
    "perl",
    "php",
    "sh",
    "bash",
    "zsh",
    "fish",
    "pwsh",
    "powershell",
    "cmd",
];

pub fn program_name(exe: &str) -> String {
    let base = exe.rsplit(['/', '\\']).next().unwrap_or(exe);
    let lower = base.to_ascii_lowercase();
    for suffix in [".exe", ".cmd", ".bat"] {
        if let Some(stripped) = lower.strip_suffix(suffix) {
            return stripped.to_string();
        }
    }
    lower
}

pub fn is_risky_program(exe: &str) -> bool {
    RISKY_PROGRAMS.contains(&program_name(exe).as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_every_event_from_the_samples() {
        let cases = [
            (
                r#"{"type":"started","version":"1.0.1","profile":"demo"}"#,
                AgentEvent::Started {
                    version: "1.0.1".into(),
                    profile: "demo".into(),
                },
            ),
            (r#"{"type":"connected"}"#, AgentEvent::Connected),
            (
                r#"{"type":"disconnected","reason":"EngineIO Error"}"#,
                AgentEvent::Disconnected {
                    reason: "EngineIO Error".into(),
                },
            ),
            (
                r#"{"type":"approval","id":2,"exe":"git","args":["log","--oneline","-n","5"],"cwd":"/Users/me/project","timeoutSec":90}"#,
                AgentEvent::Approval {
                    id: 2,
                    exe: "git".into(),
                    args: vec!["log".into(), "--oneline".into(), "-n".into(), "5".into()],
                    cwd: "/Users/me/project".into(),
                    timeout_sec: 90,
                },
            ),
            (
                r#"{"type":"update","from":"1.0.1","to":"1.0.2"}"#,
                AgentEvent::Update {
                    from: "1.0.1".into(),
                    to: "1.0.2".into(),
                },
            ),
            (r#"{"type":"stopping"}"#, AgentEvent::Stopping),
        ];
        for (line, expected) in cases {
            assert_eq!(parse_event(line), Some(expected), "{line}");
        }
    }

    #[test]
    fn unknown_types_are_tolerated_and_junk_is_dropped() {
        assert_eq!(
            parse_event(r#"{"type":"heartbeat","n":1}"#),
            Some(AgentEvent::Unknown)
        );
        assert_eq!(parse_event("not json"), None);
        assert_eq!(parse_event(r#"{"type":"approval","id":1}"#), None);
    }

    #[test]
    fn decisions_are_single_json_lines() {
        assert_eq!(
            decision_line(3, false),
            "{\"approved\":false,\"id\":3,\"type\":\"decision\"}\n"
        );
    }

    #[test]
    fn risky_programs_are_recognised_by_name() {
        assert!(is_risky_program("npx"));
        assert!(is_risky_program("/usr/local/bin/node"));
        assert!(is_risky_program("C:\\Program Files\\nodejs\\NPM.CMD"));
        assert!(!is_risky_program("git"));
        assert!(!is_risky_program("nodemon"));
    }
}
