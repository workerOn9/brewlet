/**
 * Catalog view: Formula/Cask segmented filter、可点击状态芯片筛选、缓存横幅、
 * 虚拟滚动列表。搜索框在顶部工具栏（全局，⌘K），此处只消费 store 里的 search。
 */
import { useMemo } from "react";
import { CloudOff, Search } from "lucide-react";
import { cx } from "../../lib/cx";
import type { KindFilter, PackageRow } from "../../lib/packages";
import { filterPackages } from "../../lib/packages";
import { useUiStore } from "../../lib/uiStore";
import { PackageList } from "../../components/PackageList";
import { FilterChips } from "../../components/StatusChips";
import { EmptyState, ErrorState, ListSkeleton } from "../../components/states";

const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "formula", label: "Formula" },
  { value: "cask", label: "Cask" },
];

function KindSegment() {
  const kindFilter = useUiStore((s) => s.kindFilter);
  const setKindFilter = useUiStore((s) => s.setKindFilter);
  return (
    <div className="flex shrink-0 rounded-lg bg-neutral-500/10 p-0.5">
      {KIND_TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => setKindFilter(tab.value)}
          className={cx(
            "rounded-[7px] px-2.5 py-1 text-xs font-medium transition-colors",
            kindFilter === tab.value
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CatalogView({
  rows,
  loading,
  error,
  fromCache,
  onRetry,
}: {
  rows: PackageRow[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  onRetry: () => void;
}) {
  const search = useUiStore((s) => s.search);
  const kindFilter = useUiStore((s) => s.kindFilter);
  const statusFilter = useUiStore((s) => s.statusFilter);

  const filtered = useMemo(
    () => filterPackages(rows, search, kindFilter, statusFilter),
    [rows, search, kindFilter, statusFilter],
  );

  const filtering =
    search.trim().length > 0 || kindFilter !== "all" || statusFilter !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <KindSegment />
          <span className="shrink-0 font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
            {filtering ? `${filtered.length} / ${rows.length}` : rows.length}
          </span>
        </div>
        <FilterChips />
      </div>

      {fromCache && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <CloudOff className="size-3.5 shrink-0" />
          离线或请求超时，当前展示本地缓存目录，可能不是最新。
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : error !== null ? (
        <ErrorState
          title="目录加载失败"
          message={error}
          onRetry={onRetry}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={filtering ? "没有匹配的包" : "目录为空"}
          hint={
            filtering
              ? "试试更换关键词，或清除类型 / 状态筛选。"
              : "目录尚未加载任何数据。"
          }
        />
      ) : (
        <PackageList rows={filtered} variant="catalog" />
      )}
    </div>
  );
}
