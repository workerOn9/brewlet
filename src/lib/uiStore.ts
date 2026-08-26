/**
 * UI-only state (zustand): active sidebar view, selection, search input,
 * 三栏折叠状态（D010，持久化到 localStorage）与设置面板开合。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PackageKind } from "../types";
import type { KindFilter, StatusFilter } from "./packages";

export type View = "installed" | "outdated" | "catalog" | "deps";

export interface SelectedPackage {
  name: string;
  kind: PackageKind;
}

interface UiStore {
  view: View;
  search: string;
  selected: SelectedPackage | null;
  kindFilter: KindFilter;
  statusFilter: StatusFilter | null;
  sidebarCollapsed: boolean;
  detailCollapsed: boolean;
  settingsOpen: boolean;
  setView: (v: View) => void;
  setSearch: (q: string) => void;
  /** 全局搜索框：非空查询自动切到目录视图（D010）。 */
  searchInCatalog: (q: string) => void;
  setSelected: (p: SelectedPackage | null) => void;
  setKindFilter: (k: KindFilter) => void;
  toggleStatusFilter: (f: StatusFilter) => void;
  toggleSidebar: () => void;
  toggleDetail: () => void;
  setSettingsOpen: (open: boolean) => void;
}

type PersistedUi = Pick<UiStore, "sidebarCollapsed" | "detailCollapsed">;

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      view: "installed",
      search: "",
      selected: null,
      kindFilter: "all",
      statusFilter: null,
      sidebarCollapsed: false,
      detailCollapsed: false,
      settingsOpen: false,
      setView: (view) => set({ view }),
      setSearch: (search) => set({ search }),
      searchInCatalog: (search) =>
        set((s) => ({
          search,
          view: search.trim().length > 0 ? "catalog" : s.view,
        })),
      setSelected: (selected) => set({ selected }),
      setKindFilter: (kindFilter) => set({ kindFilter }),
      toggleStatusFilter: (f) =>
        set((s) => ({ statusFilter: s.statusFilter === f ? null : f })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleDetail: () => set((s) => ({ detailCollapsed: !s.detailCollapsed })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    }),
    {
      name: "brewlet-ui",
      partialize: (s): PersistedUi => ({
        sidebarCollapsed: s.sidebarCollapsed,
        detailCollapsed: s.detailCollapsed,
      }),
    },
  ),
);
