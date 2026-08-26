//! Tauri command surface. Frontend access goes exclusively through src/lib/ipc.ts.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::api::catalog;
use crate::brew::{read, write, write::OpManager};
use crate::error::AppResult;
use crate::models::{
    BrewStatus, CatalogPayload, InfoOutput, MaintenanceAction, OutdatedOutput, PackageKind,
    Settings,
};

#[tauri::command]
pub async fn check_brew() -> AppResult<BrewStatus> {
    match crate::brew::brew_path() {
        Ok(path) => {
            let version = read::version().await.ok();
            Ok(BrewStatus {
                available: true,
                version,
                path: Some(path.to_string_lossy().to_string()),
            })
        }
        Err(_) => Ok(BrewStatus {
            available: false,
            version: None,
            path: None,
        }),
    }
}

#[tauri::command]
pub async fn get_catalog(app: AppHandle, force_refresh: bool) -> AppResult<CatalogPayload> {
    catalog::get_catalog(&app, force_refresh).await
}

#[tauri::command]
pub async fn get_installed() -> AppResult<InfoOutput> {
    read::installed().await
}

#[tauri::command]
pub async fn get_outdated() -> AppResult<OutdatedOutput> {
    read::outdated().await
}

#[tauri::command]
pub async fn get_package_info(name: String) -> AppResult<InfoOutput> {
    read::info(&name).await
}

// ---------------------------------------------------------------------------
// 设置（D007 / D008）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings() -> AppResult<Settings> {
    Ok(crate::settings::current())
}

/// 校验 → 写盘 → 更新进程内缓存，返回归一化后的设置（镜像预设会回填 URL）。
#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> AppResult<Settings> {
    crate::settings::save(&app, settings)
}

/// 试探一个候选 brew 可执行文件，不改动当前设置。
#[tauri::command]
pub async fn probe_brew_path(path: String) -> AppResult<BrewStatus> {
    let resolved = crate::settings::check_brew_path(path.trim())?;
    let version = read::version_at(&resolved).await?;
    Ok(BrewStatus {
        available: true,
        version: Some(version),
        path: Some(resolved.to_string_lossy().to_string()),
    })
}

// ---------------------------------------------------------------------------
// 写操作
// ---------------------------------------------------------------------------

/// 后台跑一个 op；失败时把错误也走 brew:op 通道发回去，前端卡片才不会卡在排队态。
fn spawn_args(
    app: AppHandle,
    manager: State<'_, Arc<OpManager>>,
    op_id: String,
    args: Vec<String>,
) -> AppResult<()> {
    let manager = Arc::clone(&manager);
    tauri::async_runtime::spawn(async move {
        if let Err(e) = write::run_args(app.clone(), manager, op_id.clone(), args).await {
            use crate::models::{OpEvent, OpEventKind};
            let _ = app.emit(
                "brew:op",
                OpEvent {
                    op_id,
                    kind: OpEventKind::Error,
                    phase: None,
                    line: Some(e.to_string()),
                    code: None,
                },
            );
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn install_package(
    app: AppHandle,
    manager: State<'_, Arc<OpManager>>,
    op_id: String,
    name: String,
    kind: PackageKind,
) -> AppResult<()> {
    spawn_args(
        app,
        manager,
        op_id,
        write::package_args(&name, kind, "install")?,
    )
}

#[tauri::command]
pub async fn uninstall_package(
    app: AppHandle,
    manager: State<'_, Arc<OpManager>>,
    op_id: String,
    name: String,
    kind: PackageKind,
) -> AppResult<()> {
    spawn_args(
        app,
        manager,
        op_id,
        write::package_args(&name, kind, "uninstall")?,
    )
}

#[tauri::command]
pub async fn upgrade_package(
    app: AppHandle,
    manager: State<'_, Arc<OpManager>>,
    op_id: String,
    name: String,
    kind: PackageKind,
) -> AppResult<()> {
    spawn_args(
        app,
        manager,
        op_id,
        write::package_args(&name, kind, "upgrade")?,
    )
}

/// 不带包名的维护操作：brew update / upgrade / cleanup / autoremove（白名单枚举）。
#[tauri::command]
pub async fn run_maintenance(
    app: AppHandle,
    manager: State<'_, Arc<OpManager>>,
    op_id: String,
    action: MaintenanceAction,
) -> AppResult<()> {
    spawn_args(app, manager, op_id, write::maintenance_args(action))
}

#[tauri::command]
pub async fn cancel_op(manager: State<'_, Arc<OpManager>>, op_id: String) -> AppResult<()> {
    write::cancel(&manager, &op_id).await
}
