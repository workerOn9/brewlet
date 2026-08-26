//! 用户设置：brew 路径覆盖 + 网络代理 + 国内镜像源（决策 D007 / D008）。
//!
//! 持久化到 `app_config_dir/settings.json`，启动时读入 `OnceLock<RwLock<Settings>>`
//! 进程内缓存；brew 子进程与 reqwest 都从这份缓存取值。
//!
//! 硬约束：代理与镜像一律以**环境变量**形式经 `Command::envs()` 注入，
//! 绝不拼 shell 字符串（AGENTS.md 硬约束 4「无注入面」）。

use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{MirrorPreset, Settings};

/// 官方目录 API base（镜像关闭时使用）。
pub const OFFICIAL_API_DOMAIN: &str = "https://formulae.brew.sh/api";

const PROXY_SCHEMES: [&str; 5] = [
    "http://",
    "https://",
    "socks5://",
    "socks5h://",
    "socks4://",
];
const MIRROR_SCHEMES: [&str; 2] = ["http://", "https://"];

struct Preset {
    api_domain: &'static str,
    bottle_domain: &'static str,
    brew_git_remote: &'static str,
    core_git_remote: &'static str,
}

/// 清华 TUNA（实测 TTFB ~0.30s）。
const TUNA: Preset = Preset {
    api_domain: "https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api",
    bottle_domain: "https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles",
    brew_git_remote: "https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git",
    core_git_remote: "https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-core.git",
};

/// 中科大 USTC（实测 TTFB ~0.30s）。
const USTC: Preset = Preset {
    api_domain: "https://mirrors.ustc.edu.cn/homebrew-bottles/api",
    bottle_domain: "https://mirrors.ustc.edu.cn/homebrew-bottles",
    brew_git_remote: "https://mirrors.ustc.edu.cn/brew.git",
    core_git_remote: "https://mirrors.ustc.edu.cn/homebrew-core.git",
};

fn preset_of(preset: MirrorPreset) -> Option<&'static Preset> {
    match preset {
        MirrorPreset::Tuna => Some(&TUNA),
        MirrorPreset::Ustc => Some(&USTC),
        MirrorPreset::Official | MirrorPreset::Custom => None,
    }
}

// ---------------------------------------------------------------------------
// 进程内缓存
// ---------------------------------------------------------------------------

fn cell() -> &'static RwLock<Settings> {
    static CELL: OnceLock<RwLock<Settings>> = OnceLock::new();
    CELL.get_or_init(|| RwLock::new(Settings::default()))
}

/// 当前生效设置的副本。锁中毒时取回内部值——绝不 panic。
pub fn current() -> Settings {
    match cell().read() {
        Ok(guard) => guard.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    }
}

fn store(next: Settings) {
    match cell().write() {
        Ok(mut guard) => *guard = next,
        Err(poisoned) => *poisoned.into_inner() = next,
    }
}

// ---------------------------------------------------------------------------
// 校验与归一化
// ---------------------------------------------------------------------------

fn invalid(field: &str, reason: &str) -> AppError {
    AppError::InvalidSetting {
        field: field.to_string(),
        reason: reason.to_string(),
    }
}

/// 环境变量值不得含 NUL / 换行（会破坏子进程环境块）。
fn validate_env_value(field: &str, value: &str) -> AppResult<()> {
    if value.contains('\0') || value.contains('\n') || value.contains('\r') {
        return Err(invalid(field, "不能包含空字符或换行"));
    }
    Ok(())
}

fn validate_url(field: &str, value: &str, schemes: &[&str]) -> AppResult<()> {
    validate_env_value(field, value)?;
    if value.chars().any(char::is_whitespace) {
        return Err(invalid(field, "不能包含空格"));
    }
    let scheme = schemes
        .iter()
        .find(|s| value.starts_with(**s))
        .ok_or_else(|| invalid(field, &format!("需以 {} 开头", schemes.join(" / "))))?;
    if value.len() <= scheme.len() {
        return Err(invalid(field, "缺少主机名"));
    }
    Ok(())
}

