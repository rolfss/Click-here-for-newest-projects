import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background, BackgroundVariant, MarkerType, ReactFlow, ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { Connection, NodeChange, NodeTypes, EdgeTypes } from '@xyflow/react';
import { Hand, MousePointer2 } from 'lucide-react';
import { relationColor } from '../domain/registry';
import { useCanvasStore } from '../store/canvasStore';
import { CampaignNodeView } from '../nodes/CampaignNodeView';
import type { CampaignFlowNode } from '../nodes/CampaignNodeView';
import { RelationshipEdge } from '../relationships/RelationshipEdge';
import type { CampaignFlowEdge } from '../relationships/RelationshipEdge';
import { calculateEdgeOffsets } from '../relationships/geometry';

const nodeTypes: NodeTypes = { campaign: CampaignNodeView };
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge };

function CampaignFlowInner(): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const nodePan = useRef<{
    id: number;
    startX: number;
    startY: number;
    viewport: { x: number; y: number; zoom: number };
  } | null>(null);
  const canvas = useCanvasStore((s) => s.canvas);
  const selection = useCanvasStore((s) => s.selection);
  const mode = useCanvasStore((s) => s.mode);
  const spaceHeld = useCanvasStore((s) => s.spaceHeld);
  const hand = mode === 'hand' || spaceHeld;
  const rf = useReactFlow<CampaignFlowNode, CampaignFlowEdge>();
  const setSelection = useCanvasStore((s) => s.setSelection);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setMode = useCanvasStore((s) => s.setMode);
  const addNode = useCanvasStore((s) => s.addNode);
  const connect = useCanvasStore((s) => s.connect);

  const endpointIds = useMemo(() => {
    if (selection?.kind !== 'relationship') return new Set<string>();
    const relationship = canvas.relationships.find((r) => r.id === selection.id);
    return relationship ?
      new Set([relationship.sourceId, relationship.targetId]) : new Set<string>();
  }, [canvas.relationships, selection]);

  const nodes = useMemo<CampaignFlowNode[]>(() =>
    canvas.nodes.map((record) => ({
      id: record.id,
      type: 'campaign',
      position: record.position,
      sourcePosition: undefined,
      targetPosition: undefined,
      selected: selection?.kind === 'node' && selection.id === record.id,
      data: { record, endpoint: endpointIds.has(record.id), hand },
      draggable: !hand,
      connectable: !hand,
      selectable: !hand,
    })), [canvas.nodes, selection, endpointIds, hand]);

  const edges = useMemo<CampaignFlowEdge[]>(() => {
    const offsets = calculateEdgeOffsets(canvas.relationships);
    return canvas.relationships.map((record) => ({
      id: record.id,
      type: 'relationship',
      source: record.sourceId,
      target: record.targetId,
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
      selected: selection?.kind === 'relationship' && selection.id === record.id,
      selectable: !hand,
      data: { record, offset: offsets[record.id] ?? 0 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: selection?.kind === 'relationship' && selection.id === record.id ?
          '#eaf1f6' : relationColor(record.type),
        width: 18,
        height: 18,
      },
    }));
  }, [canvas.relationships, selection, hand]);

  const onNodesChange = useCallback((changes: NodeChange<CampaignFlowNode>[]) => {
    const store = useCanvasStore.getState();
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        store.moveNode(change.id, change.position);
      }
    }
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (hand || !connection.source || !connection.target) return;
    connect(connection.source, connection.target);
  }, [hand, connect]);

  const onPaneDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (hand || !(event.target instanceof Element) ||
      !event.target.classList.contains('react-flow__pane')) return;
    const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNode(position);
  }, [hand, rf, addNode]);

  const beginNodePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!hand || event.button !== 0 || !(event.target instanceof Element) ||
        !event.target.closest('.react-flow__node, .react-flow__edge, .react-flow__edgelabel-renderer')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    nodePan.current = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      viewport: rf.getViewport(),
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [hand, rf]);

  const moveNodePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = nodePan.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    void rf.setViewport({
      x: drag.viewport.x + event.clientX - drag.startX,
      y: drag.viewport.y + event.clientY - drag.startY,
      zoom: drag.viewport.zoom,
    }, { duration: 0 });
  }, [rf]);

  const endNodePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = nodePan.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    nodePan.current = null;
    const viewport = {
      x: drag.viewport.x + event.clientX - drag.startX,
      y: drag.viewport.y + event.clientY - drag.startY,
      zoom: drag.viewport.zoom,
    };
    void rf.setViewport(viewport, { duration: 0 });
    setViewport(viewport);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [rf, setViewport]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const onCtrlWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const current = rf.getViewport();
      const zoom = Math.max(0.2, Math.min(2, current.zoom * Math.exp(-event.deltaY * 0.008)));
      const underPointer = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const bounds = element.getBoundingClientRect();
      void rf.setViewport({
        x: event.clientX - bounds.left - underPointer.x * zoom,
        y: event.clientY - bounds.top - underPointer.y * zoom,
        zoom,
      }, { duration: 0 });
    };
    element.addEventListener('wheel', onCtrlWheel, { capture: true, passive: false });
    return () => element.removeEventListener('wheel', onCtrlWheel, true);
  }, [rf]);

  return (
    <div ref={container} className={'flow-stage ' + (hand ? 'is-hand-mode' : 'is-select-mode')}
      onDoubleClick={onPaneDoubleClick}
      onPointerDownCapture={beginNodePan}
      onPointerMove={moveNodePan}
      onPointerUp={endNodePan}
      onPointerCancel={endNodePan}
      aria-label="Campaign relationship canvas">
      <ReactFlow<CampaignFlowNode, CampaignFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        isValidConnection={(candidate) => candidate.source !== candidate.target}
        onNodeClick={(_, node) => { if (!hand) setSelection({ kind: 'node', id: node.id }); }}
        onEdgeClick={(_, edge) => { if (!hand) setSelection({ kind: 'relationship', id: edge.id }); }}
        onPaneClick={() => setSelection(null)}
        onMoveEnd={(_, viewport) => setViewport(viewport)}
        defaultViewport={canvas.viewport}
        nodesDraggable={!hand}
        nodesConnectable={!hand}
        elementsSelectable={!hand}
        panOnDrag={hand}
        panOnScroll
        panOnScrollMode={undefined}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2}
        selectionOnDrag={false}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        deleteKeyCode={null}
        panActivationKeyCode={null}
        elevateEdgesOnSelect
        fitView={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#303840" bgColor="#12161b" />
      </ReactFlow>

      {canvas.nodes.length === 0 && (
        <div className="empty-hint">Double-click to add a character</div>
      )}
      <div className="canvas-mode" role="group" aria-label="Canvas interaction mode">
        <button
          type="button" className={'mode-button' + (mode === 'select' ? ' active' : '')}
          aria-pressed={mode === 'select'} title="Select mode (V)"
          onClick={() => setMode('select')}
        ><MousePointer2 size={15} /><span>Select</span><kbd>V</kbd></button>
        <button
          type="button" className={'mode-button' + (mode === 'hand' ? ' active' : '')}
          aria-pressed={mode === 'hand'} title="Hand mode (H); hold Space temporarily"
          onClick={() => setMode('hand')}
        ><Hand size={15} /><span>Hand</span><kbd>H</kbd></button>
      </div>
      <div className="zoom-label" aria-label="Current zoom">
        {Math.round(canvas.viewport.zoom * 100)}%
        <span className="zoom-description">Ctrl + wheel to zoom</span>
      </div>
    </div>
  );
}
export function CampaignFlow(): JSX.Element {
  return (
    <ReactFlowProvider>
      <CampaignFlowInner />
    </ReactFlowProvider>
  );
}
