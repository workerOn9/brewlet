/**
 * Package detail panel (320px, 可折叠 D010): metadata + contextual actions.
 * Install when not installed; Uninstall + Upgrade when installed;
 * Upgrade when outdated. Buttons disable while the package has a
 * queued/running op.
 */
import {
  ArrowRight,
  ArrowUpCircle,
  Download,
  HardDrive,
  Info,
  Link2,
  Network,
  Trash2,
} from "lucide-react";
import { cx } from "../../lib/cx";
import type { PackageRow } from "../../lib/packages";
import { ipc } from "../../lib/ipc";
import { useOpStore } from "../../lib/opStore";
import type { PackageAction } from "../../lib/opStore";
import { useUiStore } from "../../lib/uiStore";
import { EmptyState } from "../../components/states";
import { RowChips } from "../../components/StatusChips";

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (value === null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
        {label}
      </span>
      <span
        className={cx(
          "break-all text-right text-xs text-neutral-700 dark:text-neutral-300",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  action,
  row,
  busy,
  primary = false,
  danger = false,
}: {
  action: PackageAction;
  row: PackageRow;
  busy: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const startOp = useOpStore((s) => s.startOp);
  const meta =
    action === "install"
      ? { label: "安装", icon: Download }
      : action === "uninstall"
        ? { label: "卸载", icon: Trash2 }
        : { label: "升级", icon: ArrowUpCircle };
  const Icon = meta.icon;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void startOp(action, row.name, row.kind)}
      className={cx(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
        primary &&
          "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300",
        danger &&
          "border border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400",
        !primary &&
          !danger &&
          "border border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
        busy && "cursor-not-allowed opacity-40",
      )}
    >
      <Icon className="size-3.5" />
      {meta.label}
    </button>
  );
}

function DetailBody({ row }: { row: PackageRow }) {
  const setView = useUiStore((s) => s.setView);
  const setSelected = useUiStore((s) => s.setSelected);
  // const 局部捕获，TS 才能在 onClick 闭包内保留 `!== null` 窄化（boxed prop 会丢失）。
  const homepage = row.homepage;
  const busy = useOpStore((s) =>
    s.order.some((id) => {
      const op = s.ops[id];
      return (
        op !== undefined &&
        op.name === row.name &&
        op.kind === row.kind &&
        (op.status === "queued" || op.status === "running")
      );
    }),
  );

  return (
    <>
      <div className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="break-all text-base font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
              {row.displayName}
            </h2>
            {row.displayName !== row.name && (
              <p className="mt-0.5 break-all font-mono text-xs text-neutral-400">
                {row.name}
              </p>
            )}
          </div>
          <span
            className={cx(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              row.kind === "formula"
                ? "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400"
                : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
            )}
          >
            {row.kind === "formula" ? "Formula" : "Cask"}
          </span>
        </div>
        <div className="mt-2">
          <RowChips row={row} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!row.installed && (
            <ActionButton action="install" row={row} busy={busy} primary />
          )}
          {row.installed && (
            <ActionButton action="uninstall" row={row} busy={busy} danger />
          )}
          {row.installed && row.outdated && (
            <ActionButton action="upgrade" row={row} busy={busy} primary />
          )}
        </div>
      </div>

      {row.desc !== null && (
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
            {row.desc}
          </p>
        </div>
      )}

      <div className="border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <MetaRow label="最新版本" value={row.version} mono />
        <MetaRow label="已装版本" value={row.installedVersion} mono />
        {row.outdated && (
          <MetaRow label="可升级至" value={row.currentVersion} mono />
        )}
        <MetaRow label="Tap" value={row.tap} mono />
        <MetaRow label="License" value={row.license} mono />
        {homepage !== null && (
          <a
            href={homepage}
            target="_blank"
            rel="noopener noreferrer"
            title="用默认浏览器打开"
            onClick={(e) => {
              // 默认 target=_blank 在 Tauri v2 此环境不生效，改用 open_url 命令用系统浏览器打开。
              e.preventDefault();
              void ipc.openUrl(homepage);
            }}
            className="flex items-start gap-2 py-1 font-mono text-[11px] leading-relaxed text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <Link2 className="mt-0.5 size-3 shrink-0 text-neutral-400" />
            <span className="break-all">{homepage}</span>
          </a>
        )}
      </div>

      {(row.installedVersions.length > 0 || row.linkedKeg !== null) && (
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            <HardDrive className="size-3.5" />
            安装信息
          </h3>
          {row.installedVersions.length > 0 && (
            <p className="mt-1.5 break-all font-mono text-xs text-neutral-500 dark:text-neutral-400">
              {row.installedVersions.join(", ")}
            </p>
          )}
          {row.linkedKeg !== null && (
            <p className="mt-1 break-all font-mono text-[11px] text-neutral-400 dark:text-neutral-500">
              linked → {row.linkedKeg}
            </p>
          )}
        </div>
      )}

      {row.dependencies.length > 0 && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              <Network className="size-3.5" />
              依赖（{row.dependencies.length}）
            </h3>
            <button
              type="button"
              onClick={() => setView("deps")}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 transition-colors hover:bg-indigo-500/10 dark:text-indigo-400"
            >
              查看依赖走向
              <ArrowRight className="size-3" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {row.dependencies.map((dep) => (
              <button
                key={dep}
                type="button"
                title="查看此依赖的详情"
                onClick={() => setSelected({ name: dep, kind: "formula" })}
                className="rounded bg-neutral-500/10 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 transition-colors hover:bg-neutral-500/20 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-500/20 dark:hover:text-neutral-100"
              >
                {dep}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-neutral-400 dark:text-neutral-500">
            点击某个依赖可查看它的详情；要看依赖走向，点右上角「查看依赖走向」。
          </p>
        </div>
      )}
    </>
  );
}

export function PackageDetail({
  row,
  collapsed,
}: {
  row: PackageRow | null;
  collapsed: boolean;
}) {
  return (
    <aside
      className={cx(
        "shrink-0 overflow-hidden border-neutral-200 transition-[width] duration-200 ease-out dark:border-neutral-800",
        collapsed ? "w-0 border-l-0" : "w-80 border-l",
      )}
    >
      <div className="flex h-full w-80 flex-col overflow-y-auto">
        {row === null ? (
          <EmptyState
            icon={Info}
            title="未选择包"
            hint="在左侧列表中点击一个 Formula 或 Cask 查看详情与操作。"
          />
        ) : (
          <DetailBody row={row} />
        )}
      </div>
    </aside>
  );
}
