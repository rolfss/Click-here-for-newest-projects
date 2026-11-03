import { NODE_REGISTRY } from './registry';
import type {
  CampaignCanvas, CampaignNode, CommonNodeData, FactionData, HistoryDraft,
  NPCData, NodeType, PlayerCharacterData, Point, Relationship,
  RelationshipHistoryEntry, RelationshipType,
} from './types';

export const SCHEMA_VERSION = 1;
export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };
export const makeId = (): string => globalThis.crypto?.randomUUID?.() ??
  'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
const timestamp = (): string => new Date().toISOString();
export function createEmptyCanvas(): CampaignCanvas {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'campaign-canvas-default',
    info: { name: 'Untitled canvas', campaignName: '', description: '', tags: [] },
    nodes: [], relationships: [], viewport: { ...DEFAULT_VIEWPORT },
  };
}
export function clampStrength(n: number): number {
  return Math.max(-5, Math.min(5, Math.round(Number.isFinite(n) ? n : 0)));
}
const commonDefaults = (): CommonNodeData => ({
  name: '', status: 'Unknown', location: '', description: '',
  goals: '', secrets: '', notes: '', tags: [],
});
function defaultData(type: 'pc'): PlayerCharacterData;
function defaultData(type: 'npc'): NPCData;
function defaultData(type: 'faction'): FactionData;
function defaultData(type: NodeType): CommonNodeData {
  const common = commonDefaults();
  switch (type) {
    case 'pc': return { ...common, playerName: '', className: '', level: 1, species: '', alignment: 'Unaligned' };
    case 'npc': return { ...common, role: '', faction: '', attitude: 'Unknown', motivation: '' };
    case 'faction': return { ...common, category: '', leader: '', headquarters: '', influence: '', resources: '' };
  }
}
export function createNode(position: Point, type: NodeType = 'npc', id = makeId()): CampaignNode {
  const base = { id, position: { ...position } };
  switch (type) {
    case 'pc': return { ...base, type, data: defaultData('pc') };
    case 'npc': return { ...base, type, data: defaultData('npc') };
    case 'faction': return { ...base, type, data: defaultData('faction') };
  }
}
function rawFields(node: CampaignNode): Record<string, unknown> {
  return node.data as unknown as Record<string, unknown>;
}
function nonempty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return value !== 'Unknown' && value !== 'Unaligned' && value !== 1;
}
export function fieldsLostOnTypeChange(node: CampaignNode, next: NodeType): string[] {
  if (node.type === next) return [];
  const targetFields = new Set(NODE_REGISTRY[next].fields.map((field) => field.key));
  const oldValues = rawFields(node);
  const lost = NODE_REGISTRY[node.type].fields.filter(
    (field) => !targetFields.has(field.key) && nonempty(oldValues[field.key]),
  ).map((field) => field.label);
  if (!NODE_REGISTRY[next].statusOptions.includes(node.data.status) &&
      node.data.status !== 'Unknown') {
    lost.push('Status (' + node.data.status + ')');
  }
  return lost;
}
export function changeNodeType(node: CampaignNode, next: NodeType): CampaignNode {
  if (node.type === next) return node;
  const previous = rawFields(node);
  const status = NODE_REGISTRY[next].statusOptions.includes(node.data.status) ?
    node.data.status : 'Unknown';
  const carry: CommonNodeData = {
    name: node.data.name, status, location: node.data.location,
    description: node.data.description, goals: node.data.goals,
    secrets: node.data.secrets, notes: node.data.notes, tags: [...node.data.tags],
  };
  const data = defaultData(next) as Record<string, unknown>;
  for (const field of NODE_REGISTRY[next].fields) {
    if (field.key in carry) continue;
    if (Object.prototype.hasOwnProperty.call(previous, field.key)) {
      data[field.key] = previous[field.key];
    }
  }
  const base = { id: node.id, position: { ...node.position } };
  switch (next) {
    case 'pc': return { ...base, type: next, data: { ...data, ...carry } as unknown as PlayerCharacterData };
    case 'npc': return { ...base, type: next, data: { ...data, ...carry } as unknown as NPCData };
    case 'faction': return { ...base, type: next, data: { ...data, ...carry } as unknown as FactionData };
  }
}
export function updateNodeField(node: CampaignNode, key: string, value: string | number | string[]): CampaignNode {
  if (!NODE_REGISTRY[node.type].fields.some((field) => field.key === key)) return node;
  const normalized = key === 'level' ? Math.min(20, Math.max(1, Number(value) || 1)) : value;
  return { ...node, data: { ...node.data, [key]: normalized } } as CampaignNode;
}
export function deleteNodeCascade(canvas: CampaignCanvas, nodeId: string): CampaignCanvas {
  return {
    ...canvas,
    nodes: canvas.nodes.filter((n) => n.id !== nodeId),
    relationships: canvas.relationships.filter((r) => r.sourceId !== nodeId && r.targetId !== nodeId),
  };
}
export type RelationshipCreateResult =
  | { ok: true; canvas: CampaignCanvas; relationship: Relationship }
  | { ok: false; reason: 'self' | 'missing' | 'duplicate'; existing?: Relationship };
