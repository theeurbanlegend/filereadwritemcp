use crate::cli::{self, ProfileSummary};
use crate::lifecycle::{self, ExitOutcome};
use crate::protocol::{self, AgentEvent};
use crate::{notify, prefs, tray, windows};
use serde::Serialize;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::watch;

pub const LOG_CAPACITY: usize = 5000;
const STDERR_TAIL: usize = 20;
const OFFLINE_NOTICE_AFTER: Duration = Duration::from_secs(30);

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Status {
    Setup,
    Stopped,
    Connecting,
    Connected,
    Reconnecting { reason: String },
    Updating { to: String },
    Restarting { seconds: u64 },
    Attention { message: String },
}

impl Status {
    pub fn is_running(&self) -> bool {
        matches!(
            self,
            Status::Connecting
                | Status::Connected
                | Status::Reconnecting { .. }
                | Status::Updating { .. }
                | Status::Restarting { .. }
        )
    }

    fn is_outage(&self) -> bool {
        matches!(
            self,
            Status::Reconnecting { .. } | Status::Restarting { .. }
        )
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub id: u64,
    pub exe: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub timeout_sec: u64,
    pub received_at_ms: u64,
    pub risky: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub status: Status,
    pub profile: Option<String>,
    pub profiles: Vec<ProfileSummary>,
    pub version: Option<String>,
    pub approvals: Vec<PendingApproval>,
    pub router_url: Option<String>,
    pub app_version: String,
    pub app_update: Option<String>,
}

struct Run {
    generation: u64,
    stop: watch::Sender<bool>,
    task: JoinHandle<()>,
}

struct Inner {
    status: Status,
    profile: Option<String>,
    profiles: Vec<ProfileSummary>,
    version: Option<String>,
    approvals: Vec<PendingApproval>,
    logs: VecDeque<String>,
    run: Option<Run>,
    generation: u64,
    pid: Option<u32>,
    outage: u64,
    update_to: Option<String>,
    app_update: Option<String>,
}

pub struct Launcher {
    app: AppHandle,
    agent: Result<PathBuf, String>,
    inner: Mutex<Inner>,
    stdin: tokio::sync::Mutex<Option<ChildStdin>>,
    pub quitting: AtomicBool,
}

enum RunResult {
    SpawnFailed(String),
    Exited {
        code: Option<i32>,
        stop_requested: bool,
        saw_started: bool,
        stderr_tail: String,
    },
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn utc_stamp(epoch_secs: u64) -> String {
    let days = (epoch_secs / 86_400) as i64;
    let rem = epoch_secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3_600,
        (rem / 60) % 60,
        rem % 60
    )
}

pub fn launcher_log_line(level: &str, message: &str) -> String {
    format!(
        "[{} {level:<5} launcher] {message}",
        utc_stamp(now_ms() / 1_000)
    )
}

async fn terminate(child: &mut Child) -> std::io::Result<ExitStatus> {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        if let Ok(status) = tokio::time::timeout(Duration::from_secs(5), child.wait()).await {
            return status;
        }
    }
    child.kill().await?;
    child.wait().await
}