/// brew 路径必须是绝对路径且指向一个已存在的文件。
pub fn check_brew_path(raw: &str) -> AppResult<PathBuf> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err(AppError::BrewPathInvalid(format!("{raw}（需绝对路径）")));
    }
    if !path.exists() {
        return Err(AppError::BrewPathInvalid(format!("{raw}（文件不存在）")));
    }
    if !path.is_file() {
        return Err(AppError::BrewPathInvalid(format!(
            "{raw}（不是文件，请指向 bin/brew 而非目录）"
        )));
    }
    Ok(path)
}

/// 归一化：清掉空白、按预设回填镜像 URL、校验所有字段。
pub fn normalize(mut settings: Settings) -> AppResult<Settings> {
    settings.brew_path = match settings.brew_path.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(raw) => {
            check_brew_path(raw)?;
            Some(raw.to_string())
        }
    };

    let proxy = &mut settings.proxy;
    proxy.http = proxy.http.trim().to_string();
    proxy.https = proxy.https.trim().to_string();
    proxy.all = proxy.all.trim().to_string();
    proxy.no_proxy = proxy.no_proxy.trim().to_string();
    if proxy.enabled {
        for (field, value) in [
            ("proxy.http", &proxy.http),
            ("proxy.https", &proxy.https),
            ("proxy.all", &proxy.all),
        ] {
            if !value.is_empty() {
                validate_url(field, value, &PROXY_SCHEMES)?;
            }
        }
        validate_env_value("proxy.no_proxy", &proxy.no_proxy)?;
        if proxy.http.is_empty() && proxy.https.is_empty() && proxy.all.is_empty() {
            return Err(invalid("proxy", "已启用代理但没填任何代理地址"));
        }
    }

    let mirror = &mut settings.mirror;
    if let Some(p) = preset_of(mirror.preset) {
        mirror.api_domain = p.api_domain.to_string();
        mirror.bottle_domain = p.bottle_domain.to_string();
        mirror.brew_git_remote = p.brew_git_remote.to_string();
        mirror.core_git_remote = p.core_git_remote.to_string();
    } else {
        mirror.api_domain = mirror.api_domain.trim().trim_end_matches('/').to_string();
        mirror.bottle_domain = mirror
            .bottle_domain
            .trim()
            .trim_end_matches('/')
            .to_string();
        mirror.brew_git_remote = mirror.brew_git_remote.trim().to_string();
        mirror.core_git_remote = mirror.core_git_remote.trim().to_string();
    }
    if mirror.preset == MirrorPreset::Official {
        mirror.enabled = false;
    }
    if mirror.enabled {
        for (field, value) in [
            ("mirror.api_domain", &mirror.api_domain),
            ("mirror.bottle_domain", &mirror.bottle_domain),
            ("mirror.brew_git_remote", &mirror.brew_git_remote),
            ("mirror.core_git_remote", &mirror.core_git_remote),
        ] {
            if !value.is_empty() {
                validate_url(field, value, &MIRROR_SCHEMES)?;
            }
        }
        if mirror.api_domain.is_empty() {
            return Err(invalid("mirror.api_domain", "已启用镜像但没填 API 域名"));
        }
    }

    Ok(settings)
}

// ---------------------------------------------------------------------------
// 派生值：brew 子进程环境变量 / 目录 API base
// ---------------------------------------------------------------------------

fn push_pair(out: &mut Vec<(String, String)>, key: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    out.push((key.to_string(), value.to_string()));
}

/// 代理变量同时给大小写两份：brew(Ruby) 读大写，内部的 curl / git 惯用小写。
fn push_proxy(out: &mut Vec<(String, String)>, key: &str, value: &str) {
    push_pair(out, key, value);
    push_pair(out, &key.to_ascii_lowercase(), value);
}

