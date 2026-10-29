/**
 * Outdated view: packages with a newer upstream version. Rows show
 * installed → current. Supports multi-select bulk upgrade (`brew upgrade a b c`)
 * and one-click scope upgrades (`brew upgrade --formula` / `--cask`).
 */
import { useMemo, useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { cx } from "../../lib/cx";
import type { PackageRow } from "../../lib/packages";
import { useOpStore } from "../../lib/opStore";
import { PackageList } from "../../components/PackageList";
import { EmptyState, ErrorState, ListSkeleton } from "../../components/states";
import type { PackageKind } from "../../types";

const KINDS: PackageKind[] = ["formula", "cask"];

function HeaderButton({
  children,
  disabled,
  primary = false,
  title,
  onClick,
}: {
  children: string;
  disabled: boolean;
  primary?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cx(
        "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        primary
          ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
      )}
    >
      {children}
    </button>
  );
}

export function OutdatedView({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: PackageRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const startUpgradeMany = useOpStore((s) => s.startUpgradeMany);
  const startMaintenance = useOpStore((s) => s.startMaintenance);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const pickedRows = useMemo(
    () => rows.filter((r) => picked.has(r.id)),
    [rows, picked],
  );
  const allPicked = rows.length > 0 && pickedRows.length === rows.length;
  const formulaCount = rows.filter((r) => r.kind === "formula").length;
  const caskCount = rows.length - formulaCount;

  const togglePicked = (row: PackageRow) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });

  const toggleAll = () =>
    setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));

  // brew 一条命令不能混升级 formula 与 cask，按 kind 各起一个 op。
  const upgradePicked = () => {
    for (const kind of KINDS) {
      const names = pickedRows
        .filter((r) => r.kind === kind)
        .map((r) => r.name);
      if (names.length > 0) void startUpgradeMany(names, kind);
    }
    setPicked(new Set());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          过时
        </h2>
        <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
          {rows.length} 个可升级
        </span>
        {rows.length > 0 && (
          <>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={toggleAll}
                className="size-3.5 accent-neutral-900 dark:accent-neutral-200"
              />
              全选
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <HeaderButton
                primary
                disabled={pickedRows.length === 0}
                title="升级勾选的包：brew upgrade a b c"
                onClick={upgradePicked}
              >
                {pickedRows.length > 0
                  ? `升级选中 (${pickedRows.length})`
                  : "升级选中"}
              </HeaderButton>
              <HeaderButton
                disabled={formulaCount === 0}
                title="只升级全部过时的 formula：brew upgrade --formula"
                onClick={() => void startMaintenance("upgrade_formulae")}
              >
                {`升级全部 Formula (${formulaCount})`}
              </HeaderButton>
              <HeaderButton
                disabled={caskCount === 0}
                title="只升级全部过时的 cask：brew upgrade --cask"
                onClick={() => void startMaintenance("upgrade_casks")}
              >
                {`升级全部 Cask (${caskCount})`}
              </HeaderButton>
            </div>
          </>
        )}
      </header>
      {loading ? (
        <ListSkeleton />
      ) : error !== null ? (
        <ErrorState title="过时列表加载失败" message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ArrowUpCircle}
          title="全部是最新版本"
          hint="没有检测到过时的包。选中某个包即可在右侧面板升级。"
        />
      ) : (
        <PackageList
          rows={rows}
          variant="outdated"
          picked={picked}
          onTogglePicked={togglePicked}
        />
      )}
    </div>
  );
}
