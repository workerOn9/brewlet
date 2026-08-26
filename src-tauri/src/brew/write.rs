//! Write operations: brew install / uninstall / upgrade with streamed output,
//! cancellation, and a global serial gate (brew takes its own lock; DESIGN §5.2).
//!
//! Protocol: every line of stdout/stderr becomes an `OpEvent { kind: line }`;
//! lifecycle transitions use phase/done/error/canceled. The Tauri-facing
//! `run_op` forwards events to the "brew:op" channel; the core `run_brew_op`
//! takes any event sink, which keeps the process machinery unit-testable.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, Semaphore};

use crate::brew::{brew_envs, brew_path, validate_package_name};
use crate::error::{AppError, AppResult};
use crate::models::{MaintenanceAction, OpEvent, OpEventKind, PackageKind};

struct OpEntry {
    child: Arc<Mutex<Child>>,
    canceled: Arc<AtomicBool>,
}

pub struct OpManager {
    ops: Mutex<HashMap<String, OpEntry>>,
    /// Serializes write operations to avoid Homebrew lock contention.
    gate: Semaphore,
}

impl OpManager {
    pub fn new() -> Self {
        Self {
            ops: Mutex::new(HashMap::new()),
            gate: Semaphore::new(1),
        }
    }
}

type OpSink = Arc<dyn Fn(OpEvent) + Send + Sync>;

fn lifecycle(sink: &OpSink, op_id: &str, kind: OpEventKind, code: Option<i32>) {
    sink(OpEvent {
        op_id: op_id.to_string(),
        kind,
        phase: None,
        line: None,
        code,
    });
}

fn detect_phase(line: &str) -> Option<&'static str> {
    let lower = line.to_ascii_lowercase();
    if lower.contains("downloading") {
        Some("downloading")
    } else if lower.contains("pouring") {
        Some("pouring")
    } else if lower.contains("installing")
        || (lower.contains("install") && lower.starts_with("==>"))
    {
        Some("installing")
    } else if lower.contains("linking") {
        Some("linking")
    } else if lower.contains("uninstalling") || lower.contains("removing") {
        Some("uninstalling")
    } else if lower.contains("upgrading") {
        Some("upgrading")
    } else if lower.contains("summary") || lower.contains("caveats") {
        Some("finishing")
    } else {
        None
    }
}

fn spawn_line_reader<S>(sink: &OpSink, op_id: &str, stream: Option<S>)
where
    S: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    let Some(stream) = stream else { return };
    let sink = Arc::clone(sink);
    let op_id = op_id.to_string();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(phase) = detect_phase(&line) {
                sink(OpEvent {
                    op_id: op_id.clone(),
                    kind: OpEventKind::Phase,
                    phase: Some(phase.to_string()),
                    line: None,
                    code: None,
                });
            }
            sink(OpEvent {
                op_id: op_id.clone(),
                kind: OpEventKind::Line,
                phase: None,
                line: Some(line),
                code: None,
            });
        }
    });
}

/// 单包操作 → argv。名字先过白名单校验，`--cask` 只由 kind 决定。
pub fn package_args(name: &str, kind: PackageKind, action: &str) -> AppResult<Vec<String>> {
    validate_package_name(name)?;
    let mut args: Vec<String> = vec![action.to_string()];
    if kind == PackageKind::Cask {
        args.push("--cask".to_string());
    }
    args.push(name.to_string());
    Ok(args)
}

/// 维护操作 → argv。枚举白名单，前端无法传任意参数（AGENTS.md 硬约束 4）。
pub fn maintenance_args(action: MaintenanceAction) -> Vec<String> {
    match action {
        MaintenanceAction::Update => vec!["update".to_string()],
        MaintenanceAction::UpgradeAll => vec!["upgrade".to_string()],
        MaintenanceAction::Cleanup => vec!["cleanup".to_string()],
        MaintenanceAction::Autoremove => vec!["autoremove".to_string()],
    }
}

/// Tauri-facing wrapper: 跑一组 argv，事件转发到 "brew:op" 通道。
pub async fn run_args(
    app: AppHandle,
    manager: Arc<OpManager>,
    op_id: String,
    args: Vec<String>,
) -> AppResult<()> {
    let sink: OpSink = Arc::new(move |ev: OpEvent| {
        if let Err(e) = app.emit("brew:op", ev) {
            eprintln!("warn: failed to emit brew:op event: {e}");
        }
    });
    run_brew_op(args, op_id, manager, sink).await
}

