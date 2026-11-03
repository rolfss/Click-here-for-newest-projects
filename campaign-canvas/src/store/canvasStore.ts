import { create } from 'zustand';
import {
  addHistoryEntry, changeNodeType, createEmptyCanvas, createNode,
  createRelationship, deleteHistoryEntry, deleteNodeCascade,
  editHistoryEntry, findRelationshipDuplicate, manuallySetStrength,
  updateNodeField as applyNodeField,
} from '../domain/rules';
import type {
  CampaignCanvas, CanvasInfo, CanvasViewport, HistoryDraft, InteractionMode,
  NodeType, Point, Relationship, RelationshipHistoryEntry, RelationshipStatus,
  RelationshipType, SelectionState,
} from '../domain/types';
import type { LoadResult } from '../storage/repository';

type WritableRelationshipField = 'type' | 'customLabel' | 'status' | 'description' | 'strength';
type WritableRelationshipValue = RelationshipType | RelationshipStatus | string | number;
interface CanvasStore {
  canvas: CampaignCanvas;
  hydrated: boolean;
  storageWarning: string | null;
  selection: SelectionState;
  mode: InteractionMode;
  spaceHeld: boolean;
  focusNameId: string | null;
  notice: string | null;
  hydrate: (result: LoadResult) => void;
  dismissStorageWarning: () => void;
  notify: (text: string) => void;
  dismissNotice: () => void;
  setSelection: (selection: SelectionState) => void;
  setMode: (mode: InteractionMode) => void;
  setSpaceHeld: (held: boolean) => void;
  consumeNameFocus: () => void;
  setCanvasInfo: (patch: Partial<CanvasInfo>) => void;
  setViewport: (viewport: CanvasViewport) => void;
  addNode: (position: Point) => void;
  updateNode: (id: string, key: string, value: string | number | string[]) => void;
  setNodeType: (id: string, type: NodeType) => void;
  moveNode: (id: string, position: Point) => void;
  deleteNode: (id: string) => void;
  connect: (sourceId: string, targetId: string) => void;
  updateRelationship: (id: string, key: WritableRelationshipField, value: WritableRelationshipValue) => void;
  deleteRelationship: (id: string) => void;
  addHistory: (relationshipId: string, draft: HistoryDraft) => void;
  updateHistory: (relationshipId: string, entryId: string, patch: Partial<Pick<
    RelationshipHistoryEntry, 'title' | 'description' | 'sessionRef'>>) => void;
  removeHistory: (relationshipId: string, entryId: string) => void;
  resetCanvas: () => void;
}
export const useCanvasStore = create<CanvasStore>((set) => ({
  canvas: createEmptyCanvas(), hydrated: false, storageWarning: null,
  selection: null, mode: 'select', spaceHeld: false, focusNameId: null, notice: null,
  hydrate: ({ canvas, warning }) => set({ canvas, hydrated: true, storageWarning: warning }),
  dismissStorageWarning: () => set({ storageWarning: null }),
  notify: (notice) => set({ notice }),
  dismissNotice: () => set({ notice: null }),
  setSelection: (selection) => set({ selection, focusNameId: null }),
  setMode: (mode) => set({ mode }),
  setSpaceHeld: (spaceHeld) => set({ spaceHeld }),
  consumeNameFocus: () => set({ focusNameId: null }),
  setCanvasInfo: (patch) => set((state) => ({
    canvas: { ...state.canvas, info: { ...state.canvas.info, ...patch } },
  })),
  setViewport: (viewport) => set((state) => {
    const p = state.canvas.viewport;
    if (p.x === viewport.x && p.y === viewport.y && p.zoom === viewport.zoom) return state;
    return { canvas: { ...state.canvas, viewport: { ...viewport } } };
  }),
  addNode: (position) => set((state) => {
    const node = createNode(position);
    return {
      canvas: { ...state.canvas, nodes: [...state.canvas.nodes, node] },
      selection: { kind: 'node', id: node.id }, focusNameId: node.id,
    };
  }),
  updateNode: (id, key, value) => set((state) => ({
    canvas: {
      ...state.canvas,
      nodes: state.canvas.nodes.map((n) => n.id === id ? applyNodeField(n, key, value) : n),
    },
  })),
  setNodeType: (id, type) => set((state) => ({
    canvas: {
      ...state.canvas,
      nodes: state.canvas.nodes.map((n) => n.id === id ? changeNodeType(n, type) : n),
    },
  })),
  moveNode: (id, position) => set((state) => {
    const node = state.canvas.nodes.find((n) => n.id === id);
    if (!node || (node.position.x === position.x && node.position.y === position.y)) return state;
    return {
      canvas: {
        ...state.canvas,
        nodes: state.canvas.nodes.map((n) => n.id === id ? { ...n, position } : n),
      },
    };
  }),
  deleteNode: (id) => set((state) => ({
    canvas: deleteNodeCascade(state.canvas, id),
    selection: null,
  })),
  connect: (sourceId, targetId) => set((state) => {
    const result = createRelationship(state.canvas, sourceId, targetId);
    if (result.ok) {
      return {
        canvas: result.canvas, selection: { kind: 'relationship', id: result.relationship.id },
        focusNameId: null,
      };
    }
    if (result.reason === 'duplicate' && result.existing) {
      return {
        notice: 'That relationship already exists. Selected the existing relationship.',
        selection: { kind: 'relationship', id: result.existing.id }, focusNameId: null,
      };
    }
    return { notice: result.reason === 'self' ?
      'A character or faction cannot have a relationship with itself.' :
      'Both endpoints must exist.' };
  }),
  updateRelationship: (id, key, value) => set((state) => {
    const relationship = state.canvas.relationships.find((r) => r.id === id);
    if (!relationship) return state;
    if (key === 'type') {
      const nextType = value as RelationshipType;
      const duplicate = findRelationshipDuplicate(
        state.canvas.relationships, relationship.sourceId,
        relationship.targetId, nextType, id,
      );
      if (duplicate) return {
        selection: { kind: 'relationship', id: duplicate.id },
        notice: 'That relationship type already exists for this direction. Selected it instead.',
      };
    }
    const changed = key === 'strength'
      ? manuallySetStrength(relationship, Number(value))
      : { ...relationship, [key]: value, updatedAt: new Date().toISOString() } as Relationship;
    if (changed === relationship) return state;
    return {
      canvas: {
        ...state.canvas,
        relationships: state.canvas.relationships.map((r) => r.id === id ? changed : r),
      },
    };
  }),
  deleteRelationship: (id) => set((state) => ({
    canvas: {
      ...state.canvas,
      relationships: state.canvas.relationships.filter((r) => r.id !== id),
    }, selection: null,
  })),
  addHistory: (relationshipId, draft) => set((state) => ({
    canvas: {
      ...state.canvas,
      relationships: state.canvas.relationships.map((r) =>
        r.id === relationshipId ? addHistoryEntry(r, draft) : r),
    },
  })),
  updateHistory: (relationshipId, entryId, patch) => set((state) => ({
    canvas: {
      ...state.canvas,
      relationships: state.canvas.relationships.map((r) =>
        r.id === relationshipId ? editHistoryEntry(r, entryId, patch) : r),
    },
  })),
  removeHistory: (relationshipId, entryId) => set((state) => ({
    canvas: {
      ...state.canvas,
      relationships: state.canvas.relationships.map((r) =>
        r.id === relationshipId ? deleteHistoryEntry(r, entryId) : r),
    },
  })),
  resetCanvas: () => set({
    canvas: createEmptyCanvas(), selection: null, mode: 'select',
    spaceHeld: false, focusNameId: null, notice: null,
  }),
}));
