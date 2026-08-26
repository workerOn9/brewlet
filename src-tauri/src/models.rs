//! Serde models mirroring brew 6.x JSON output and the formulae.brew.sh API.
//! Every field is `#[serde(default)]` to tolerate brew version field drift.
//! Wire format is snake_case end-to-end; `src/types.ts` mirrors these field-for-field.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Formula (brew info --json=v2 / formulae.brew.sh/api/formula.json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FormulaVersions {
    #[serde(default)]
    pub stable: Option<String>,
    #[serde(default)]
    pub head: Option<String>,
    #[serde(default)]
    pub bottle: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RuntimeDependency {
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub revision: i64,
    #[serde(default)]
    pub pkg_version: String,
    #[serde(default)]
    pub declared_directly: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InstalledVersion {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub used_options: Vec<String>,
    #[serde(default)]
    pub built_as_bottle: bool,
    #[serde(default)]
    pub poured_from_bottle: bool,
    #[serde(default)]
    pub time: Option<i64>,
    #[serde(default)]
    pub runtime_dependencies: Vec<RuntimeDependency>,
    #[serde(default)]
    pub installed_on_request: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Formula {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub tap: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub versions: FormulaVersions,
    #[serde(default)]
    pub installed: Vec<InstalledVersion>,
    #[serde(default)]
    pub linked_keg: Option<String>,
    #[serde(default)]
    pub keg_only: bool,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub outdated: bool,
    #[serde(default)]
    pub deprecated: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub build_dependencies: Vec<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub oldnames: Vec<String>,
}

// ---------------------------------------------------------------------------
// Cask (brew info --json=v2 / formulae.brew.sh/api/cask.json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Cask {
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub full_token: String,
    #[serde(default)]
    pub name: Vec<String>,
    #[serde(default)]
    pub tap: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    /// Locally installed version string (null when not installed).
    #[serde(default)]
    pub installed: Option<String>,
    #[serde(default)]
    pub outdated: bool,
    #[serde(default)]
    pub deprecated: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub auto_updates: Option<bool>,
}

// ---------------------------------------------------------------------------
// brew info --json=v2 output envelope
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InfoOutput {
    #[serde(default)]
    pub formulae: Vec<Formula>,
    #[serde(default)]
    pub casks: Vec<Cask>,
}

// ---------------------------------------------------------------------------
// brew outdated --json=v2
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OutdatedPackage {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub installed_versions: Vec<String>,
    #[serde(default)]
    pub current_version: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub pinned_version: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OutdatedOutput {
    #[serde(default)]
    pub formulae: Vec<OutdatedPackage>,
    #[serde(default)]
    pub casks: Vec<OutdatedPackage>,
}

// ---------------------------------------------------------------------------
// Catalog (remote formulae.brew.sh + disk cache)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CatalogPayload {
    #[serde(default)]
    pub formulae: Vec<Formula>,
    #[serde(default)]
    pub casks: Vec<Cask>,
    #[serde(default)]
    pub fetched_at: i64,
    #[serde(default)]
    pub from_cache: bool,
}

// ---------------------------------------------------------------------------
// Health / status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BrewStatus {
    #[serde(default)]
    pub available: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

// ---------------------------------------------------------------------------
// 用户设置（D007 / D008），持久化到 app_config_dir/settings.json
// ---------------------------------------------------------------------------

/// 镜像源预设。`custom` 表示四个 URL 由用户自填。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MirrorPreset {
    #[default]
    Official,
    Tuna,
    Ustc,
    Custom,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProxySettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub http: String,
    #[serde(default)]
    pub https: String,
    /// 通常是 socks5:// 形式（Clash 等本地代理）。
    #[serde(default)]
    pub all: String,
    #[serde(default)]
    pub no_proxy: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MirrorSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub preset: MirrorPreset,
    /// HOMEBREW_API_DOMAIN，同时作为目录抓取的 base URL。
    #[serde(default)]
    pub api_domain: String,
    /// HOMEBREW_BOTTLE_DOMAIN
    #[serde(default)]
    pub bottle_domain: String,
    /// HOMEBREW_BREW_GIT_REMOTE
    #[serde(default)]
    pub brew_git_remote: String,
    /// HOMEBREW_CORE_GIT_REMOTE
    #[serde(default)]
    pub core_git_remote: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    /// 覆盖 brew 可执行文件路径；None / 空串表示自动探测（ARM → Intel）。
    #[serde(default)]
    pub brew_path: Option<String>,
    #[serde(default)]
    pub proxy: ProxySettings,
    #[serde(default)]
    pub mirror: MirrorSettings,
}

/// 不带包名的维护操作白名单。前端只能传枚举值，无法传任意 argv。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaintenanceAction {
    Update,
    UpgradeAll,
    Cleanup,
    Autoremove,
}

// ---------------------------------------------------------------------------
// Write-op event protocol (DESIGN §5.2), emitted on channel "brew:op"
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PackageKind {
    Formula,
    Cask,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OpEventKind {
    Phase,
    Line,
    Done,
    Error,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpEvent {
    pub op_id: String,
    pub kind: OpEventKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<i32>,
}
