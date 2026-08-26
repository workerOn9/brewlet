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

interface OpStore {
  ops: Record<string, OpState>;
  order: string[];
  startOp: (
    action: PackageAction,
    name: string,
    kind: PackageKind,
  ) => Promise<void>;
  startMaintenance: (action: MaintenanceAction) => Promise<void>;
  cancel: (opId: string) => Promise<void>;
  dismiss: (opId: string) => void;
  applyEvent: (ev: OpEvent) => void;
}

export const useOpStore = create<OpStore>((set, get) => ({
  ops: {},
  order: [],

  startOp: async (action, name, kind) => {
    const opId = crypto.randomUUID();
    set((s) => ({
      ops: {
        ...s.ops,
        [opId]: {
          id: opId,
          action,
          name,
          kind,
          status: "queued",
          phase: null,
          lines: [],
          code: null,
        },
      },
      order: [opId, ...s.order],
    }));
    const fn =
      action === "install"
        ? ipc.installPackage
        : action === "uninstall"
          ? ipc.uninstallPackage
          : ipc.upgradePackage;
    try {
      await fn(opId, name, kind);
    } catch (e) {
      get().applyEvent({
        op_id: opId,
        kind: "error",
        line: String(e),
      });
    }
  },

  startMaintenance: async (action) => {
    const opId = crypto.randomUUID();
    set((s) => ({
      ops: {
        ...s.ops,
        [opId]: {
          id: opId,
          action,
          name: MAINTENANCE_LABEL[action],
          kind: null,
          status: "queued",
          phase: null,
          lines: [],
          code: null,
        },
      },
      order: [opId, ...s.order],
    }));
    try {
      await ipc.runMaintenance(opId, action);
    } catch (e) {
      get().applyEvent({
        op_id: opId,
        kind: "error",
        line: String(e),
      });
    }
  },

  cancel: async (opId) => {
    await ipc.cancelOp(opId);
  },

  dismiss: (opId) =>
    set((s) => {
      const ops = { ...s.ops };
      delete ops[opId];
      return { ops, order: s.order.filter((id) => id !== opId) };
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
