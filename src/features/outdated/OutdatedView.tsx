/**
 * Outdated view: packages with a newer upstream version. Rows show
 * installed → current. Upgrading happens from the detail panel.
 */
import { ArrowUpCircle } from "lucide-react";
import type { PackageRow } from "../../lib/packages";
import { PackageList } from "../../components/PackageList";
import { EmptyState, ErrorState, ListSkeleton } from "../../components/states";

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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          过时
        </h2>
        <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
          {rows.length} 个可升级
        </span>
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
        <PackageList rows={rows} variant="outdated" />
      )}
    </div>
  );
}
