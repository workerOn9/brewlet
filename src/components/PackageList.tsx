/**
 * Shared virtualized package list (@tanstack/react-virtual) used by the
 * catalog / installed / outdated views.
 *
 * 键盘导航（M4 UX）：↑/↓/Home/End 在行间移动并自动滚动跟随，Enter/Space 选中；
 * 以当前选中行为基准做相对移动，并将移动后的行置为选中（打开右侧详情）。
 * 滚动容器可聚焦（tabIndex=0），行保留 role=button 便于无障碍聚焦。
 */
import { useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight } from "lucide-react";
import { cx } from "../lib/cx";
import type { PackageRow } from "../lib/packages";
import { useUiStore } from "../lib/uiStore";
import { RowChips } from "./StatusChips";

export type ListVariant = "catalog" | "installed" | "outdated";

// h-14 = 56px, border included (border-box).
const ROW_HEIGHT = 56;

function KindBadge({ kind }: { kind: PackageRow["kind"] }) {
  return (
    <span
      className={cx(
        "shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none",
        kind === "formula"
          ? "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400"
          : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      )}
    >
      {kind === "formula" ? "Formula" : "Cask"}
    </span>
  );
}

function Row({
  row,
  variant,
  selected,
  onSelect,
}: {
  row: PackageRow;
  variant: ListVariant;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cx(
        "flex h-14 w-full cursor-pointer flex-col justify-center gap-0.5 border-b border-neutral-200/70 px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 dark:border-neutral-800/70 dark:focus-visible:ring-neutral-500",
        selected
          ? "bg-neutral-200/70 dark:bg-neutral-800/80"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-900/60",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {row.displayName}
        </span>
        <KindBadge kind={row.kind} />
        <RowChips row={row} interactive={variant === "catalog"} />
        <span className="ml-auto shrink-0 font-mono text-xs text-neutral-500 dark:text-neutral-400">
          {row.version ?? "—"}
        </span>
      </div>
      <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
        {variant === "outdated" ? (
          <span className="inline-flex items-center gap-1 font-mono">
            <span className="text-red-600/80 dark:text-red-400/80">
              {row.installedVersion ?? "?"}
            </span>
            <ArrowRight className="size-3 shrink-0" />
            <span className="text-emerald-600 dark:text-emerald-400">
              {row.currentVersion ?? row.version ?? "?"}
            </span>
          </span>
        ) : (
          (row.desc ?? row.name)
        )}
      </div>
    </div>
  );
}

export function PackageList({
  rows,
  variant,
}: {
  rows: PackageRow[];
  variant: ListVariant;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selected = useUiStore((s) => s.selected);
  const setSelected = useUiStore((s) => s.setSelected);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (i) => rows[i].id,
  });

  // 当前选中行在过滤后的列表中的下标；未选中时为 -1（键盘导航从头部开始）。
  const selectedIndex = useMemo(
    () =>
      rows.findIndex(
        (r) =>
          selected !== null &&
          r.name === selected.name &&
          r.kind === selected.kind,
      ),
    [rows, selected],
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    let next = selectedIndex;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        next = Math.min(selectedIndex + 1, rows.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        next = Math.max(selectedIndex - 1, 0);
        break;
      case "Home":
        e.preventDefault();
        next = 0;
        break;
      case "End":
        e.preventDefault();
        next = rows.length - 1;
        break;
      default:
        return;
    }
    if (next === selectedIndex) return;
    const row = rows[next];
    setSelected({ name: row.name, kind: row.kind });
    virtualizer.scrollToIndex(next, { align: "auto" });
  };

  return (
    <div
      ref={parentRef}
      role="listbox"
      aria-label={variant === "catalog" ? "包目录" : variant === "installed" ? "已安装" : "可升级"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto outline-none"
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          return (
            <div
              key={vi.key}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <Row
                row={row}
                variant={variant}
                selected={vi.index === selectedIndex}
                onSelect={() =>
                  setSelected({ name: row.name, kind: row.kind })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
