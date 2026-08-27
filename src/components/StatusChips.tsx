/**
 * Status chips: 已安装 / 可升级 / 已锁定 / Keg-only / 已弃用.
 * Row chips double as clickable filters (DESIGN §7).
 */
import { cx } from "../lib/cx";
import type { PackageRow, StatusFilter } from "../lib/packages";
import { matchesStatus } from "../lib/packages";
import { useUiStore } from "../lib/uiStore";

const CHIP_ORDER: StatusFilter[] = [
  "installed",
  "outdated",
  "pinned",
  "kegOnly",
  "deprecated",
];

const CHIP_META: Record<StatusFilter, { label: string; classes: string }> = {
  installed: {
    label: "已安装",
    classes:
      "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  },
  outdated: {
    label: "可升级",
    classes:
      "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
  },
  pinned: {
    label: "已锁定",
    classes:
      "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-400",
  },
  kegOnly: {
    label: "Keg-only",
    classes:
      "bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-400",
  },
  deprecated: {
    label: "已弃用",
    classes:
      "bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-400",
  },
};

function chipClasses(filter: StatusFilter): string {
  return CHIP_META[filter].classes;
}

/** Chips present on a row; clicking one toggles it as the catalog filter. */
export function RowChips({
  row,
  interactive = false,
}: {
  row: PackageRow;
  interactive?: boolean;
}) {
  const toggleStatusFilter = useUiStore((s) => s.toggleStatusFilter);
  const present = CHIP_ORDER.filter((f) => matchesStatus(row, f));
  if (present.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {present.map((f) => (
        <span
          key={f}
          title={interactive ? "点击筛选" : undefined}
          onClick={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  toggleStatusFilter(f);
                }
              : undefined
          }
          className={cx(
            "rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
            chipClasses(f),
            interactive && "cursor-pointer hover:brightness-95",
          )}
        >
          {CHIP_META[f].label}
        </span>
      ))}
    </span>
  );
}

/** Toolbar filter chips (catalog view). */
export function FilterChips() {
  const statusFilter = useUiStore((s) => s.statusFilter);
  const toggleStatusFilter = useUiStore((s) => s.toggleStatusFilter);
  return (
    <div className="flex items-center gap-1.5">
      {CHIP_ORDER.map((f) => {
        const active = statusFilter === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => toggleStatusFilter(f)}
            className={cx(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? cx(chipClasses(f), "ring-1 ring-current")
                : "bg-neutral-500/10 text-neutral-600 hover:bg-neutral-500/15 dark:text-neutral-400",
            )}
          >
            {CHIP_META[f].label}
          </button>
        );
      })}
    </div>
  );
}