/// 注入每个 brew 子进程的环境变量（代理 + 镜像）。
pub fn env_pairs(settings: &Settings) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if settings.proxy.enabled {
        push_proxy(&mut out, "HTTP_PROXY", &settings.proxy.http);
        push_proxy(&mut out, "HTTPS_PROXY", &settings.proxy.https);
        push_proxy(&mut out, "ALL_PROXY", &settings.proxy.all);
        push_proxy(&mut out, "NO_PROXY", &settings.proxy.no_proxy);
    }
    if settings.mirror.enabled {
        push_pair(&mut out, "HOMEBREW_API_DOMAIN", &settings.mirror.api_domain);
        push_pair(
            &mut out,
            "HOMEBREW_BOTTLE_DOMAIN",
            &settings.mirror.bottle_domain,
        );
        push_pair(
            &mut out,
            "HOMEBREW_BREW_GIT_REMOTE",
            &settings.mirror.brew_git_remote,
        );
        push_pair(
            &mut out,
            "HOMEBREW_CORE_GIT_REMOTE",
            &settings.mirror.core_git_remote,
        );
    }
    out
}

/// 目录抓取 base URL：镜像启用则跟随镜像，否则官方。
pub fn api_base(settings: &Settings) -> String {
    if settings.mirror.enabled && !settings.mirror.api_domain.is_empty() {
        settings.mirror.api_domain.trim_end_matches('/').to_string()
    } else {
        OFFICIAL_API_DOMAIN.to_string()
    }
}

/// 已配置的 brew 路径（已在保存时校验过；此处再确认文件仍存在）。
pub fn configured_brew_path(settings: &Settings) -> Option<PathBuf> {
    let raw = settings.brew_path.as_deref()?.trim();
    if raw.is_empty() {
        return None;
    }
    let path = Path::new(raw);
    path.is_file().then(|| path.to_path_buf())
}

// ---------------------------------------------------------------------------
// 持久化
// ---------------------------------------------------------------------------

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_config_dir()?.join("settings.json"))
}

/// 启动时加载。文件缺失/损坏/字段非法都回落默认值，绝不阻塞启动。
pub fn load(app: &AppHandle) {
    let loaded = settings_path(app)
        .ok()
        .filter(|p| p.exists())
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| serde_json::from_slice::<Settings>(&bytes).ok())
        .and_then(|s| normalize(s).ok());
    match loaded {
        Some(settings) => store(settings),
        None => store(Settings::default()),
    }
}

