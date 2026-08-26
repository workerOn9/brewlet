//! Privileged operations via macOS `osascript` system authorization prompt.
//! The app never sees, stores, or forwards credentials (DESIGN §5.3).
//! M3 wires this into cask uninstall and service changes.

use tokio::process::Command;

use crate::error::{AppError, AppResult};

/// Run a command with administrator privileges. `argv` is joined into a
/// single-quoted shell string inside an AppleScript `do shell script`.
#[allow(dead_code)]
pub async fn run_privileged(argv: &[String]) -> AppResult<String> {
    if argv.is_empty() {
        return Err(AppError::BrewFailed("empty privileged command".to_string()));
    }
    // Shell-escape each arg with single quotes, then escape for AppleScript's
    // double-quoted string literal.
    let shell_cmd = argv
        .iter()
        .map(|a| format!("'{}'", a.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" ");
    let script = format!(
        "do shell script \"{}\" with administrator privileges",
        shell_cmd.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await?;
    if !output.status.success() {
        // Exit code 1 with "User canceled" means the user dismissed the prompt.
        return Err(AppError::BrewFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
