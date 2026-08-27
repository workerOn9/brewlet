/**
 * 依赖图数据构建（D009）：纯函数，数据源是已缓存的 catalog（formula.json 自带
 * dependencies），因此零新增后端调用、零文本解析。
 *
 * 方向约定：
 * - 正向 `dependency`：本包依赖谁，边为 包 → 依赖；
 * - 反向 `dependent`：谁依赖本包，边为 依赖方 → 包。
 * dagre 用 LR 排布时，根节点自然落在中间：左边是依赖方，右边是依赖。
 */
import type { PackageRow } from "./packages";

export type DepDirection = "both" | "dependencies" | "dependents";
export type DepRole = "self" | "dependency" | "dependent";

export interface DepNode {
  id: string;
  name: string;
  role: DepRole;
  /** 距根节点的层数（根为 0）。 */
  depth: number;
  installed: boolean;
  outdated: boolean;
  missing: boolean;
}

export interface DepEdge {
  id: string;
  source: string;
  target: string;
}

export interface DepGraph {
  nodes: DepNode[];
  edges: DepEdge[];
  /** 直接依赖数 / 直接依赖方数（不受深度与节点上限影响）。 */
  directDependencies: number;
  directDependents: number;
  /** 命中节点上限被截断。 */
  truncated: boolean;
}

/** 单图节点上限：超过就截断，避免 ffmpeg 这类超深依赖把画布拖垮。 */
export const MAX_NODES = 120;
export const MAX_DEPTH = 3;

/** formula 名 → row 索引（依赖图只覆盖 formula，cask 的 depends_on 未进模型）。 */
export function indexFormulae(rows: PackageRow[]): Map<string, PackageRow> {
  const map = new Map<string, PackageRow>();
  for (const row of rows) {
    if (row.kind === "formula") map.set(row.name, row);
  }
  return map;
}

/** 反向索引：被依赖包名 → 依赖它的包名列表。 */
export function indexDependents(rows: PackageRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (row.kind !== "formula") continue;
    for (const dep of row.dependencies) {
      const list = map.get(dep);
      if (list === undefined) {
        map.set(dep, [row.name]);
      } else if (!list.includes(row.name)) {
        list.push(row.name);
      }
    }
  }
  return map;
}

function toNode(
  name: string,
  role: DepRole,
  depth: number,
  row: PackageRow | undefined,
): DepNode {
  return {
    id: name,
    name,
    role,
    depth,
    installed: row?.installed ?? false,
    outdated: row?.outdated ?? false,
    missing: row === undefined,
  };
}

/**
 * 以 `rootName` 为中心做双向 BFS。命中 MAX_NODES 即停止扩展并标记 truncated。
 */
export function buildDepGraph(
  rootName: string,
  formulae: Map<string, PackageRow>,
  dependents: Map<string, string[]>,
  depth: number,
  direction: DepDirection = "both",
): DepGraph {
  const maxDepth = Math.min(Math.max(depth, 1), MAX_DEPTH);
  const root = formulae.get(rootName);
  const nodes = new Map<string, DepNode>([
    [rootName, toNode(rootName, "self", 0, root)],
  ]);
  const edges = new Map<string, DepEdge>();
  let truncated = false;

  const addEdge = (source: string, target: string) => {
    const id = `${source}->${target}`;
    if (!edges.has(id)) edges.set(id, { id, source, target });
  };

  const walk = (role: Exclude<DepRole, "self">) => {
    let frontier = [rootName];
    for (let level = 1; level <= maxDepth; level += 1) {
      const nextFrontier: string[] = [];
      for (const current of frontier) {
        const neighbours =
          role === "dependency"
            ? (formulae.get(current)?.dependencies ?? [])
            : (dependents.get(current) ?? []);
        for (const neighbour of neighbours) {
          if (nodes.size >= MAX_NODES && !nodes.has(neighbour)) {
            truncated = true;
            continue;
          }
          if (!nodes.has(neighbour)) {
            nodes.set(
              neighbour,
              toNode(neighbour, role, level, formulae.get(neighbour)),
            );
            nextFrontier.push(neighbour);
          }
          if (role === "dependency") {
            addEdge(current, neighbour);
          } else {
            addEdge(neighbour, current);
          }
        }
      }
      if (nextFrontier.length === 0) break;
      frontier = nextFrontier;
    }
  };

  if (direction !== "dependents") walk("dependency");
  if (direction !== "dependencies") walk("dependent");

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    directDependencies: root?.dependencies.length ?? 0,
    directDependents: (dependents.get(rootName) ?? []).length,
    truncated,
  };
}
