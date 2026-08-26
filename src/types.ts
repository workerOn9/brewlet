/**
 * Wire types — field-for-field mirror of src-tauri/src/models.rs.
 * Wire format is snake_case end-to-end. Keep both sides in sync (AGENTS.md §3).
 */

export interface FormulaVersions {
  stable: string | null;
  head: string | null;
  bottle: boolean;
}

export interface RuntimeDependency {
  full_name: string;
  version: string;
  revision: number;
  pkg_version: string;
  declared_directly: boolean;
}

export interface InstalledVersion {
  version: string;
  used_options: string[];
  built_as_bottle: boolean;
  poured_from_bottle: boolean;
  time: number | null;
  runtime_dependencies: RuntimeDependency[];
  installed_on_request: boolean;
}

export interface Formula {
  name: string;
  full_name: string;
  tap: string;
  desc: string | null;
  homepage: string | null;
  license: string | null;
  versions: FormulaVersions;
  installed: InstalledVersion[];
  linked_keg: string | null;
  keg_only: boolean;
  pinned: boolean;
  outdated: boolean;
  deprecated: boolean;
  disabled: boolean;
  dependencies: string[];
  build_dependencies: string[];
  aliases: string[];
  oldnames: string[];
}

export interface Cask {
  token: string;
  full_token: string;
  name: string[];
  tap: string;
  desc: string | null;
  homepage: string | null;
  version: string | null;
  installed: string | null;
  outdated: boolean;
  deprecated: boolean;
  disabled: boolean;
  pinned: boolean;
  auto_updates: boolean | null;
}

export interface InfoOutput {
  formulae: Formula[];
  casks: Cask[];
}

export interface OutdatedPackage {
  name: string;
  installed_versions: string[];
  current_version: string | null;
  pinned: boolean;
  pinned_version: string | null;
}

export interface OutdatedOutput {
  formulae: OutdatedPackage[];
  casks: OutdatedPackage[];
}

export interface CatalogPayload {
  formulae: Formula[];
  casks: Cask[];
  fetched_at: number;
  from_cache: boolean;
}

export interface BrewStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

export type PackageKind = "formula" | "cask";

// ---------------------------------------------------------------------------
// 用户设置（D007 / D008）
// ---------------------------------------------------------------------------

export type MirrorPreset = "official" | "tuna" | "ustc" | "custom";

export interface ProxySettings {
  enabled: boolean;
  http: string;
  https: string;
  /** 通常是 socks5:// 形式（Clash 等本地代理）。 */
  all: string;
  no_proxy: string;
}

export interface MirrorSettings {
  enabled: boolean;
  preset: MirrorPreset;
  /** HOMEBREW_API_DOMAIN，同时是目录抓取的 base URL。 */
  api_domain: string;
  bottle_domain: string;
  brew_git_remote: string;
  core_git_remote: string;
}

export interface Settings {
  /** 覆盖 brew 可执行文件路径；null 表示自动探测。 */
  brew_path: string | null;
  proxy: ProxySettings;
  mirror: MirrorSettings;
}

/** 不带包名的维护操作（后端白名单枚举）。 */
export type MaintenanceAction =
  | "update"
  | "upgrade_all"
  | "cleanup"
  | "autoremove";

export type OpEventKind = "phase" | "line" | "done" | "error" | "canceled";

export interface OpEvent {
  op_id: string;
  kind: OpEventKind;
  phase?: string;
  line?: string;
  code?: number;
}
