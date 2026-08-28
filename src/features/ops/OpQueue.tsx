/**
 * Operation queue: fixed panel at the bottom of the main column. One card per
 * op with status/phase badge, auto-scrolling log tail, cancel while
 * queued/running, dismiss when finished. Never blocks browsing.
 */
import { useEffect, useRef } from "react";
import {
  ArrowUpCircle,
  CheckCheck,
  Download,
  Eraser,
  Loader2,
  PackageMinus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../../lib/cx";
import type { OpAction, OpState, OpStatus } from "../../lib/opStore";
import { useOpStore } from "../../lib/opStore";

const ACTION_META: Record<OpAction, { label: string; icon: LucideIcon }> = {
  install: { label: "安装", icon: Download },
  uninstall: { label: "卸载", icon: Trash2 },
  upgrade: { label: "升级", icon: ArrowUpCircle },
  update: { label: "更新元数据", icon: RefreshCw },
  upgrade_all: { label: "升级全部", icon: ArrowUpCircle },
  cleanup: { label: "清理缓存", icon: Eraser },
  autoremove: { label: "移除孤立依赖", icon: PackageMinus },
};

const STATUS_META: Record<OpStatus, { label: string; classes: string }> = {
  queued: {
    label: "排队中",
    classes: "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400",
  },
  running: {
    label: "运行中",
    classes: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  done: {
    label: "完成",
    classes: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  error: {
    label: "失败",
    classes: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
  canceled: {
    label: "已取消",
    classes: "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400",
  },
};

const LOG_TAIL = 50;

function OpCard({ op }: { op: OpState }) {
  const cancel = useOpStore((s) => s.cancel);
  const dismiss = useOpStore((s) => s.dismiss);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to the newest line.
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [op.lines.length]);

  const active = op.status === "queued" || op.status === "running";
  const ActionIcon = ACTION_META[op.action].icon;
  const status = STATUS_META[op.status];
  const tail = op.lines.slice(-LOG_TAIL);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2 px-3 py-2">
        <ActionIcon className="size-3.5 shrink-0 text-neutral-400" />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {ACTION_META[op.action].label}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-900 dark:text-neutral-100">
          {op.name}
        </span>
        {op.status === "running" && (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-amber-500" />
        )}
        <span
          className={cx(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
            status.classes,
          )}
        >
          {op.status === "running" && op.phase !== null
            ? op.phase
            : status.label}
          {op.status === "done" && op.code !== null && op.code !== 0
            ? ` · exit ${op.code}`
            : ""}
        </span>
        {active ? (
          <button
            type="button"
            onClick={() => void cancel(op.id)}
            className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-[10px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            取消
          </button>
        ) : (
          <button
            type="button"
            aria-label="移除"
            onClick={() => dismiss(op.id)}
            className="shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {tail.length > 0 && (
        <div
          ref={logRef}
          className="mx-3 mb-2.5 h-20 overflow-y-auto rounded-md bg-neutral-100 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400"
        >
          {tail.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OpQueue() {
  const order = useOpStore((s) => s.order);
  const ops = useOpStore((s) => s.ops);
  const dismissFinished = useOpStore((s) => s.dismissFinished);
  if (order.length === 0) return null;

  const hasFinished = order.some((id) => {
    const op = ops[id];
    return (
      op !== undefined &&
      (op.status === "done" ||
        op.status === "error" ||
        op.status === "canceled")
    );
  });

  return (
    <div className="flex max-h-[45%] shrink-0 flex-col border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
      <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          操作队列
        </span>
        {hasFinished && (
          <button
            type="button"
            onClick={dismissFinished}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 transition-colors hover:bg-neutral-500/10 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <CheckCheck className="size-3" />
            清除已完成
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {order.map((id) => {
          const op = ops[id];
          return op !== undefined ? <OpCard key={id} op={op} /> : null;
        })}
      </div>
    </div>
  );
}
