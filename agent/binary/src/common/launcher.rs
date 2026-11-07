use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

pub const UPDATED_EXIT_CODE: i32 = 75;
pub const PROFILE_MISSING_EXIT_CODE: i32 = 78;

#[derive(clap::ValueEnum, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LaunchedFrom {
    #[default]
    Tty,
    Launcher,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Event {
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
}

#[derive(Deserialize)]
struct Incoming {
    #[serde(rename = "type")]
    kind: String,
    id: Option<u64>,
    approved: Option<bool>,
}

pub struct Bridge {
    writer: Mutex<Box<dyn Write + Send>>,
    pending: Mutex<HashMap<u64, Sender<bool>>>,
    closed: AtomicBool,
    next_id: AtomicU64,
}

impl Bridge {
    pub fn new(writer: Box<dyn Write + Send>) -> Arc<Self> {
        Arc::new(Self {
            writer: Mutex::new(writer),
            pending: Mutex::new(HashMap::new()),
            closed: AtomicBool::new(false),
            next_id: AtomicU64::new(1),
        })
    }

    pub fn listen(self: &Arc<Self>, reader: impl BufRead + Send + 'static) {
        let bridge = Arc::clone(self);
        thread::spawn(move || {
            for line in reader.lines() {
                match line {
                    Ok(line) => bridge.handle_line(&line),
                    Err(_) => break,
                }
            }
            log::warn!("Launcher closed stdin; command approvals will be denied");
            bridge.close();
        });
    }

    fn handle_line(&self, line: &str) {
        let Ok(message) = serde_json::from_str::<Incoming>(line) else {
            return;
        };
        if message.kind != "decision" {
            return;
        }
        let (Some(id), Some(approved)) = (message.id, message.approved) else {
            return;
        };
        if let Some(sender) = self.lock_pending().remove(&id) {
            let _ = sender.send(approved);
        }
    }

    fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.lock_pending().clear();
    }

    fn lock_pending(&self) -> std::sync::MutexGuard<'_, HashMap<u64, Sender<bool>>> {
        self.pending.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn emit(&self, event: &Event) {
        let Ok(mut line) = serde_json::to_string(event) else {
            return;
        };
        line.push('\n');
        let mut writer = self.writer.lock().unwrap_or_else(|e| e.into_inner());
        if writer
            .write_all(line.as_bytes())
            .and_then(|_| writer.flush())
            .is_err()
        {
            drop(writer);
            self.close();
        }
    }

    pub fn request_approval(
        &self,
        exe: &str,
        args: &[String],
        cwd: &str,
        timeout: Duration,
    ) -> bool {
        if self.closed.load(Ordering::SeqCst) {
            return false;
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = mpsc::channel();
        self.lock_pending().insert(id, sender);
        if self.closed.load(Ordering::SeqCst) {
            self.lock_pending().remove(&id);
            return false;
        }
        self.emit(&Event::Approval {
            id,
            exe: exe.to_string(),
            args: args.to_vec(),
            cwd: cwd.to_string(),
            timeout_sec: timeout.as_secs(),
        });
        let approved = receiver.recv_timeout(timeout).unwrap_or(false);
        self.lock_pending().remove(&id);
        approved
    }
}

static BRIDGE: OnceLock<Arc<Bridge>> = OnceLock::new();

pub fn start() {
    let bridge = Bridge::new(Box::new(std::io::stdout()));
    bridge.listen(BufReader::new(std::io::stdin()));
    let _ = BRIDGE.set(bridge);
}

pub fn is_active() -> bool {
    BRIDGE.get().is_some()
}

pub fn emit(event: Event) {
    if let Some(bridge) = BRIDGE.get() {
        bridge.emit(&event);
    }
}