impl Launcher {
    pub fn new(app: AppHandle, agent: Result<PathBuf, String>) -> Arc<Self> {
        Arc::new(Self {
            app,
            agent,
            inner: Mutex::new(Inner {
                status: Status::Stopped,
                profile: None,
                profiles: Vec::new(),
                version: None,
                approvals: Vec::new(),
                logs: VecDeque::with_capacity(LOG_CAPACITY),
                run: None,
                generation: 0,
                pid: None,
                outage: 0,
                update_to: None,
                app_update: None,
            }),
            stdin: tokio::sync::Mutex::new(None),
            quitting: AtomicBool::new(false),
        })
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn agent_path(&self) -> Result<PathBuf, String> {
        self.agent.clone()
    }

    pub fn snapshot(&self) -> Snapshot {
        let inner = self.lock();
        let router_url = inner.profile.as_ref().and_then(|name| {
            inner
                .profiles
                .iter()
                .find(|p| &p.name == name)
                .map(|p| p.router_url.clone())
        });
        Snapshot {
            status: inner.status.clone(),
            profile: inner.profile.clone(),
            profiles: inner.profiles.clone(),
            version: inner.version.clone(),
            approvals: inner.approvals.clone(),
            router_url,
            app_version: self.app.package_info().version.to_string(),
            app_update: inner.app_update.clone(),
        }
    }

    pub fn app_update(&self) -> Option<String> {
        self.lock().app_update.clone()
    }

    pub fn set_app_update(&self, version: Option<String>) {
        {
            let mut inner = self.lock();
            if inner.app_update == version {
                return;
            }
            inner.app_update = version;
        }
        self.publish();
    }

    pub fn warn(&self, message: &str) {
        self.push_log(launcher_log_line("WARN", message));
    }

    pub fn status(&self) -> Status {
        self.lock().status.clone()
    }

    pub fn active_profile(&self) -> Option<String> {
        self.lock().profile.clone()
    }

    pub fn approvals(&self) -> Vec<PendingApproval> {
        self.lock().approvals.clone()
    }

    pub fn publish(&self) {
        let snapshot = self.snapshot();
        let _ = self.app.emit("snapshot", &snapshot);
        tray::refresh(&self.app, &snapshot);
    }

    pub fn set_status(self: &Arc<Self>, status: Status) {
        let watch_outage = {
            let mut inner = self.lock();
            if inner.status == status {
                return;
            }
            let was_outage = inner.status.is_outage();
            inner.status = status.clone();
            if status.is_outage() && !was_outage {
                inner.outage += 1;
                Some(inner.outage)
            } else {
                if !status.is_outage() {
                    inner.outage += 1;
                }
                None
            }
        };
        self.publish();
        if let Some(outage) = watch_outage {
            let me = Arc::clone(self);
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(OFFLINE_NOTICE_AFTER).await;
                let still_out = {
                    let inner = me.lock();
                    inner.outage == outage && inner.status.is_outage()
                };
                if still_out {
                    notify::send(
                        &me.app,
                        "FileReadWrite is offline",
                        "AI apps can't reach this machine. It'll keep trying to reconnect.",
                    );
                }
            });
        }
    }

    pub fn push_log(&self, line: String) {
        {
            let mut inner = self.lock();
            if inner.logs.len() == LOG_CAPACITY {
                inner.logs.pop_front();
            }
            inner.logs.push_back(line.clone());
        }
        let _ = self.app.emit("log", line);
    }

    pub fn note(&self, message: &str) {
        self.push_log(launcher_log_line("INFO", message));
    }

    pub fn logs(&self) -> Vec<String> {
        self.lock().logs.iter().cloned().collect()
    }

    pub async fn refresh_profiles(&self) -> Result<Vec<ProfileSummary>, String> {
        let profiles = cli::list_profiles(&self.agent_path()?).await?;
        self.lock().profiles = profiles.clone();
        self.publish();
        Ok(profiles)
    }

    pub fn set_profile(&self, name: Option<String>) {
        let mut inner = self.lock();
        inner.profile = name.clone();
        if name.is_none() {
            inner.status = Status::Setup;
        }
        drop(inner);
        if let Ok(dir) = self.app.path().app_config_dir() {
            let mut saved = prefs::load(&dir);
            saved.active_profile = name;
            let _ = prefs::save(&dir, &saved);
        }
        self.publish();
    }

    pub async fn boot(self: &Arc<Self>, hidden: bool) {
        let profiles = match self.refresh_profiles().await {
            Ok(profiles) => profiles,
            Err(message) => {
                self.set_status(Status::Attention { message });
                windows::show_main(&self.app, None);
                return;
            }
        };
        let names: Vec<String> = profiles.into_iter().map(|p| p.name).collect();
        let saved = self
            .app
            .path()
            .app_config_dir()
            .map(|dir| prefs::load(&dir))
            .unwrap_or_default();
        match prefs::pick_profile(saved.active_profile.as_deref(), &names) {
            Some(name) => {
                self.set_profile(Some(name));
                self.start();
                if !hidden {
                    windows::show_main(&self.app, None);
                }
            }
            None => {
                self.set_profile(None);
                windows::show_main(&self.app, None);
            }
        }
    }

    pub fn start(self: &Arc<Self>) {
        let Some(profile) = self.active_profile() else {
            self.set_status(Status::Setup);
            return;
        };
        let agent = match self.agent_path() {
            Ok(agent) => agent,
            Err(message) => {
                self.set_status(Status::Attention { message });
                return;
            }
        };
        let mut inner = self.lock();
        if inner.run.is_some() {
            return;
        }
        inner.generation += 1;
        let generation = inner.generation;
        let (stop, stop_rx) = watch::channel(false);
        let me = Arc::clone(self);
        let task = tauri::async_runtime::spawn(async move {
            me.run_loop(generation, agent, profile, stop_rx).await;
        });
        inner.run = Some(Run {
            generation,
            stop,
            task,
        });
    }

    pub async fn stop(self: &Arc<Self>) {
        let run = self.lock().run.take();
        if let Some(run) = run {
            let _ = run.stop.send(true);
            let _ = tokio::time::timeout(Duration::from_secs(15), run.task).await;
        }
        if self.status().is_running() {
            self.set_status(Status::Stopped);
        }
    }

    pub async fn restart(self: &Arc<Self>) {
        self.stop().await;
        self.start();
    }

    pub fn kill_now(&self) {
        #[cfg(unix)]
        if let Some(pid) = self.lock().pid {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
        }
    }

    async fn run_loop(
        self: Arc<Self>,
        generation: u64,
        agent: PathBuf,
        profile: String,
        mut stop_rx: watch::Receiver<bool>,
    ) {
        let mut attempt = 0usize;
        let mut vanished = false;
        loop {
            if *stop_rx.borrow() {
                self.set_status(Status::Stopped);
                break;
            }
            if !matches!(self.status(), Status::Updating { .. }) {
                self.set_status(Status::Connecting);
            }
            let started_at = Instant::now();
            match self.run_once(&agent, &profile, &mut stop_rx).await {
                RunResult::SpawnFailed(message) => {
                    self.note(&message);
                    self.set_status(Status::Attention { message });
                    self.notify_attention();
                    break;
                }
                RunResult::Exited {
                    code,
                    stop_requested,
                    saw_started,
                    stderr_tail,
                } => {
                    self.note(&match code {
                        Some(code) => format!("FileReadWrite exited with code {code}"),
                        None => "FileReadWrite was stopped by a signal".to_string(),
                    });
                    match lifecycle::classify_exit(code, stop_requested, saw_started) {
                        ExitOutcome::Stopped => {
                            self.set_status(Status::Stopped);
                            break;
                        }
                        ExitOutcome::Updated => {
                            attempt = 0;
                            continue;
                        }
                        ExitOutcome::NeedsAttention => {
                            let message = lifecycle::last_meaningful_line(&stderr_tail);
                            self.set_status(Status::Attention { message });
                            self.notify_attention();
                            break;
                        }
                        ExitOutcome::ProfileMissing => {
                            vanished = true;
                            break;
                        }
                        ExitOutcome::Crashed => {
                            attempt = lifecycle::next_attempt(attempt, started_at.elapsed());
                            let secs = lifecycle::backoff_secs(attempt);
                            attempt += 1;
                            if !self.countdown(secs, &mut stop_rx).await {
                                self.set_status(Status::Stopped);
                                break;
                            }
                        }
                    }
                }
            }
        }
        {
            let mut inner = self.lock();
            if inner.run.as_ref().map(|r| r.generation) == Some(generation) {
                inner.run = None;
            }
        }
        if vanished {
            self.profile_vanished().await;
        }
    }

    pub async fn profile_vanished(self: &Arc<Self>) {
        let gone = self.active_profile().unwrap_or_default();
        self.stop().await;
        self.clear_approvals();
        let profiles = self.refresh_profiles().await.unwrap_or_default();
        match profiles.into_iter().next() {
            Some(next) => {
                self.note(&format!(
                    "Profile '{gone}' no longer exists; switched to '{}'",
                    next.name
                ));
                self.set_profile(Some(next.name.clone()));
                self.set_status(Status::Attention {
                    message: format!(
                        "Profile '{gone}' was removed. Switched to '{}'. Press Try again to start it.",
                        next.name
                    ),
                });
            }
            None => {
                self.note(&format!(
                    "Profile '{gone}' no longer exists; add this machine again"
                ));
                self.set_profile(None);
            }
        }
    }

    async fn countdown(self: &Arc<Self>, secs: u64, stop_rx: &mut watch::Receiver<bool>) -> bool {
        for seconds in (1..=secs).rev() {
            self.set_status(Status::Restarting { seconds });
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(1)) => {}
                _ = stop_rx.changed() => return false,
            }
        }
        !*stop_rx.borrow()
    }

    async fn run_once(
        self: &Arc<Self>,
        agent: &Path,
        profile: &str,
        stop_rx: &mut watch::Receiver<bool>,
    ) -> RunResult {
        let mut command = cli::command(agent);
        command
            .args(["--launched-from", "launcher", "--profile", profile])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(e) => return RunResult::SpawnFailed(format!("Couldn't start FileReadWrite: {e}")),
        };
        self.lock().pid = child.id();
        *self.stdin.lock().await = child.stdin.take();

        let saw_started = Arc::new(AtomicBool::new(false));
        let tail = Arc::new(Mutex::new(VecDeque::<String>::new()));

        let out_task = child.stdout.take().map(|stdout| {
            let me = Arc::clone(self);
            let saw_started = Arc::clone(&saw_started);
            tauri::async_runtime::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(event) = protocol::parse_event(&line) {
                        if matches!(event, AgentEvent::Started { .. }) {
                            saw_started.store(true, Ordering::SeqCst);
                        }
                        me.handle_event(event);
                    }
                }
            })
        });
        let err_task = child.stderr.take().map(|stderr| {
            let me = Arc::clone(self);
            let tail = Arc::clone(&tail);
            tauri::async_runtime::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    {
                        let mut tail = tail.lock().unwrap_or_else(|e| e.into_inner());
                        if tail.len() == STDERR_TAIL {
                            tail.pop_front();
                        }
                        tail.push_back(line.clone());
                    }
                    me.push_log(line);
                }
            })
        });

        let mut stop_requested = false;
        let status = tokio::select! {
            status = child.wait() => status,
            _ = stop_rx.changed() => {
                stop_requested = true;
                terminate(&mut child).await
            }
        };
        stop_requested |= *stop_rx.borrow();
        for task in [out_task, err_task].into_iter().flatten() {
            let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
        }
        *self.stdin.lock().await = None;
        self.lock().pid = None;
        self.clear_approvals();

        let stderr_tail = tail
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        RunResult::Exited {
            code: status.ok().and_then(|s| s.code()),
            stop_requested,
            saw_started: saw_started.load(Ordering::SeqCst),
            stderr_tail,
        }
    }

    fn handle_event(self: &Arc<Self>, event: AgentEvent) {
        match event {
            AgentEvent::Started { version, .. } => {
                let updated_to = {
                    let mut inner = self.lock();
                    inner.version = Some(version.clone());
                    inner.update_to.take()
                };
                if updated_to.is_some() {
                    notify::send(
                        &self.app,
                        "FileReadWrite updated",
                        &format!("Now running version {version}."),
                    );
                }
                self.publish();
            }
            AgentEvent::Connected => self.set_status(Status::Connected),
            AgentEvent::Disconnected { reason } => self.set_status(Status::Reconnecting { reason }),
            AgentEvent::Approval {
                id,
                exe,
                args,
                cwd,
                timeout_sec,
            } => self.add_approval(PendingApproval {
                risky: protocol::is_risky_program(&exe),
                id,
                exe,
                args,
                cwd,
                timeout_sec,
                received_at_ms: now_ms(),
            }),
            AgentEvent::Update { to, .. } => {
                self.lock().update_to = Some(to.clone());
                self.set_status(Status::Updating { to });
            }
            AgentEvent::Stopping | AgentEvent::Unknown => {}
        }
    }

    fn add_approval(self: &Arc<Self>, approval: PendingApproval) {
        let id = approval.id;
        let timeout = Duration::from_secs(approval.timeout_sec + 2);
        self.lock().approvals.push(approval);
        self.publish();
        windows::show_approval(&self.app);

        let me = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(timeout).await;
            me.forget_approval(id);
        });

        let me = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(800)).await;
            let waiting = me.approvals();
            if waiting.is_empty() || windows::approval_focused(&me.app) {
                return;
            }
            let (title, body) = match waiting.as_slice() {
                [only] => (
                    "Command waiting for approval".to_string(),
                    format!(
                        "An AI app wants to run {}. Open FileReadWrite to review.",
                        protocol::program_name(&only.exe)
                    ),
                ),
                many => (
                    format!("{} commands waiting", many.len()),
                    "Open FileReadWrite to review them.".to_string(),
                ),
            };
            notify::send(&me.app, &title, &body);
        });
    }

    fn forget_approval(&self, id: u64) {
        let removed = {
            let mut inner = self.lock();
            let before = inner.approvals.len();
            inner.approvals.retain(|a| a.id != id);
            before != inner.approvals.len()
        };
        if removed {
            self.note(&format!("Approval request {id} timed out, so nothing ran"));
            self.publish();
        }
    }

    fn clear_approvals(&self) {
        let had_any = {
            let mut inner = self.lock();
            let had_any = !inner.approvals.is_empty();
            inner.approvals.clear();
            had_any
        };
        if had_any {
            self.publish();
        }
    }

    async fn write_stdin(&self, line: &str) -> bool {
        let mut stdin = self.stdin.lock().await;
        let Some(pipe) = stdin.as_mut() else {
            return false;
        };
        let ok = pipe.write_all(line.as_bytes()).await.is_ok() && pipe.flush().await.is_ok();
        if !ok {
            *stdin = None;
        }
        ok
    }

    pub async fn decide(&self, id: u64, approved: bool) -> bool {
        let found = {
            let mut inner = self.lock();
            let index = inner.approvals.iter().position(|a| a.id == id);
            index.map(|i| inner.approvals.remove(i))
        };
        let Some(approval) = found else {
            return false;
        };
        self.publish();
        let sent = self
            .write_stdin(&protocol::decision_line(id, approved))
            .await;
        let command = std::iter::once(protocol::program_name(&approval.exe))
            .chain(approval.args.iter().cloned())
            .collect::<Vec<_>>()
            .join(" ");
        self.note(&format!(
            "{} `{command}` in {}",
            if approved { "Approved" } else { "Denied" },
            approval.cwd
        ));
        sent
    }

    pub async fn deny_all(&self) {
        for approval in self.approvals() {
            self.decide(approval.id, false).await;
        }
    }

    fn notify_attention(&self) {
        let visible = self
            .app
            .get_webview_window("main")
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false);
        if !visible {
            notify::send(
                &self.app,
                "FileReadWrite needs attention",
                "It stopped and couldn't restart. Open it to see why.",
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_stamps_match_the_agent_log_format() {
        assert_eq!(utc_stamp(0), "1970-01-01T00:00:00Z");
        assert_eq!(utc_stamp(1_794_074_612), "2026-11-07T18:03:32Z");
        assert_eq!(utc_stamp(951_782_400), "2000-02-29T00:00:00Z");
    }

    #[test]
    fn launcher_lines_parse_like_agent_lines() {
        let line = launcher_log_line("INFO", "hello");
        assert!(line.starts_with('['));
        assert!(line.ends_with("INFO  launcher] hello"));
    }

    #[test]
    fn running_states_are_the_ones_with_a_process() {
        assert!(Status::Connected.is_running());
        assert!(Status::Restarting { seconds: 3 }.is_running());
        assert!(!Status::Stopped.is_running());
        assert!(!Status::Setup.is_running());
        assert!(
            !Status::Attention {
                message: "x".into()
            }
            .is_running()
        );
    }

    #[test]
    fn status_serialises_for_the_ui() {
        assert_eq!(
            serde_json::to_value(Status::Reconnecting {
                reason: "EngineIO Error".into()
            })
            .unwrap(),
            serde_json::json!({"kind": "reconnecting", "reason": "EngineIO Error"})
        );
        assert_eq!(
            serde_json::to_value(Status::Connected).unwrap(),
            serde_json::json!({"kind": "connected"})
        );
    }
}
