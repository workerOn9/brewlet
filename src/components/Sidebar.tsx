/**
 * Sidebar navigation (220px)：已安装 / 过时 / 目录 / 依赖，带计数徽章。
 * 可折叠（D010）——折叠时宽度归零并隐藏溢出，内容保持固定宽度不被挤压。
 */
import { ArrowUpCircle, LayoutGrid, Network, PackageCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../lib/cx";
import type { View } from "../lib/uiStore";
import { useUiStore } from "../lib/uiStore";

export interface SidebarCounts {
  installed: number;
  outdated: number;
  catalog: number;
  deps: number | null;
}

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "installed", label: "已安装", icon: PackageCheck },
  { view: "outdated", label: "过时", icon: ArrowUpCircle },
  { view: "catalog", label: "目录", icon: LayoutGrid },
  { view: "deps", label: "依赖", icon: Network },
];

export function Sidebar({
  counts,
  brewVersion,
  collapsed,
}: {
  counts: SidebarCounts;
  brewVersion: string | null;
  collapsed: boolean;
}) {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);

  return (
    <aside
      className={cx(
        "shrink-0 overflow-hidden border-neutral-200 bg-neutral-50 transition-[width] duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-900/50",
        collapsed ? "w-0 border-r-0" : "w-[220px] border-r",
      )}
    >
      <div className="flex h-full w-[220px] flex-col">
        <div className="px-4 pb-3 pt-4">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Brewlet
          </h1>
          <p className="mt-0.5 font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
            {brewVersion !== null ? `brew ${brewVersion}` : "Homebrew GUI"}
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ view: v, label, icon: Icon }) => {
            const active = view === v;
            const count = counts[v];
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-neutral-200/80 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                    : "text-neutral-600 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {count !== null && (
                  <span
                    className={cx(
                      "rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none",
                      v === "outdated" && count > 0
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-3 text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-600">
          Homebrew 的可视化外壳
        </div>
      </div>
    </aside>
  );
}
