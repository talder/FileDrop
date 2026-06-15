"use client";

import { memo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type OnNodesChange,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  KeyRound,
  Inbox,
  ArrowRightLeft,
  Workflow,
  FolderOpen,
  Server,
  Network,
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import type { FlowNode, NodeKind, Tag } from "@/lib/types";

/** Per-kind visual metadata (icon + accent color + readable label). */
export const KIND_META: Record<NodeKind, { label: string; color: string; Icon: LucideIcon }> = {
  party: { label: "API Key", color: "#6366f1", Icon: KeyRound },
  endpoint: { label: "Endpoint", color: "#0ea5e9", Icon: Inbox },
  transfer: { label: "Transfer", color: "#f59e0b", Icon: ArrowRightLeft },
  integration: { label: "Integration", color: "#8b5cf6", Icon: Workflow },
  destination: { label: "Destination", color: "#10b981", Icon: FolderOpen },
  sftp: { label: "SFTP", color: "#ef4444", Icon: Server },
  soap: { label: "SOAP", color: "#ec4899", Icon: Network },
  ftp: { label: "FTP", color: "#14b8a6", Icon: HardDrive },
};

/** Data carried by each React Flow node. */
export interface FlowNodeData {
  node: FlowNode;
  tags: Tag[];
  /** De-emphasize (neighbor of a selected tag, but not itself tagged). */
  dim: boolean;
}

export const NODE_WIDTH = 210;

/**
 * Approximate rendered height (px) of a node card. Used to give React Flow
 * explicit node dimensions so the MiniMap can draw boxes and PNG export can
 * compute accurate (non-clipping) bounds. Estimated slightly generously.
 */
export function estimateNodeHeight(hasTags: boolean): number {
  return hasTags ? 84 : 56;
}

function FlowNodeCardImpl({ data }: NodeProps) {
  const { node, tags, dim } = data as unknown as FlowNodeData;
  const meta = KIND_META[node.kind];
  const Icon = meta.Icon;
  return (
    <div
      style={{
        width: NODE_WIDTH,
        opacity: dim ? 0.35 : 1,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `4px solid ${meta.color}`,
        borderRadius: 10,
        padding: "8px 10px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, border: "none" }} />
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-text-primary truncate">{node.label}</div>
          <div className="text-[10px] text-text-muted truncate">
            {meta.label}{node.sub ? ` · ${node.sub}` : ""}
          </div>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {tags.map((t) => (
            <span
              key={t.id}
              title={t.name}
              className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: `${t.color}22`, color: t.color }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0, border: "none" }} />
    </div>
  );
}

const FlowNodeCard = memo(FlowNodeCardImpl);

export const nodeTypes = { flowNode: FlowNodeCard };

interface FlowMapCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onNodeDragStop: OnNodeDrag;
}

/** Accent color for a node in the minimap (falls back to gray). */
function miniMapNodeColor(n: Node): string {
  const kind = (n.data as unknown as FlowNodeData)?.node?.kind;
  return (kind && KIND_META[kind]?.color) || "#9ca3af";
}

/**
 * Pan/zoom/draggable topology canvas. Must be rendered inside a
 * <ReactFlowProvider> so the toolbar can share the same store for export.
 * Node positions are owned by the parent (for drag persistence + reset).
 */
export default function FlowMapCanvas({ nodes, edges, onNodesChange, onNodeDragStop }: FlowMapCanvasProps) {
  const { fitView } = useReactFlow();
  const didFit = useRef(false);

  // The graph is fetched after mount, so nodes start empty and the `fitView`
  // prop fits nothing. Fit once after nodes first populate.
  useEffect(() => {
    if (didFit.current || nodes.length === 0) return;
    didFit.current = true;
    const id = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [nodes, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      fitView
      minZoom={0.1}
      defaultEdgeOptions={{
        labelStyle: { fontSize: 11, fill: "var(--color-text-secondary)" },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.92 },
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeColor={miniMapNodeColor}
        nodeStrokeColor={miniMapNodeColor}
        nodeStrokeWidth={3}
        nodeBorderRadius={4}
        maskColor="rgba(15, 23, 42, 0.08)"
      />
    </ReactFlow>
  );
}
