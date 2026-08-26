/**
 * Sole invoke entry point (AGENTS.md §3). All IPC goes through these wrappers.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  BrewStatus,
  CatalogPayload,
  InfoOutput,
  MaintenanceAction,
  OutdatedOutput,
  PackageKind,
  Settings,
} from "../types";

export const ipc = {
  checkBrew: () => invoke<BrewStatus>("check_brew"),
  getCatalog: (forceRefresh = false) =>
    invoke<CatalogPayload>("get_catalog", { forceRefresh }),
  getInstalled: () => invoke<InfoOutput>("get_installed"),
  getOutdated: () => invoke<OutdatedOutput>("get_outdated"),
  getPackageInfo: (name: string) =>
    invoke<InfoOutput>("get_package_info", { name }),
  getSettings: () => invoke<Settings>("get_settings"),
  /** 后端会校验并归一化（镜像预设回填 URL），返回落盘后的结果。 */
  saveSettings: (settings: Settings) =>
    invoke<Settings>("save_settings", { settings }),
  probeBrewPath: (path: string) => invoke<BrewStatus>("probe_brew_path", { path }),
  installPackage: (opId: string, name: string, kind: PackageKind) =>
    invoke<void>("install_package", { opId, name, kind }),
  uninstallPackage: (opId: string, name: string, kind: PackageKind) =>
    invoke<void>("uninstall_package", { opId, name, kind }),
  upgradePackage: (opId: string, name: string, kind: PackageKind) =>
    invoke<void>("upgrade_package", { opId, name, kind }),
  runMaintenance: (opId: string, action: MaintenanceAction) =>
    invoke<void>("run_maintenance", { opId, action }),
  cancelOp: (opId: string) => invoke<void>("cancel_op", { opId }),
};