pub fn request_approval(exe: &str, args: &[String], cwd: &str, timeout_sec: u64) -> bool {
    BRIDGE.get().is_some_and(|bridge| {
        bridge.request_approval(exe, args, cwd, Duration::from_secs(timeout_sec))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    use std::io::{PipeWriter, pipe};
    use std::time::Instant;

    #[derive(Clone, Default)]
    struct SharedBuf(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedBuf {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl SharedBuf {
        fn lines(&self) -> Vec<Value> {
            String::from_utf8(self.0.lock().unwrap().clone())
                .unwrap()
                .lines()
                .map(|l| serde_json::from_str(l).unwrap())
                .collect()
        }

        fn wait_for_approvals(&self, count: usize) -> Vec<Value> {
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                let approvals: Vec<Value> = self
                    .lines()
                    .into_iter()
                    .filter(|l| l["type"] == "approval")
                    .collect();
                if approvals.len() >= count {
                    return approvals;
                }
                assert!(Instant::now() < deadline, "no approval request was sent");
                thread::sleep(Duration::from_millis(10));
            }
        }
    }

    fn bridge() -> (Arc<Bridge>, SharedBuf, PipeWriter) {
        let out = SharedBuf::default();
        let bridge = Bridge::new(Box::new(out.clone()));
        let (reader, writer) = pipe().unwrap();
        bridge.listen(BufReader::new(reader));
        (bridge, out, writer)
    }

    fn ask(bridge: &Arc<Bridge>, timeout: Duration) -> thread::JoinHandle<bool> {
        let bridge = Arc::clone(bridge);
        thread::spawn(move || {
            bridge.request_approval(
                "git",
                &["log".to_string(), "--oneline".to_string()],
                "/Users/me/project",
                timeout,
            )
        })
    }

    fn decide(stdin: &mut PipeWriter, id: &Value, approved: bool) {
        writeln!(
            stdin,
            "{}",
            json!({ "type": "decision", "id": id, "approved": approved })
        )
        .unwrap();
    }

    #[test]
    fn events_match_the_protocol() {
        let cases = [
            (
                Event::Started {
                    version: "1.0.1".into(),
                    profile: "personal".into(),
                },
                json!({"type": "started", "version": "1.0.1", "profile": "personal"}),
            ),
            (Event::Connected, json!({"type": "connected"})),
            (
                Event::Disconnected {
                    reason: "transport close".into(),
                },
                json!({"type": "disconnected", "reason": "transport close"}),
            ),
            (
                Event::Approval {
                    id: 7,
                    exe: "git".into(),
                    args: vec!["log".into()],
                    cwd: "/p".into(),
                    timeout_sec: 90,
                },
                json!({"type": "approval", "id": 7, "exe": "git", "args": ["log"], "cwd": "/p", "timeoutSec": 90}),
            ),
            (
                Event::Update {
                    from: "1.0.1".into(),
                    to: "1.0.2".into(),
                },
                json!({"type": "update", "from": "1.0.1", "to": "1.0.2"}),
            ),
            (Event::Stopping, json!({"type": "stopping"})),
        ];
        for (event, expected) in cases {
            assert_eq!(serde_json::to_value(&event).unwrap(), expected);
        }
    }

    #[test]
    fn approve_round_trip() {
        let (bridge, out, mut stdin) = bridge();
        let answer = ask(&bridge, Duration::from_secs(5));
        let request = out.wait_for_approvals(1).remove(0);
        assert_eq!(request["exe"], "git");
        assert_eq!(request["args"], json!(["log", "--oneline"]));
        assert_eq!(request["cwd"], "/Users/me/project");
        assert_eq!(request["timeoutSec"], 5);
        decide(&mut stdin, &request["id"], true);
        assert!(answer.join().unwrap());
    }

    #[test]
    fn deny_round_trip() {
        let (bridge, out, mut stdin) = bridge();
        let answer = ask(&bridge, Duration::from_secs(5));
        let request = out.wait_for_approvals(1).remove(0);
        decide(&mut stdin, &request["id"], false);
        assert!(!answer.join().unwrap());
    }

    #[test]
    fn ids_are_unique_and_decisions_reach_the_right_request() {
        let (bridge, out, mut stdin) = bridge();
        let first = ask(&bridge, Duration::from_secs(5));
        let first_id = out.wait_for_approvals(1)[0]["id"].clone();
        let second = ask(&bridge, Duration::from_secs(5));
        let second_id = out.wait_for_approvals(2)[1]["id"].clone();
        assert_ne!(first_id, second_id);
        decide(&mut stdin, &second_id, true);
        decide(&mut stdin, &first_id, false);
        assert!(second.join().unwrap());
        assert!(!first.join().unwrap());
    }

    #[test]
    fn unknown_ids_and_junk_are_ignored() {
        let (bridge, out, mut stdin) = bridge();
        let answer = ask(&bridge, Duration::from_secs(5));
        let request = out.wait_for_approvals(1).remove(0);
        writeln!(stdin, "not json").unwrap();
        writeln!(stdin, "{}", json!({"type": "hello"})).unwrap();
        writeln!(
            stdin,
            "{}",
            json!({"type": "decision", "id": 999, "approved": true})
        )
        .unwrap();
        decide(&mut stdin, &request["id"], true);
        assert!(answer.join().unwrap());
    }

    #[test]
    fn timeout_denies_and_late_decisions_are_ignored() {
        let (bridge, out, mut stdin) = bridge();
        let answer = ask(&bridge, Duration::from_millis(200));
        let request = out.wait_for_approvals(1).remove(0);
        assert!(!answer.join().unwrap());
        decide(&mut stdin, &request["id"], true);
        let next = ask(&bridge, Duration::from_secs(5));
        let next_request = out.wait_for_approvals(2).remove(1);
        decide(&mut stdin, &next_request["id"], true);
        assert!(next.join().unwrap());
    }

    #[test]
    fn closed_stdin_denies_pending_and_future_approvals() {
        let (bridge, out, stdin) = bridge();
        let answer = ask(&bridge, Duration::from_secs(30));
        out.wait_for_approvals(1);
        let started = Instant::now();
        drop(stdin);
        assert!(!answer.join().unwrap());
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(!ask(&bridge, Duration::from_secs(30)).join().unwrap());
        assert_eq!(out.wait_for_approvals(1).len(), 1);
    }
}
