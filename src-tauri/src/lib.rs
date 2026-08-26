mod api;
mod brew;
mod commands;
mod error;
mod models;
mod settings;

pub use error::AppError;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .manage(std::sync::Arc::new(brew::write::OpManager::new()))
        .setup(|app| {
            // 设置要在任何 brew 调用之前进入进程内缓存（brew 路径 / 代理 / 镜像）。
            settings::load(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_brew,
            commands::get_catalog,
            commands::get_installed,
            commands::get_outdated,
            commands::get_package_info,
            commands::get_settings,
            commands::save_settings,
            commands::probe_brew_path,
            commands::install_package,
            commands::uninstall_package,
            commands::upgrade_package,
            commands::run_maintenance,
            commands::cancel_op,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("fatal: failed to run tauri application: {e}");
        std::process::exit(1);
    }
}
