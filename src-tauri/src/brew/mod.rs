//! brew CLI interaction layer. All structured queries use `--json=v2`;
//! the only tolerated text parsing lives in `services.rs` (DESIGN §5.1).

pub mod privilege;
pub mod read;
pub mod services;
pub mod write;

use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::settings;

const BREW_CANDIDATES: [&str; 2] = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

/// Locate the brew executable. 用户设置里的路径优先（D007），否则 ARM Homebrew
/// 优先自动探测（DESIGN §1）。设置了路径但文件已不存在时明确报错，绝不静默
/// 回落到另一个 brew。
pub fn brew_path() -> AppResult<PathBuf> {
    let settings = settings::current();
    if let Some(path) = settings::configured_brew_path(&settings) {
        return Ok(path);
    }
    if let Some(raw) = settings
        .brew_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Err(AppError::BrewPathInvalid(format!("{raw}（文件不存在）")));
    }
    BREW_CANDIDATES
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
        .ok_or(AppError::BrewNotFound)
}

/// 每个 brew 子进程都要带上的环境变量：代理 + 国内镜像源（D008）。
/// 一律走 `Command::envs()`，绝不拼 shell 字符串。
pub fn brew_envs() -> Vec<(String, String)> {
    settings::env_pairs(&settings::current())
}

/// Reject anything that is not a plain package name/token, so a name can never
/// be interpreted as a CLI flag (defense in depth; we never use a shell anyway).
pub fn validate_package_name(name: &str) -> AppResult<()> {
    let ok = !name.is_empty()
        && name.len() <= 128
        && !name.starts_with('-')
        && !name.contains("..")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '+' | '@' | '/'));
    if ok {
        Ok(())
    } else {
        Err(AppError::InvalidName(name.to_string()))
    }
}
