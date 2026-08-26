/**
 * Installed view: locally installed formulae + casks.
 */
import { PackageCheck } from "lucide-react";
import type { PackageRow } from "../../lib/packages";
import { PackageList } from "../../components/PackageList";
import { EmptyState, ErrorState, ListSkeleton } from "../../components/states";

export function InstalledView({
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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          已安装
        </h2>
        <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
          {rows.length} 个包
        </span>
      </header>
      {loading ? (
        <ListSkeleton />
      ) : error !== null ? (
        <ErrorState title="已安装列表加载失败" message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="还没有已安装的包"
          hint="切换到「目录」视图搜索并安装第一个 Formula 或 Cask。"
        />
      ) : (
        <PackageList rows={rows} variant="installed" />
      )}
    </div>
  );
}
