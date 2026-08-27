/**
 * 顶部工具栏（D010）：macOS 统一工具栏风格——整条横跨窗口顶部，左侧留出红绿灯
 * 位置。承载左右栏折叠、常驻全局搜索（⌘K）、维护操作菜单（brew update 等）、
 * 目录刷新与设置入口。
 *
 * 拖拽区只挂在非交互的填充元素上（`data-tauri-drag-region`），保证按钮点击不会
 * 被窗口拖拽吞掉。
 */
import { useEffect, useRef, useState } from "react";
import {
  Eraser,
  PanelLeft,
  PanelRight,
  PackageMinus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../lib/cx";
import { useOpStore } from "../lib/opStore";
import { useRefreshCatalog } from "../lib/queries";
import { useUiStore } from "../lib/uiStore";
import type { MaintenanceAction } from "../types";

const MAINTENANCE_ITEMS: {
  action: MaintenanceAction;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  {
    action: "update",
    label: "更新 Homebrew",
    hint: "brew update：同步 formula/cask 元数据",
    icon: RefreshCw,
  },
  {
    action: "upgrade_all",
    label: "升级全部包",
    hint: "brew upgrade：升级所有过时的包",
    icon: PackageMinus,
  },
  {
    action: "cleanup",
    label: "清理缓存",
    hint: "brew cleanup：删除旧版本与下载缓存",
    icon: Eraser,
  },
  {
    action: "autoremove",
    label: "移除孤立依赖",
    hint: "brew autoremove：清掉不再被需要的依赖",
    icon: PackageMinus,
  },
];

function IconButton({
  label,
  active = false,
  onClick,
  icon: Icon,
  spinning = false,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  icon: LucideIcon;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-neutral-500/15 text-neutral-900 dark:text-neutral-100"
          : "text-neutral-500 hover:bg-neutral-500/10 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
      )}
    >
      <Icon className={cx("size-4", spinning && "animate-spin")} />
    </button>
  );
}

function MaintenanceMenu() {
  const [open, setOpen] = useState(false);
  const startMaintenance = useOpStore((s) => s.startMaintenance);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="维护"
        title="维护"
        className={cx(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          open
            ? "bg-neutral-500/15 text-neutral-900 dark:text-neutral-100"
            : "text-neutral-500 hover:bg-neutral-500/10 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
        )}
      >
        <Wrench className="size-4" />
      </button>
      {open && (
        <>
          {/* 点击空白处关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-64 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {MAINTENANCE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void startMaintenance(item.action);
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-neutral-400" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      {item.label}
                    </span>
                    <span className="block font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function Toolbar() {
  const search = useUiStore((s) => s.search);
  const searchInCatalog = useUiStore((s) => s.searchInCatalog);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const detailCollapsed = useUiStore((s) => s.detailCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleDetail = useUiStore((s) => s.toggleDetail);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const refreshCatalog = useRefreshCatalog();

  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(search);
  const [refreshing, setRefreshing] = useState(false);

  // 300ms 防抖写入全局 store；非空查询会自动切到目录视图。
  useEffect(() => {
    const t = setTimeout(() => searchInCatalog(value), 300);
    return () => clearTimeout(t);
  }, [value, searchInCatalog]);

  // ⌘K 聚焦搜索框
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.code === "KeyK") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void refreshCatalog().finally(() => setRefreshing(false));
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50/80 px-3 dark:border-neutral-800 dark:bg-neutral-900/60">
      {/* 左侧折叠按钮（最左，app 标题「Brewlet」由 macOS 标题栏显示） */}
      <IconButton
        label="收起/展开侧边栏 (⌘⌥S)"
        icon={PanelLeft}
        active={!sidebarCollapsed}
        onClick={toggleSidebar}
      />
      {/* 中间：搜索框整行居中（两侧剩余空间兼作拖拽区）；刷新按钮内嵌于输入框右缘，成一体 */}
      <div
        className="flex min-w-0 flex-1 items-center justify-center px-2"
        data-tauri-drag-region
      >
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Escape 清空搜索并失焦（M4 UX，浏览器惯例）。
              if (e.key === "Escape" && value.length > 0) {
                e.preventDefault();
                setValue("");
                searchInCatalog("");
                inputRef.current?.blur();
              }
            }}
            placeholder="搜索并安装 formula / cask…"
            spellCheck={false}
            className="h-7 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-16 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500"
          />
          {value.length === 0 && (
            <kbd className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 rounded border border-neutral-300 bg-neutral-100 px-1.5 font-mono text-[10px] leading-5 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              ⌘K
            </kbd>
          )}
          {value.length > 0 && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => {
                setValue("");
                searchInCatalog("");
                inputRef.current?.focus();
              }}
              className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <X className="size-3.5" />
            </button>
          )}
          {/* 刷新按钮：并入搜索框内部最右侧，作为一个整体 */}
          <button
            type="button"
            aria-label="刷新目录 (⌘R)"
            title="刷新目录 (⌘R)"
            onClick={onRefresh}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-500/10 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <RefreshCw
              className={cx("size-3.5", refreshing && "animate-spin")}
            />
          </button>
        </div>
      </div>
      {/* 右侧图标区 */}
      <MaintenanceMenu />
      <IconButton
        label="设置 (⌘,)"
        icon={SettingsIcon}
        onClick={() => setSettingsOpen(true)}
      />
      <IconButton
        label="收起/展开详情面板 (⌘⌥I)"
        icon={PanelRight}
        active={!detailCollapsed}
        onClick={toggleDetail}
      />
    </header>
  );
}
