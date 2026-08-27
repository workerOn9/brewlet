/**
 * 依赖图视图（D009）：@xyflow/react 渲染 + @dagrejs/dagre 分层布局。
 * 数据全部来自已缓存的 catalog（见 lib/depGraph.ts），零新增后端调用。
 *
 * 布局方向 LR：左边是「谁依赖它」，中间是当前包，右边是「它依赖谁」。
 */
import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import { Graph, layout } from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import { ArrowLeft, Network, PackageSearch } from "lucide-react";
import { cx } from "../../lib/cx";
import type { DepDirection, DepGraph, DepNode } from "../../lib/depGraph";
import {
  MAX_DEPTH,
  MAX_NODES,
  buildDepGraph,
  indexDependents,
  indexFormulae,
} from "../../lib/depGraph";
import type { PackageRow } from "../../lib/packages";
import { useUiStore } from "../../lib/uiStore";
import { EmptyState } from "../../components/states";

const NODE_W = 168;
const NODE_H = 34;

const DIRECTION_TABS: { value: DepDirection; label: string }[] = [
  { value: "both", label: "双向" },
  { value: "dependencies", label: "它依赖谁" },
  { value: "dependents", label: "谁依赖它" },
];

function nodeClasses(node: DepNode): string {
  if (node.role === "self") {
    return "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900";
  }
  if (node.missing) {
    return "border-dashed border-neutral-300 bg-white text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500";
  }
  if (node.outdated) {
    return "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  if (node.installed) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
  }
  return "border-neutral-200 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300";
}

function nodeLabel(node: DepNode) {
  return (
    <div
      className={cx(
        "flex h-full w-full items-center gap-1.5 rounded-md border px-2 text-left",
        nodeClasses(node),
      )}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
        {node.name}
      </span>
      {node.role !== "self" && (
        <span className="shrink-0 text-[9px] uppercase tracking-wide opacity-60">
          {node.role === "dependency" ? "dep" : "use"}
        </span>
      )}
    </div>
  );
}

/** dagre 分层布局 → React Flow 的 nodes/edges。 */
function layoutGraph(graph: DepGraph): { nodes: Node[]; edges: Edge[] } {
  const g = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ directed: true });
  g.setGraph({
    rankdir: "LR",
    nodesep: 12,
    ranksep: 90,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }
  layout(g);

  const nodes: Node[] = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      position: {
        x: (pos?.x ?? 0) - NODE_W / 2,
        y: (pos?.y ?? 0) - NODE_H / 2,
      },
      data: { label: nodeLabel(node) },
      style: {
        width: NODE_W,
        height: NODE_H,
        padding: 0,
        border: "none",
        background: "transparent",
      },
    };
  });
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    style: { strokeWidth: 1.2 },
  }));
  return { nodes, edges };
}

function Legend() {
  return (
    <div className="flex items-center gap-3 font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-neutral-900 dark:bg-neutral-100" />
        当前
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-emerald-500/60" />
        已装
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-amber-500/60" />
        过时
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm border border-dashed border-neutral-400" />
        目录缺失
      </span>
    </div>
  );
}

/**
 * 图渲染画布：受控 nodes/edges（内部 state）以便支持拖拽，并在图参数（深度 /
 * 方向 / 根节点）变化后自动重新 fitView 居中（M4 UX）。
 */
