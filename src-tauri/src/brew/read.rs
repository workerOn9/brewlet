//! Structured brew queries. JSON only, zero text parsing (DESIGN §5.1).
//! 所有调用都带上设置里的代理/镜像环境变量（D008）。

use std::path::Path;

use tokio::process::Command;

use crate::brew::{brew_envs, brew_path, validate_package_name};
use crate::error::{AppError, AppResult};
use crate::models::{InfoOutput, OutdatedOutput};

async fn run_json<T: serde::de::DeserializeOwned>(args: &[&str]) -> AppResult<T> {
    let brew = brew_path()?;
    let output = Command::new(&brew)
        .args(args)
        .envs(brew_envs())
        .output()
        .await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::BrewFailed(stderr));
    }
    Ok(serde_json::from_slice(&output.stdout)?)
}

/// `brew --version` → e.g. "6.0.19"。
pub async fn version() -> AppResult<String> {
    version_at(&brew_path()?).await
}

/// 指定可执行文件取版本；供设置面板校验候选 brew 路径用。
pub async fn version_at(brew: &Path) -> AppResult<String> {
    let output = Command::new(brew)
        .arg("--version")
        .envs(brew_envs())
        .output()
        .await?;
    if !output.status.success() {
        return Err(AppError::BrewFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let first = stdout.lines().next().unwrap_or_default();
    let version = first
        .strip_prefix("Homebrew ")
        .unwrap_or(first)
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();
    Ok(version)
}

/// Locally installed formulae + casks.
/// NOTE: brew 6 removed `--json` from `brew list`; `brew info --json=v2 --installed`
/// is the supported structured query.
pub async fn installed() -> AppResult<InfoOutput> {
    run_json(&["info", "--json=v2", "--installed"]).await
}

/// Outdated formulae + casks.
pub async fn outdated() -> AppResult<OutdatedOutput> {
    run_json(&["outdated", "--json=v2"]).await
}

/// Single-package local + remote metadata (formula or cask).
pub async fn info(name: &str) -> AppResult<InfoOutput> {
    validate_package_name(name)?;
    run_json(&["info", "--json=v2", name]).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_flag_injection() {
        assert!(validate_package_name("--cask").is_err());
        assert!(validate_package_name("foo; rm -rf /").is_err());
        assert!(validate_package_name("").is_err());
        assert!(validate_package_name("wget").is_ok());
        assert!(validate_package_name("homebrew/cask/font-fira-code").is_ok());
    }

    #[tokio::test]
    async fn version_parses_on_this_machine() {
        // Machine-dependent smoke test; skip gracefully if brew is absent.
        if brew_path().is_err() {
            return;
        }
        let v = version().await;
        assert!(v.is_ok());
    }
}