/// Core: run one brew op to completion. Queued ops wait on the serial gate;
/// all progress is delivered through `sink`.
pub(crate) async fn run_brew_op(
    args: Vec<String>,
    op_id: String,
    manager: Arc<OpManager>,
    sink: OpSink,
) -> AppResult<()> {
    let brew = brew_path()?;

    sink(OpEvent {
        op_id: op_id.clone(),
        kind: OpEventKind::Phase,
        phase: Some("queued".to_string()),
        line: None,
        code: None,
    });
    let _permit = manager
        .gate
        .acquire()
        .await
        .map_err(|_| AppError::BrewFailed("operation gate closed".to_string()))?;

    let child = Command::new(&brew)
        .args(&args)
        .envs(brew_envs())
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_COLOR", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let canceled = Arc::new(AtomicBool::new(false));
    let child_handle = Arc::new(Mutex::new(child));
    manager.ops.lock().await.insert(
        op_id.clone(),
        OpEntry {
            child: Arc::clone(&child_handle),
            canceled: Arc::clone(&canceled),
        },
    );

    let (stdout, stderr) = {
        let mut guard = child_handle.lock().await;
        (guard.stdout.take(), guard.stderr.take())
    };
    spawn_line_reader(&sink, &op_id, stdout);
    spawn_line_reader(&sink, &op_id, stderr);

    let status = {
        let mut guard = child_handle.lock().await;
        guard.wait().await
    };

    manager.ops.lock().await.remove(&op_id);

    match status {
        Ok(s) if canceled.load(Ordering::SeqCst) => {
            lifecycle(&sink, &op_id, OpEventKind::Canceled, s.code());
        }
        Ok(s) if s.success() => {
            lifecycle(&sink, &op_id, OpEventKind::Done, s.code());
        }
        Ok(s) => {
            lifecycle(&sink, &op_id, OpEventKind::Error, s.code());
        }
        Err(e) => {
            sink(OpEvent {
                op_id: op_id.clone(),
                kind: OpEventKind::Error,
                phase: None,
                line: Some(e.to_string()),
                code: None,
            });
        }
    }
    Ok(())
}

/// Cancel a running op by killing its child process.
pub async fn cancel(manager: &OpManager, op_id: &str) -> AppResult<()> {
    let entry = {
        let ops = manager.ops.lock().await;
        ops.get(op_id).map(|e| OpEntry {
            child: Arc::clone(&e.child),
            canceled: Arc::clone(&e.canceled),
        })
    };
    match entry {
        Some(e) => {
            e.canceled.store(true, Ordering::SeqCst);
            let mut guard = e.child.lock().await;
            guard.start_kill().map_err(AppError::Io)
        }
        None => Err(AppError::OpNotFound(op_id.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn detects_phases() {
        assert_eq!(
            detect_phase("==> Downloading https://…"),
            Some("downloading")
        );
        assert_eq!(
            detect_phase("==> Pouring wget--1.25.0.arm64_sonoma.bottle.tar.gz"),
            Some("pouring")
        );
        assert_eq!(detect_phase("==> Installing wget"), Some("installing"));
        assert_eq!(detect_phase("random noise"), None);
    }

    #[test]
    fn maintenance_args_are_whitelisted() {
        assert_eq!(maintenance_args(MaintenanceAction::Update), vec!["update"]);
        assert_eq!(
            maintenance_args(MaintenanceAction::UpgradeAll),
            vec!["upgrade"]
        );
        assert_eq!(
            maintenance_args(MaintenanceAction::Cleanup),
            vec!["cleanup"]
        );
        assert_eq!(
            maintenance_args(MaintenanceAction::Autoremove),
            vec!["autoremove"]
        );
    }

    #[test]
    fn package_args_place_cask_flag_and_reject_flag_names() {
        assert_eq!(
            package_args("wget", PackageKind::Formula, "install").expect("ok"),
            vec!["install", "wget"]
        );
        assert_eq!(
            package_args("iterm2", PackageKind::Cask, "uninstall").expect("ok"),
            vec!["uninstall", "--cask", "iterm2"]
        );
        assert!(package_args("--force", PackageKind::Formula, "install").is_err());
    }

    #[tokio::test]
    async fn cancel_kills_registered_child() {
        let manager = OpManager::new();
        let child = Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("spawn sleep");
        let child = Arc::new(Mutex::new(child));
        let canceled = Arc::new(AtomicBool::new(false));
        manager.ops.lock().await.insert(
            "op-test".to_string(),
            OpEntry {
                child: Arc::clone(&child),
                canceled: Arc::clone(&canceled),
            },
        );

        cancel(&manager, "op-test").await.expect("cancel ok");
        assert!(canceled.load(Ordering::SeqCst));

        let status = child.lock().await.wait().await.expect("wait ok");
        assert!(!status.success());

        assert!(cancel(&manager, "nope").await.is_err());
    }

    /// End-to-end through the spawn/stream/lifecycle core using a read-only
    /// brew invocation (zero system mutation, real process pipeline).
    #[tokio::test]
    async fn streams_a_real_brew_invocation() {
        if brew_path().is_err() {
            return;
        }
        let manager = Arc::new(OpManager::new());
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<OpEvent>();
        let sink: OpSink = Arc::new(move |ev| {
            let _ = tx.send(ev);
        });

        run_brew_op(
            vec!["info".to_string(), "cowsay".to_string()],
            "t-stream".to_string(),
            manager,
            sink,
        )
        .await
        .expect("op ok");

        let mut saw_line = false;
        let mut saw_done = false;
        while let Ok(Some(ev)) = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await {
            match ev.kind {
                OpEventKind::Line => saw_line = true,
                OpEventKind::Done => saw_done = true,
                _ => {}
            }
            if saw_done {
                // Drain anything the readers flushed after the lifecycle event.
                while let Ok(Some(extra)) =
                    tokio::time::timeout(Duration::from_millis(500), rx.recv()).await
                {
                    if extra.kind == OpEventKind::Line {
                        saw_line = true;
                    }
                }
                break;
            }
        }
        assert!(saw_line, "expected streamed output lines");
        assert!(saw_done, "expected done lifecycle event");
    }
}