function GraphCanvas({
  flow,
  onNodeClick,
}: {
  flow: { nodes: Node[]; edges: Edge[] };
  onNodeClick: (name: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow, setNodes, setEdges]);

  // 图变化后等新节点布局渲染出来，再重新居中（React Flow 的 fitView 只在
  // 首次挂载生效，切深度/方向/换根时需手动调用）。
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      void fitView({ padding: 0.2, duration: 300 }),
    );
    return () => cancelAnimationFrame(id);
  }, [fitView, flow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      fitView
      colorMode="system"
      proOptions={{ hideAttribution: false }}
      minZoom={0.2}
      nodesConnectable={false}
      edgesFocusable={false}
    >
      <Background gap={18} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

export function DepsView({ rows }: { rows: PackageRow[] }) {
  const selected = useUiStore((s) => s.selected);
  // 图内探索的根节点（独立于全局 selected，点节点只在此深入，不弹详情面板）与返回栈。
  // 用 select 的公式懒初始化，避免进入视图时第一帧闪「没有依赖关系」。
  const [root, setRoot] = useState<string | null>(() =>
    selected !== null && selected.kind === "formula" ? selected.name : null,
  );
  const [stack, setStack] = useState<string[]>([]);
  // 深度默认 1（M4 UX）：默认只看直接依赖，需要再手动加深。
  const [depth, setDepth] = useState(1);
  const [direction, setDirection] = useState<DepDirection>("both");

  const formulae = useMemo(() => indexFormulae(rows), [rows]);
  const dependents = useMemo(() => indexDependents(rows), [rows]);

  // 进入依赖视图 / 外部改选列表时：用选中的 formula 重置探索起点。
  useEffect(() => {
    setRoot(selected !== null && selected.kind === "formula" ? selected.name : null);
    setStack([]);
  }, [selected]);

  // 点击图节点：把当前根压栈，以此为新的根深入探索。
  const explore = (name: string) => {
    if (name === root) return;
    setStack((s) => (root !== null ? [...s, root] : s));
    setRoot(name);
  };

  // 返回上一级根节点。
  const goBack = () => {
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    setRoot(prev);
    setStack((s) => s.slice(0, -1));
  };

  const graph = useMemo(
    () =>
      root === null
        ? null
        : buildDepGraph(root, formulae, dependents, depth, direction),
    [root, formulae, dependents, depth, direction],
  );

  const flow = useMemo(
    () => (graph === null ? { nodes: [], edges: [] } : layoutGraph(graph)),
    [graph],
  );

  if (selected === null) {
    return (
      <EmptyState
        icon={Network}
        title="未选择包"
        hint="在「已安装」或「目录」里点选一个 formula，这里会画出它的依赖走向。"
      />
    );
  }
  if (selected.kind === "cask") {
    return (
      <EmptyState
        icon={PackageSearch}
        title="cask 暂不支持依赖图"
        hint="cask 的 depends_on 字段还没进数据模型（v1 范围限制），请选择一个 formula。"
      />
    );
  }
  if (graph === null || graph.nodes.length <= 1) {
    return (
      <EmptyState
        icon={Network}
        title={`${root ?? selected.name} 没有可画的依赖关系`}
        hint="它既不依赖其它 formula，也没有其它已知 formula 依赖它。"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <button
          type="button"
          onClick={goBack}
          disabled={stack.length === 0}
          aria-label="返回上一级"
          className={cx(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
            stack.length > 0
              ? "text-neutral-600 hover:bg-neutral-500/10 dark:text-neutral-300"
              : "cursor-default text-neutral-300 dark:text-neutral-700",
          )}
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="font-mono text-xs text-neutral-900 dark:text-neutral-100">
          {root ?? selected.name}
        </span>
        <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
          直接依赖 {graph.directDependencies} · 被依赖 {graph.directDependents} ·
          图内 {graph.nodes.length} 节点
        </span>
        <div className="flex rounded-lg bg-neutral-500/10 p-0.5">
          {DIRECTION_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setDirection(tab.value)}
              className={cx(
                "rounded-[7px] px-2 py-0.5 text-[11px] font-medium transition-colors",
                direction === tab.value
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-neutral-400">深度</span>
          <div className="flex rounded-lg bg-neutral-500/10 p-0.5">
            {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDepth(d)}
                className={cx(
                  "w-6 rounded-[7px] py-0.5 text-[11px] font-medium transition-colors",
                  depth === d
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <Legend />
        </div>
      </div>

      {graph.truncated && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          依赖过多，已截断到 {MAX_NODES} 个节点；降低深度或切换方向可看得更清。
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <GraphCanvas flow={flow} onNodeClick={explore} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
