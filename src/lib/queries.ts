import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "./ipc";
import type { Settings } from "../types";

export const queryKeys = {
  brewStatus: ["brew-status"] as const,
  catalog: ["catalog"] as const,
  installed: ["installed"] as const,
  outdated: ["outdated"] as const,
  settings: ["settings"] as const,
  packageInfo: (name: string) => ["package-info", name] as const,
};

export function useBrewStatus() {
  return useQuery({
    queryKey: queryKeys.brewStatus,
    queryFn: ipc.checkBrew,
    staleTime: 60_000,
  });
}

/** Catalog is cached disk-side with a 1h TTL (DESIGN §5.4); frontend adds a
 * matching staleTime and a manual refresh path via useRefreshCatalog. */
export function useCatalog() {
  return useQuery({
    queryKey: queryKeys.catalog,
    queryFn: () => ipc.getCatalog(false),
    staleTime: 60 * 60 * 1000,
  });
}

/** 强制重拉目录（跳过磁盘 TTL）并把结果写回 query cache。 */
export function useRefreshCatalog() {
  const queryClient = useQueryClient();
  return async () => {
    const data = await ipc.getCatalog(true);
    queryClient.setQueryData(queryKeys.catalog, data);
    return data;
  };
}

export function useInstalled() {
  return useQuery({
    queryKey: queryKeys.installed,
    queryFn: ipc.getInstalled,
    staleTime: 0,
  });
}

export function useOutdated() {
  return useQuery({
    queryKey: queryKeys.outdated,
    queryFn: ipc.getOutdated,
    staleTime: 0,
  });
}

/** 设置由后端持有唯一真值（进程内缓存 + settings.json）。 */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: ipc.getSettings,
    staleTime: Infinity,
  });
}

/** 保存设置：成功后刷新 brew 状态，并让目录失效（镜像可能变了）。 */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: Settings) => ipc.saveSettings(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings, saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.brewStatus });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
    },
  });
}
