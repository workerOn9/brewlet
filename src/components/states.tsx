/**
 * Shared state placeholders: loading skeleton, empty state, error state.
 */
import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";

export function ListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex-1 space-y-px overflow-hidden p-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-14 animate-pulse flex-col justify-center gap-2 rounded-md px-2"
          style={{ opacity: 1 - i * 0.07 }}
        >
          <div className="h-3 w-2/5 rounded bg-neutral-300/60 dark:bg-neutral-700/60" />
          <div className="h-2.5 w-3/5 rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon className="size-8 text-neutral-300 dark:text-neutral-600" />
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
        {title}
      </p>
      {hint !== undefined && (
        <p className="max-w-64 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {title}
      </p>
      <p className="max-w-72 break-words font-mono text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
        {message}
      </p>
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          <RefreshCw className="size-3.5" />
          重试
        </button>
      )}
    </div>
  );
}
