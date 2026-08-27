//! brew services — the ONLY tolerated text-parsing point in the app
//! (brew 6 has no stable JSON for services; DESIGN §5.1 exception).
//! M1: expose raw output only; structured TSV parsing lands in M3 and must
//! degrade gracefully to this raw view on any mismatch.

use tokio::process::Command;

use crate::brew::brew_path;
use crate::error::{AppError, AppResult};

/// Raw `brew services list` output, for the M3 degraded display path.
#[allow(dead_code)]
pub async fn list_raw() -> AppResult<String> {
    let brew = brew_path()?;
    let output = Command::new(&brew)
        .args(["services", "list"])
        .output()
        .await?;
    if !output.status.success() {
        return Err(AppError::BrewFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
