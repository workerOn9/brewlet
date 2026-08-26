use serde::Serialize;
use thiserror::Error;

/// Typed application error. Serialized to the frontend as its message string.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("brew executable not found (checked /opt/homebrew/bin/brew, /usr/local/bin/brew)")]
    BrewNotFound,
    #[error("configured brew path is unusable: {0}")]
    BrewPathInvalid(String),
    #[error("invalid setting {field}: {reason}")]
    InvalidSetting { field: String, reason: String },
    #[error("invalid package name: {0}")]
    InvalidName(String),
    #[error("brew command failed: {0}")]
    BrewFailed(String),
    #[error("operation not found: {0}")]
    OpNotFound(String),
    #[error("network unavailable and no cached catalog")]
    CatalogUnavailable,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("clock error: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