export function createRelationship(
  canvas: CampaignCanvas, sourceId: string, targetId: string,
  type: RelationshipType = 'Neutral',
  id = makeId(),
): RelationshipCreateResult {
  if (sourceId === targetId) return { ok: false, reason: 'self' };
  if (!canvas.nodes.some((n) => n.id === sourceId) ||
      !canvas.nodes.some((n) => n.id === targetId)) return { ok: false, reason: 'missing' };
  const existing = canvas.relationships.find(
    (r) => r.sourceId === sourceId && r.targetId === targetId && r.type === type,
  );
  if (existing) return { ok: false, reason: 'duplicate', existing };
  const now = timestamp();
  const relationship: Relationship = {
    id, sourceId, targetId, type, customLabel: '', strength: 0,
    status: 'Active', description: '', history: [], createdAt: now, updatedAt: now,
  };
  return { ok: true, canvas: { ...canvas, relationships: [...canvas.relationships, relationship] }, relationship };
}
export function findRelationshipDuplicate(
  relationships: readonly Relationship[], sourceId: string, targetId: string,
  type: RelationshipType, exceptId: string,
): Relationship | undefined {
  return relationships.find((r) =>
    r.id !== exceptId && r.sourceId === sourceId && r.targetId === targetId && r.type === type);
}
export function addHistoryEntry(
  relationship: Relationship, draft: HistoryDraft, id = makeId(), now = timestamp(),
): Relationship {
  const delta = Math.round(Number.isFinite(draft.delta) ? draft.delta : 0);
  const before = clampStrength(relationship.strength);
  const after = clampStrength(before + delta);
  const entry: RelationshipHistoryEntry = {
    id, title: draft.title.trim(), description: draft.description,
    sessionRef: draft.sessionRef, createdAt: now, delta,
    strengthBefore: before, strengthAfter: after,
  };
  return {
    ...relationship, strength: after, history: [...relationship.history, entry], updatedAt: now,
  };
}
export function manuallySetStrength(relationship: Relationship, desired: number): Relationship {
  const after = clampStrength(desired);
  if (after === relationship.strength) return relationship;
  return addHistoryEntry(relationship, {
    title: 'Manual adjustment', description: '', sessionRef: '',
    delta: after - relationship.strength,
  });
}
export function deleteHistoryEntry(relationship: Relationship, entryId: string): Relationship {
  if (!relationship.history.some((entry) => entry.id === entryId)) return relationship;
  let strength = 0;
  const history = relationship.history.filter((entry) => entry.id !== entryId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => {
      const before = strength;
      strength = clampStrength(before + entry.delta);
      return { ...entry, strengthBefore: before, strengthAfter: strength };
    });
  return { ...relationship, history, strength, updatedAt: timestamp() };
}
export function editHistoryEntry(
  relationship: Relationship, entryId: string, patch: Partial<Pick<RelationshipHistoryEntry,
    'title' | 'description' | 'sessionRef'>>,
): Relationship {
  return {
    ...relationship, updatedAt: timestamp(),
    history: relationship.history.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry),
  };
}
