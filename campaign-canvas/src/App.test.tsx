import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { createEmptyCanvas } from './domain/rules';
import { repository } from './storage/repository';
import { useCanvasStore } from './store/canvasStore';

type StubNode = { id: string; data: { record: { data: { name: string } } } };
type StubEdge = { id: string };
type StubFlowProps = {
  nodes: StubNode[];
  edges: StubEdge[];
  panOnDrag: boolean;
  onPaneDoubleClick?: (e: ReactMouseEvent<Element, MouseEvent>) => void;
  onPaneClick?: () => void;
  onNodeClick?: (e: ReactMouseEvent<Element, MouseEvent>, node: StubNode) => void;
  onEdgeClick?: (e: ReactMouseEvent<Element, MouseEvent>, edge: StubEdge) => void;
  onConnect?: (connection: {
    source: string; target: string; sourceHandle: string; targetHandle: string;
  }) => void;
};
vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ReactFlow: (props: StubFlowProps) => (
    <section data-testid="flow" data-pan={String(props.panOnDrag)}
      onDoubleClick={props.onPaneDoubleClick} aria-label="Mock relationship map">
      <button onClick={props.onPaneClick}>Empty canvas</button>
      {props.nodes.map((node) => (
        <button type="button" key={node.id}
          onClick={(event) => props.onNodeClick?.(event, node)}>
          {node.data.record.data.name || 'Unnamed'}
        </button>
      ))}
      {props.edges.map((edge) => (
        <button type="button" key={edge.id}
          onClick={(event) => props.onEdgeClick?.(event, edge)}>
          Select edge {edge.id}
        </button>
      ))}
      {props.nodes.length > 1 && (
        <button type="button" onClick={() => props.onConnect?.({
          source: props.nodes[0]!.id,
          target: props.nodes[1]!.id,
          sourceHandle: 'source-right', targetHandle: 'target-left',
        })}>Connect nodes</button>
      )}
    </section>
  ),
  useReactFlow: () => ({
    screenToFlowPosition: (position: { x: number; y: number }) => position,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: async () => undefined,
  }),
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./storage/repository', () => ({
  repository: {
    load: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  },
}));
beforeEach(() => {
  useCanvasStore.setState({
    canvas: createEmptyCanvas(), hydrated: false, storageWarning: null,
    selection: null, mode: 'select', spaceHeld: false, focusNameId: null, notice: null,
  });
  vi.mocked(repository.load).mockResolvedValue({ canvas: createEmptyCanvas(), warning: null });
});
afterEach(() => cleanup());

async function openApp(): Promise<void> {
  render(<App />);
  await screen.findByLabelText('Canvas information');
}
describe('campaign canvas interactions', () => {
  it('double-clicking the pane creates and focuses an NPC at the pointer', async () => {
    await openApp();
    fireEvent.doubleClick(screen.getByTestId('flow'), { clientX: 157, clientY: 82 });
    const canvas = useCanvasStore.getState().canvas;
    expect(canvas.nodes).toHaveLength(1);
    expect(canvas.nodes[0]?.position).toEqual({ x: 157, y: 82 });
    expect(canvas.nodes[0]?.type).toBe('npc');
    expect(await screen.findByLabelText('Node editor')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });
  it('switches V and H modes; Space temporarily pans without changing the mode', async () => {
    await openApp();
    fireEvent.click(screen.getByRole('button', { name: /Hand/ }));
    expect(screen.getByTestId('flow')).toHaveAttribute('data-pan', 'true');
    fireEvent.keyDown(window, { key: 'v' });
    expect(screen.getByTestId('flow')).toHaveAttribute('data-pan', 'false');
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByTestId('flow')).toHaveAttribute('data-pan', 'true');
    fireEvent.keyUp(window, { key: ' ' });
    expect(screen.getByTestId('flow')).toHaveAttribute('data-pan', 'false');
    fireEvent.keyDown(window, { key: 'h' });
    expect(useCanvasStore.getState().mode).toBe('hand');
    fireEvent.doubleClick(screen.getByTestId('flow'), { clientX: 20, clientY: 30 });
    expect(useCanvasStore.getState().canvas.nodes).toHaveLength(0);
  });
  it('selecting a node opens the left editor', async () => {
    await openApp();
    useCanvasStore.getState().addNode({ x: 20, y: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Unnamed' }));
    expect(screen.getByLabelText('Node editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Relationship editor closed')).toBeInTheDocument();
  });
  it('connecting and selecting an edge opens the right editor', async () => {
    await openApp();
    const store = useCanvasStore.getState();
    store.addNode({ x: 0, y: 0 });
    store.addNode({ x: 200, y: 200 });
    fireEvent.click(screen.getByRole('button', { name: 'Connect nodes' }));
    expect(screen.getByLabelText('Relationship editor')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Relationship type' })).toHaveValue('Neutral');
    expect(screen.getByLabelText('Canvas information')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Select edge/ }));
    expect(screen.getByLabelText('Relationship editor')).toBeInTheDocument();
  });
  it('Escape clears selection; shortcuts do not run while typing', async () => {
    await openApp();
    useCanvasStore.getState().addNode({ x: 0, y: 0 });
    const name = screen.getByRole('textbox', { name: 'Name' });
    name.focus();
    fireEvent.keyDown(name, { key: 'h' });
    expect(useCanvasStore.getState().mode).toBe('select');
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(name).not.toHaveFocus();
    expect(useCanvasStore.getState().selection?.kind).toBe('node');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByLabelText('Canvas information')).toBeInTheDocument());
  });
  it('warns before deleting nodes with relationships', async () => {
    await openApp();
    const store = useCanvasStore.getState();
    store.addNode({ x: 0, y: 0 });
    const a = useCanvasStore.getState().canvas.nodes[0]!.id;
    store.addNode({ x: 200, y: 0 });
    const b = useCanvasStore.getState().canvas.nodes[1]!.id;
    store.connect(a, b);
    useCanvasStore.getState().setSelection({ kind: 'node', id: a });
    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('1 connected relationship');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useCanvasStore.getState().canvas.nodes).toHaveLength(2);
    expect(useCanvasStore.getState().canvas.relationships).toHaveLength(1);
  });
});
