"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Workflow as WorkflowIcon, RotateCcw } from "lucide-react";
import {
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  MarkerType,
  type Node,
  type Edge,
  type OnNodeDrag,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import FlowMapCanvas, { NODE_WIDTH, estimateNodeHeight } from "@/components/FlowMapCanvas";
import { computeLayout, buildDisplayEdges } from "@/lib/flow";
import type { SanitizedUser, FlowGraph, Tag } from "@/lib/types";

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [], tags: [] };

/** localStorage key for user-dragged node positions (persisted per browser). */
const POSITIONS_KEY = "filedrop.flowmap.positions";
type XY = { x: number; y: number };

/** Load saved node positions; safe on the server and against malformed data. */
function loadPositions(): Record<string, XY> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(POSITIONS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, XY> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const p = v as { x?: unknown; y?: unknown };
      if (typeof p?.x === "number" && typeof p?.y === "number") out[id] = { x: p.x, y: p.y };
    }
    return out;
  } catch {
    return {};
  }
}

function savePositions(positions: Record<string, XY>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/**
 * When a tag is selected, compute which nodes are fully visible (the tagged
 * "primary" nodes plus their one-hop neighbors) vs. de-emphasized. Returns
 * nulls when no tag is selected (everything visible, nothing dimmed).
 */
function computeVisibility(
  graph: FlowGraph,
  selectedTagId: string,
): { visible: Set<string> | null; primary: Set<string> | null } {
  if (!selectedTagId) return { visible: null, primary: null };
  const primary = new Set(
    graph.nodes.filter((n) => n.tagIds.includes(selectedTagId)).map((n) => n.id),
  );
  const visible = new Set(primary);
  for (const e of graph.edges) {
    if (primary.has(e.source)) visible.add(e.target);
    if (primary.has(e.target)) visible.add(e.source);
  }
  return { visible, primary };
}

/** Toolbar lives inside ReactFlowProvider so export can read the live node store. */
function FlowToolbar({
  tags,
  selectedTagId,
  onTagChange,
  onRefresh,
  onResetLayout,
  wrapperRef,
}: {
  tags: Tag[];
  selectedTagId: string;
  onTagChange: (id: string) => void;
  onRefresh: () => void;
  onResetLayout: () => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { getNodes } = useReactFlow();
  const [exporting, setExporting] = useState(false);

  // A4 landscape at 300 DPI, with a print margin so nodes never touch the edge.
  const A4_LANDSCAPE = { width: 3508, height: 2480 };
  const PRINT_MARGIN = 96;

  const exportPng = async () => {
    const viewport = wrapperRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
    const visible = getNodes().filter((n) => !n.hidden);
    if (!viewport || visible.length === 0) return;
    setExporting(true);
    try {
      const bounds = getNodesBounds(visible);
      const contentW = A4_LANDSCAPE.width - PRINT_MARGIN * 2;
      const contentH = A4_LANDSCAPE.height - PRINT_MARGIN * 2;
      // Fit the whole graph into the printable area, then offset by the margin
      // so it sits centered inside the A4 sheet and is never clipped.
      const t = getViewportForBounds(bounds, contentW, contentH, 0.05, 2, 0);
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(viewport, {
        backgroundColor: bg,
        width: A4_LANDSCAPE.width,
        height: A4_LANDSCAPE.height,
        style: {
          width: `${A4_LANDSCAPE.width}px`,
          height: `${A4_LANDSCAPE.height}px`,
          transform: `translate(${t.x + PRINT_MARGIN}px, ${t.y + PRINT_MARGIN}px) scale(${t.zoom})`,
        },
      });
      const a = document.createElement("a");
      a.setAttribute("download", "flow-map.png");
      a.setAttribute("href", dataUrl);
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <button className="btn btn-secondary" onClick={onRefresh} title="Reload graph">
        <RefreshCw className="w-4 h-4" /> Refresh
      </button>
      <button
        className="btn btn-secondary"
        onClick={onResetLayout}
        title="Reset node positions to the default layout"
      >
        <RotateCcw className="w-4 h-4" /> Reset layout
      </button>
      <select
        className="select"
        value={selectedTagId}
        onChange={(e) => onTagChange(e.target.value)}
        style={{ maxWidth: 260 }}
      >
        <option value="">All connectors (full topology)</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>Tag: {t.name}</option>
        ))}
      </select>
      <div className="flex-1" />
      <button className="btn btn-secondary" onClick={exportPng} disabled={exporting}>
        {exporting ? "Exporting\u2026" : "Export PNG (A4)"}
      </button>
    </div>
  );
}