/// 校验 → 写盘 → 更新进程内缓存，返回归一化后的设置。
pub fn save(app: &AppHandle, settings: Settings) -> AppResult<Settings> {
    let normalized = normalize(settings)?;
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&normalized)?)?;
    store(normalized.clone());
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{MirrorSettings, ProxySettings};

    fn mirror(preset: MirrorPreset, enabled: bool) -> Settings {
        Settings {
            brew_path: None,
            proxy: ProxySettings::default(),
            mirror: MirrorSettings {
                enabled,
                preset,
                ..MirrorSettings::default()
            },
        }
    }

    #[test]
    fn preset_fills_all_four_urls() {
        let s = normalize(mirror(MirrorPreset::Tuna, true)).expect("normalize ok");
        assert_eq!(s.mirror.api_domain, TUNA.api_domain);
        assert_eq!(s.mirror.bottle_domain, TUNA.bottle_domain);
        assert_eq!(s.mirror.brew_git_remote, TUNA.brew_git_remote);
        assert_eq!(s.mirror.core_git_remote, TUNA.core_git_remote);
        assert_eq!(api_base(&s), TUNA.api_domain);
    }

    #[test]
    fn official_preset_forces_mirror_off() {
        let s = normalize(mirror(MirrorPreset::Official, true)).expect("normalize ok");
        assert!(!s.mirror.enabled);
        assert_eq!(api_base(&s), OFFICIAL_API_DOMAIN);
        assert!(env_pairs(&s).is_empty());
    }

    #[test]
    fn mirror_env_pairs_cover_four_homebrew_vars() {
        let s = normalize(mirror(MirrorPreset::Ustc, true)).expect("normalize ok");
        let keys: Vec<String> = env_pairs(&s).into_iter().map(|(k, _)| k).collect();
        for expected in [
            "HOMEBREW_API_DOMAIN",
            "HOMEBREW_BOTTLE_DOMAIN",
            "HOMEBREW_BREW_GIT_REMOTE",
            "HOMEBREW_CORE_GIT_REMOTE",
        ] {
            assert!(keys.contains(&expected.to_string()), "missing {expected}");
        }
    }

    #[test]
    fn proxy_env_pairs_are_emitted_in_both_cases() {
        let settings = Settings {
            proxy: ProxySettings {
                enabled: true,
                http: "http://127.0.0.1:7890".to_string(),
                https: "http://127.0.0.1:7890".to_string(),
                all: "socks5://127.0.0.1:7891".to_string(),
                no_proxy: "localhost,127.0.0.1".to_string(),
            },
            ..Settings::default()
        };
        let s = normalize(settings).expect("normalize ok");
        let pairs = env_pairs(&s);
        let keys: Vec<&str> = pairs.iter().map(|(k, _)| k.as_str()).collect();
        assert!(keys.contains(&"HTTPS_PROXY"));
        assert!(keys.contains(&"https_proxy"));
        assert!(keys.contains(&"ALL_PROXY"));
        assert!(keys.contains(&"no_proxy"));
        // 镜像未启用 → 不应出现 HOMEBREW_* 变量
        assert!(!keys.iter().any(|k| k.starts_with("HOMEBREW_")));
    }

    #[test]
    fn rejects_bad_proxy_and_empty_proxy() {
        let bad_scheme = Settings {
            proxy: ProxySettings {
                enabled: true,
                http: "127.0.0.1:7890".to_string(),
                ..ProxySettings::default()
            },
            ..Settings::default()
        };
        assert!(normalize(bad_scheme).is_err());

        let empty = Settings {
            proxy: ProxySettings {
                enabled: true,
                ..ProxySettings::default()
            },
            ..Settings::default()
        };
        assert!(normalize(empty).is_err());
    }

    #[test]
    fn rejects_relative_and_missing_brew_path() {
        let relative = Settings {
            brew_path: Some("bin/brew".to_string()),
            ..Settings::default()
        };
        assert!(normalize(relative).is_err());

        let missing = Settings {
            brew_path: Some("/nope/definitely/not/here/brew".to_string()),
            ..Settings::default()
        };
        assert!(normalize(missing).is_err());

        let directory = Settings {
            brew_path: Some("/tmp".to_string()),
            ..Settings::default()
        };
        assert!(normalize(directory).is_err());
    }

    #[test]
    fn blank_brew_path_normalizes_to_none() {
        let s = normalize(Settings {
            brew_path: Some("   ".to_string()),
            ..Settings::default()
        })
        .expect("normalize ok");
        assert!(s.brew_path.is_none());
        assert!(configured_brew_path(&s).is_none());
    }

    #[test]
    fn custom_mirror_trims_trailing_slash_and_requires_api_domain() {
        let ok = normalize(Settings {
            mirror: MirrorSettings {
                enabled: true,
                preset: MirrorPreset::Custom,
                api_domain: "https://example.com/homebrew/api/".to_string(),
                ..MirrorSettings::default()
            },
            ..Settings::default()
        })
        .expect("normalize ok");
        assert_eq!(ok.mirror.api_domain, "https://example.com/homebrew/api");

        let missing_api = normalize(Settings {
            mirror: MirrorSettings {
                enabled: true,
                preset: MirrorPreset::Custom,
                ..MirrorSettings::default()
            },
            ..Settings::default()
        });
        assert!(missing_api.is_err());
    }
}
