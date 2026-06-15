"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Workflow as WorkflowIcon } from "lucide-react";
import {
  ReactFlowProvider,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type Edge,
} from "@xyflow/react";
import { toSvg, toPng } from "html-to-image";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import FlowMapCanvas from "@/components/FlowMapCanvas";
import { computeLayout } from "@/lib/flow";
import type { SanitizedUser, FlowGraph, Tag } from "@/lib/types";

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [], tags: [] };

/** Toolbar lives inside ReactFlowProvider so export can read the live node store. */
function FlowToolbar({
  tags,
  selectedTagId,
  onTagChange,
  onRefresh,
  wrapperRef,
}: {
  tags: Tag[];
  selectedTagId: string;
  onTagChange: (id: string) => void;
  onRefresh: () => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { getNodes } = useReactFlow();
  const [exporting, setExporting] = useState(false);

  const download = (dataUrl: string, ext: string) => {
    const a = document.createElement("a");
    a.setAttribute("download", `flow-map.${ext}`);
    a.setAttribute("href", dataUrl);
    a.click();
  };

  const doExport = async (kind: "svg" | "png") => {
    const viewport = wrapperRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
    const visible = getNodes().filter((n) => !n.hidden);
    if (!viewport || visible.length === 0) return;
    setExporting(true);
    try {
      const bounds = getNodesBounds(visible);
      const pad = 80;
      const width = Math.max(Math.ceil(bounds.width) + pad * 2, 400);
      const height = Math.max(Math.ceil(bounds.height) + pad * 2, 300);
      const t = getViewportForBounds(bounds, width, height, 0.2, 2, 0.1);
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const opts = {
        backgroundColor: bg,
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.zoom})`,
        },
      };
      const dataUrl = kind === "svg" ? await toSvg(viewport, opts) : await toPng(viewport, opts);
      download(dataUrl, kind);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <button className="btn btn-secondary" onClick={onRefresh} title="Reload graph">
        <RefreshCw className="w-4 h-4" /> Refresh
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
      <button className="btn btn-secondary" onClick={() => doExport("svg")} disabled={exporting}>Export SVG</button>
      <button className="btn btn-secondary" onClick={() => doExport("png")} disabled={exporting}>Export PNG</button>
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

  const { rfNodes, rfEdges } = useMemo(() => {
    // When a tag is selected, show its members ("primary") plus their one-hop
    // neighbors (de-emphasized); hide everything else.
    let visible: Set<string> | null = null;
    let primary: Set<string> | null = null;
    if (selectedTagId) {
      primary = new Set(graph.nodes.filter((n) => n.tagIds.includes(selectedTagId)).map((n) => n.id));
      visible = new Set(primary);
      for (const e of graph.edges) {
        if (primary.has(e.source)) visible.add(e.target);
        if (primary.has(e.target)) visible.add(e.source);
      }
    }
    const rfNodes: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: "flowNode",
      position: layout.get(n.id) ?? { x: 0, y: 0 },
      data: {
        node: n,
        tags: n.tagIds.map((id) => tagById.get(id)).filter(Boolean) as Tag[],
        dim: !!visible && !primary!.has(n.id),
      },
      hidden: !!visible && !visible.has(n.id),
    }));
    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      hidden: !!visible && !(visible.has(e.source) && visible.has(e.target)),
    }));
    return { rfNodes, rfEdges };
  }, [graph, layout, tagById, selectedTagId]);

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
                wrapperRef={wrapperRef}
              />
              <div
                ref={wrapperRef}
                className="rounded-lg border border-border overflow-hidden bg-surface-alt"
                style={{ height: "calc(100vh - 220px)", minHeight: 460 }}
              >
                <FlowMapCanvas nodes={rfNodes} edges={rfEdges} />
              </div>
            </ReactFlowProvider>
          )}
        </div>
      </div>
    </div>
  );
}
