/**
 * Operation queue store (zustand) — tracks brew write ops and their streamed
 * output, fed by the "brew:op" Tauri event channel (DESIGN §5.2).
 * 包操作带 name/kind；维护操作（brew update 等）name 为命令文本、kind 为 null。
 */
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { QueryClient } from "@tanstack/react-query";
import { ipc } from "./ipc";
import { queryKeys } from "./queries";
import type { MaintenanceAction, OpEvent, PackageKind } from "../types";

export type PackageAction = "install" | "uninstall" | "upgrade";
export type OpAction = PackageAction | MaintenanceAction;
export type OpStatus = "queued" | "running" | "done" | "error" | "canceled";

/** 维护操作在队列里显示的命令文本（与后端 maintenance_args 一一对应）。 */
export const MAINTENANCE_LABEL: Record<MaintenanceAction, string> = {
  update: "brew update",
  upgrade_all: "brew upgrade",
  upgrade_formulae: "brew upgrade --formula",
  upgrade_casks: "brew upgrade --cask",
  cleanup: "brew cleanup",
  autoremove: "brew autoremove",
};

export interface OpState {
  id: string;
  action: OpAction;
  name: string;
  kind: PackageKind | null;
  status: OpStatus;
  phase: string | null;
  lines: string[];
  code: number | null;
}

const MAX_LINES = 500;

/** 新建一个排队中的 op（真正的 brew 调用由各 action 发起）。 */
function newOp(
  action: OpAction,
  name: string,
  kind: PackageKind | null,
): OpState {
  return {
    id: crypto.randomUUID(),
    action,
    name,
    kind,
    status: "queued",
    phase: null,
    lines: [],
    code: null,
  };
}

interface OpStore {
  ops: Record<string, OpState>;
  order: string[];
  startOp: (
    action: PackageAction,
    name: string,
    kind: PackageKind,
  ) => Promise<void>;
  startMaintenance: (action: MaintenanceAction) => Promise<void>;
  /** 多选升级：同一 kind 的一组包合成一条 `brew upgrade [--cask] a b c`。 */
  startUpgradeMany: (names: string[], kind: PackageKind) => Promise<void>;
  cancel: (opId: string) => Promise<void>;
  dismiss: (opId: string) => void;
  /** 批量移除所有已结束（done/error/canceled）的操作（M4 UX）。 */
  dismissFinished: () => void;
  applyEvent: (ev: OpEvent) => void;
}

export const useOpStore = create<OpStore>((set, get) => ({
  ops: {},
  order: [],

  startOp: async (action, name, kind) => {
    const op = newOp(action, name, kind);
    set((s) => ({
      ops: { ...s.ops, [op.id]: op },
      order: [op.id, ...s.order],
    }));
    const fn =
      action === "install"
        ? ipc.installPackage
        : action === "uninstall"
          ? ipc.uninstallPackage
          : ipc.upgradePackage;
    try {
      await fn(op.id, name, kind);
    } catch (e) {
      get().applyEvent({
        op_id: op.id,
        kind: "error",
        line: String(e),
      });
    }
  },

  startMaintenance: async (action) => {
    const op = newOp(action, MAINTENANCE_LABEL[action], null);
    set((s) => ({
      ops: { ...s.ops, [op.id]: op },
      order: [op.id, ...s.order],
    }));
    try {
      await ipc.runMaintenance(op.id, action);
    } catch (e) {
      get().applyEvent({
        op_id: op.id,
        kind: "error",
        line: String(e),
      });
    }
  },

  startUpgradeMany: async (names, kind) => {
    const op = newOp("upgrade", names.join(" "), kind);
    set((s) => ({
      ops: { ...s.ops, [op.id]: op },
      order: [op.id, ...s.order],
    }));
    try {
      await ipc.upgradePackages(op.id, names, kind);
    } catch (e) {
      get().applyEvent({
        op_id: op.id,
        kind: "error",
        line: String(e),
      });
    }
  },

  cancel: async (opId) => {
    // 后端对排队中的 op 也能取消；若 op 已结束并从 map 移除会报 OpNotFound，
    // 此时前端静默忽略（卡片已经结束，无需再操作）。
    await ipc.cancelOp(opId).catch(() => {});
  },

  dismiss: (opId) =>
    set((s) => {
      const ops = { ...s.ops };
      delete ops[opId];
      return { ops, order: s.order.filter((id) => id !== opId) };
    }),

  dismissFinished: () =>
    set((s) => {
      const finished = s.order.filter((id) => {
        const op = s.ops[id];
        return (
          op !== undefined &&
          (op.status === "done" ||
            op.status === "error" ||
            op.status === "canceled")
        );
      });
      if (finished.length === 0) return s;
      const ops = { ...s.ops };
      for (const id of finished) delete ops[id];
      return {
        ops,
        order: s.order.filter((id) => !finished.includes(id)),
      };
    }),

  applyEvent: (ev) =>
    set((s) => {
      const op = s.ops[ev.op_id];
      if (!op) return s;
      const next: OpState = { ...op };
      switch (ev.kind) {
        case "phase":
          next.phase = ev.phase ?? null;
          next.status = "running";
          break;
        case "line":
          if (ev.line !== undefined) {
            next.lines = [...op.lines.slice(-(MAX_LINES - 1)), ev.line];
          }
          break;
        case "done":
          next.status = "done";
          next.code = ev.code ?? null;
          break;
        case "error":
          next.status = "error";
          next.code = ev.code ?? null;
          if (ev.line) next.lines = [...op.lines, ev.line];
          break;
        case "canceled":
          next.status = "canceled";
          next.code = ev.code ?? null;
          break;
      }
      return { ops: { ...s.ops, [ev.op_id]: next } };
    }),
}));

/** Attach the global brew:op listener; call once at app startup. */
export async function initOpListener(queryClient: QueryClient): Promise<void> {
  await listen<OpEvent>("brew:op", (event) => {
    useOpStore.getState().applyEvent(event.payload);
    const kind = event.payload.kind;
    if (kind === "done" || kind === "error" || kind === "canceled") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.installed });
      void queryClient.invalidateQueries({ queryKey: queryKeys.outdated });
    }
  });
}
