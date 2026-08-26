/**
 * 应用外壳（D010）：顶部统一工具栏 + 三栏（侧边栏 | 主列表 + 操作队列 | 详情），
 * 左右两栏可折叠。数据编排留在这里，视图保持表现层（DESIGN §7）。
 */
import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  useBrewStatus,
  useCatalog,
  useInstalled,
  useOutdated,
  useRefreshCatalog,
} from "./lib/queries";
import { buildPackages, byInstalled, packageId } from "./lib/packages";
import type { PackageRow } from "./lib/packages";
import { useUiStore } from "./lib/uiStore";
import { BrewMissing } from "./components/BrewMissing";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { CatalogView } from "./features/catalog/CatalogView";
import { DepsView } from "./features/deps/DepsView";
import { InstalledView } from "./features/installed/InstalledView";
import { OutdatedView } from "./features/outdated/OutdatedView";
import { PackageDetail } from "./features/package-detail/PackageDetail";
import { OpQueue } from "./features/ops/OpQueue";
import { SettingsPanel } from "./features/settings/SettingsPanel";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App() {
  const brewStatus = useBrewStatus();
  const catalog = useCatalog();
  const installed = useInstalled();
  const outdated = useOutdated();
  const refreshCatalog = useRefreshCatalog();
  const view = useUiStore((s) => s.view);
  const selected = useUiStore((s) => s.selected);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const detailCollapsed = useUiStore((s) => s.detailCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleDetail = useUiStore((s) => s.toggleDetail);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  // 全局快捷键：⌘⌥S 左栏 · ⌘⌥I 右栏 · ⌘, 设置 · ⌘R 刷新目录。
  // 用 e.code 而非 e.key —— macOS 上按住 Option 会改变 e.key 的字符。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.altKey && e.code === "KeyI") {
        e.preventDefault();
        toggleDetail();
      } else if (!e.altKey && e.code === "Comma") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (!e.altKey && e.code === "KeyR") {
        e.preventDefault();
        void refreshCatalog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar, toggleDetail, setSettingsOpen, refreshCatalog]);

  const rows = useMemo(
    () => buildPackages(catalog.data, installed.data, outdated.data),
    [catalog.data, installed.data, outdated.data],
  );
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const installedRows = useMemo(
    () => rows.filter((r) => r.installed).sort(byInstalled),
    [rows],
  );
  const outdatedRows = useMemo(
    () => rows.filter((r) => r.outdated).sort(byInstalled),
    [rows],
  );
  const counts = useMemo(
    () => ({
      installed: installedRows.length,
      outdated: outdatedRows.length,
      catalog: rows.length,
      deps: null,
    }),
    [installedRows.length, outdatedRows.length, rows.length],
  );

  const selectedRow: PackageRow | null =
    selected !== null
      ? (byId.get(packageId(selected.kind, selected.name)) ?? null)
      : null;

  // Gate: Homebrew must exist for anything else to make sense.
  if (brewStatus.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (
    brewStatus.isError ||
    brewStatus.data === undefined ||
    !brewStatus.data.available
  ) {
    return (
      <>
        <BrewMissing
          checkError={
            brewStatus.isError ? errorMessage(brewStatus.error) : undefined
          }
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <SettingsPanel />
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          counts={counts}
          brewVersion={brewStatus.data.version}
          collapsed={sidebarCollapsed}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {view === "catalog" ? (
            <CatalogView
              rows={rows}
              loading={catalog.isLoading}
              error={catalog.isError ? errorMessage(catalog.error) : null}
              fromCache={catalog.data?.from_cache ?? false}
              onRetry={() => void catalog.refetch()}
            />
          ) : view === "installed" ? (
            <InstalledView
              rows={installedRows}
              loading={installed.isLoading}
              error={installed.isError ? errorMessage(installed.error) : null}
              onRetry={() => void installed.refetch()}
            />
          ) : view === "outdated" ? (
            <OutdatedView
              rows={outdatedRows}
              loading={outdated.isLoading}
              error={outdated.isError ? errorMessage(outdated.error) : null}
              onRetry={() => void outdated.refetch()}
            />
          ) : (
            <DepsView rows={rows} />
          )}
          <OpQueue />
        </main>
        <PackageDetail row={selectedRow} collapsed={detailCollapsed} />
      </div>
      <SettingsPanel />
    </div>
  );
}
