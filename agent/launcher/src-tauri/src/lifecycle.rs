use crate::protocol::{PROFILE_MISSING_EXIT_CODE, UPDATED_EXIT_CODE};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitOutcome {
    Stopped,
    Updated,
    NeedsAttention,
    ProfileMissing,
    Crashed,
}

pub fn classify_exit(code: Option<i32>, stop_requested: bool, saw_started: bool) -> ExitOutcome {
    if stop_requested {
        return ExitOutcome::Stopped;
    }
    match code {
        Some(UPDATED_EXIT_CODE) => ExitOutcome::Updated,
        Some(PROFILE_MISSING_EXIT_CODE) => ExitOutcome::ProfileMissing,
        Some(0) => ExitOutcome::Stopped,
        Some(1) if !saw_started => ExitOutcome::NeedsAttention,
        _ => ExitOutcome::Crashed,
    }
}

const BACKOFF_SECS: [u64; 5] = [1, 2, 5, 10, 30];
pub const STABLE_UPTIME: Duration = Duration::from_secs(60);

pub fn backoff_secs(attempt: usize) -> u64 {
    BACKOFF_SECS[attempt.min(BACKOFF_SECS.len() - 1)]
}

pub fn next_attempt(attempt: usize, uptime: Duration) -> usize {
    if uptime >= STABLE_UPTIME { 0 } else { attempt }
}

pub fn friendly_error(stderr_line: &str) -> String {
    let line = stderr_line.trim();
    for prefix in ["Setup failed: ", "Error: "] {
        if let Some(rest) = line.strip_prefix(prefix) {
            return rest.to_string();
        }
    }
    line.to_string()
}

pub fn last_meaningful_line(stderr: &str) -> String {
    stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(friendly_error)
        .unwrap_or_else(|| "FileReadWrite stopped without saying why.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_codes_map_to_the_launcher_reaction() {
        assert_eq!(classify_exit(Some(0), true, true), ExitOutcome::Stopped);
        assert_eq!(classify_exit(None, true, true), ExitOutcome::Stopped);
        assert_eq!(classify_exit(Some(75), false, true), ExitOutcome::Updated);
        assert_eq!(
            classify_exit(Some(78), false, false),
            ExitOutcome::ProfileMissing
        );
        assert_eq!(classify_exit(Some(0), false, true), ExitOutcome::Stopped);
        assert_eq!(
            classify_exit(Some(1), false, false),
            ExitOutcome::NeedsAttention
        );
        assert_eq!(classify_exit(Some(1), false, true), ExitOutcome::Crashed);
        assert_eq!(classify_exit(None, false, true), ExitOutcome::Crashed);
        assert_eq!(classify_exit(Some(101), false, false), ExitOutcome::Crashed);
    }

    #[test]
    fn backoff_grows_then_holds_at_thirty_seconds() {
        let delays: Vec<u64> = (0..7).map(backoff_secs).collect();
        assert_eq!(delays, vec![1, 2, 5, 10, 30, 30, 30]);
    }

    #[test]
    fn backoff_resets_after_a_stable_minute() {
        assert_eq!(next_attempt(4, Duration::from_secs(5)), 4);
        assert_eq!(next_attempt(4, Duration::from_secs(61)), 0);
    }

    #[test]
    fn stderr_lines_become_plain_messages() {
        assert_eq!(
            last_meaningful_line("noise\nSetup failed: Invalid or expired enrollment code\n\n"),
            "Invalid or expired enrollment code"
        );
        assert_eq!(
            last_meaningful_line("No profile named 'work'. Available: demo"),
            "No profile named 'work'. Available: demo"
        );
        assert_eq!(
            last_meaningful_line(""),
            "FileReadWrite stopped without saying why."
        );
    }
}
