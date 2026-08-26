//! Catalog: fetch formula.json + cask.json（官方或镜像，D008），cache under
//! `app_config_dir/catalog/`, 1h TTL, offline fallback to cache (DESIGN §5.4).

use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{Cask, CatalogPayload, Formula, Settings};
use crate::settings;

const TTL_SECS: i64 = 3600;

fn now_secs() -> AppResult<i64> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64)
}

fn cache_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_config_dir()?.join("catalog"))
}

struct CachedCatalog {
    formulae: Vec<Formula>,
    casks: Vec<Cask>,
    fetched_at: i64,
}

fn read_cache(app: &AppHandle) -> AppResult<Option<CachedCatalog>> {
    let dir = cache_dir(app)?;
    let meta_path = dir.join("meta.json");
    let formula_path = dir.join("formula.json");
    let cask_path = dir.join("cask.json");
    if !meta_path.exists() || !formula_path.exists() || !cask_path.exists() {
        return Ok(None);
    }
    let meta: serde_json::Value = serde_json::from_slice(&std::fs::read(&meta_path)?)?;
    let fetched_at = meta["fetched_at"].as_i64().unwrap_or(0);
    let formulae: Vec<Formula> = serde_json::from_slice(&std::fs::read(&formula_path)?)?;
    let casks: Vec<Cask> = serde_json::from_slice(&std::fs::read(&cask_path)?)?;
    Ok(Some(CachedCatalog {
        formulae,
        casks,
        fetched_at,
    }))
}

fn write_cache(
    app: &AppHandle,
    formulae: &[Formula],
    casks: &[Cask],
    fetched_at: i64,
) -> AppResult<()> {
    let dir = cache_dir(app)?;
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("formula.json"), serde_json::to_vec(formulae)?)?;
    std::fs::write(dir.join("cask.json"), serde_json::to_vec(casks)?)?;
    std::fs::write(
        dir.join("meta.json"),
        serde_json::to_vec(&serde_json::json!({ "fetched_at": fetched_at }))?,
    )?;
    Ok(())
}

fn no_proxy(settings: &Settings) -> Option<reqwest::NoProxy> {
    let raw = settings.proxy.no_proxy.trim();
    if raw.is_empty() {
        None
    } else {
        reqwest::NoProxy::from_string(raw)
    }
}

/// 目录抓取用的 HTTP 客户端：套用设置里的代理，并给足超时以便断网时降级到缓存。
fn build_client(settings: &Settings) -> AppResult<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .user_agent(concat!("brewlet/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90));
    if settings.proxy.enabled {
        if !settings.proxy.all.is_empty() {
            builder = builder
                .proxy(reqwest::Proxy::all(&settings.proxy.all)?.no_proxy(no_proxy(settings)));
        }
        if !settings.proxy.http.is_empty() {
            builder = builder
                .proxy(reqwest::Proxy::http(&settings.proxy.http)?.no_proxy(no_proxy(settings)));
        }
        if !settings.proxy.https.is_empty() {
            builder = builder
                .proxy(reqwest::Proxy::https(&settings.proxy.https)?.no_proxy(no_proxy(settings)));
        }
    }
    Ok(builder.build()?)
}

async fn fetch_remote(settings: &Settings) -> AppResult<(Vec<Formula>, Vec<Cask>)> {
    let client = build_client(settings)?;
    let base = settings::api_base(settings);
    let formulae: Vec<Formula> = client
        .get(format!("{base}/formula.json"))
        .send()
        .await?
        .json()
        .await?;
    let casks: Vec<Cask> = client
        .get(format!("{base}/cask.json"))
        .send()
        .await?
        .json()
        .await?;
    Ok((formulae, casks))
}

/// Catalog with cache policy: fresh cache (< TTL) wins unless `force_refresh`;
/// network failure falls back to stale cache; no cache at all → error.
pub async fn get_catalog(app: &AppHandle, force_refresh: bool) -> AppResult<CatalogPayload> {
    let now = now_secs()?;
    let settings = settings::current();

    if !force_refresh {
        if let Some(cached) = read_cache(app)? {
            if now - cached.fetched_at < TTL_SECS {
                return Ok(CatalogPayload {
                    formulae: cached.formulae,
                    casks: cached.casks,
                    fetched_at: cached.fetched_at,
                    from_cache: true,
                });
            }
        }
    }

    match fetch_remote(&settings).await {
        Ok((formulae, casks)) => {
            // Cache write failure is non-fatal; we still serve fresh data.
            let _ = write_cache(app, &formulae, &casks, now);
            Ok(CatalogPayload {
                formulae,
                casks,
                fetched_at: now,
                from_cache: false,
            })
        }
        Err(http_err) => match read_cache(app)? {
            Some(cached) => Ok(CatalogPayload {
                formulae: cached.formulae,
                casks: cached.casks,
                fetched_at: cached.fetched_at,
                from_cache: true,
            }),
            None => {
                eprintln!("warn: catalog fetch failed and no cache: {http_err}");
                Err(AppError::CatalogUnavailable)
            }
        },
    }
}