export default function FlowMapPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [graph, setGraph] = useState<FlowGraph>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(true);
  const [selectedTagId, setSelectedTagId] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const fetchGraph = useCallback(() => {
    setLoading(true);
    fetch("/api/flow-graph").then((r) => r.json()).then((data) => {
      setGraph(data && Array.isArray(data.nodes) ? data : EMPTY_GRAPH);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (user) fetchGraph(); }, [user, fetchGraph]);

  const layout = useMemo(() => computeLayout(graph.nodes), [graph.nodes]);
  const tagById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of graph.tags) m.set(t.id, t);
    return m;
  }, [graph.tags]);

  // Node positions are owned here so drags persist (localStorage) and can be reset.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const positionsRef = useRef<Record<string, XY>>({});

  const buildNodes = useCallback((): Node[] => {
    const { visible, primary } = computeVisibility(graph, selectedTagId);
    return graph.nodes.map((n) => {
      const tags = n.tagIds.map((id) => tagById.get(id)).filter(Boolean) as Tag[];
      const pos = positionsRef.current[n.id] ?? layout.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        type: "flowNode",
        position: pos,
        width: NODE_WIDTH,
        height: estimateNodeHeight(tags.length > 0),
        data: { node: n, tags, dim: !!visible && !primary!.has(n.id) },
        hidden: !!visible && !visible.has(n.id),
      };
    });
  }, [graph, layout, tagById, selectedTagId]);

  // Load saved positions once on mount (client only; absent during SSR).
  useEffect(() => {
    positionsRef.current = loadPositions();
  }, []);

  // Rebuild nodes whenever the graph, layout, or selection changes.
  useEffect(() => {
    setNodes(buildNodes());
  }, [buildNodes, setNodes]);

  const onNodeDragStop = useCallback<OnNodeDrag>((_e, node) => {
    positionsRef.current = { ...positionsRef.current, [node.id]: { x: node.position.x, y: node.position.y } };
    savePositions(positionsRef.current);
  }, []);

  const resetLayout = useCallback(() => {
    positionsRef.current = {};
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(POSITIONS_KEY); } catch { /* ignore */ }
    }
    setNodes(buildNodes());
  }, [buildNodes, setNodes]);

  const rfEdges = useMemo<Edge[]>(() => {
    const { visible } = computeVisibility(graph, selectedTagId);
    // Inline the stroke (and matching marker color) so html-to-image captures
    // the edge lines in the PNG export. Relying on the .react-flow__edge-path
    // CSS class makes the lines disappear in the exported image.
    const EDGE_COLOR = "#b1b1b7";
    const marker = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: EDGE_COLOR };
    return buildDisplayEdges(graph.edges).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      type: "smoothstep",
      markerEnd: marker,
      markerStart: e.bidirectional ? marker : undefined,
      style: { stroke: EDGE_COLOR, strokeWidth: 2 },
      hidden: !!visible && !(visible.has(e.source) && visible.has(e.target)),
    }));
  }, [graph, selectedTagId]);

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  const hasGraph = graph.nodes.length > 0;

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Flow Map</h1>
          </div>

          {!hasGraph && !loading ? (
            <div className="empty-state">
              <WorkflowIcon className="empty-state-icon" />
              <p className="empty-state-title">Nothing to map yet</p>
              <p className="empty-state-description">Configure endpoints, destinations, transfers, or integrations to see how files move between them.</p>
            </div>
          ) : (
            <ReactFlowProvider>
              <FlowToolbar
                tags={graph.tags}
                selectedTagId={selectedTagId}
                onTagChange={setSelectedTagId}
                onRefresh={fetchGraph}
                onResetLayout={resetLayout}
                wrapperRef={wrapperRef}
              />
              <div
                ref={wrapperRef}
                className="rounded-lg border border-border overflow-hidden bg-surface-alt"
                style={{ height: "calc(100vh - 220px)", minHeight: 460 }}
              >
                <FlowMapCanvas
                  nodes={nodes}
                  edges={rfEdges}
                  onNodesChange={onNodesChange}
                  onNodeDragStop={onNodeDragStop}
                />
              </div>
            </ReactFlowProvider>
          )}
        </div>
      </div>
    </div>
  );
}
