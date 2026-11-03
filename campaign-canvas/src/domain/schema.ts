import { z } from 'zod';
import { RELATIONSHIP_TYPES } from './types';
import type { CampaignCanvas } from './types';
import { createEmptyCanvas } from './rules';

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const common = z.object({
  name: z.string(), status: z.string(), location: z.string(),
  description: z.string(), goals: z.string(), secrets: z.string(),
  notes: z.string(), tags: z.array(z.string()),
});
const nodeBase = { id: z.string().min(1), position: point };
const npcSchema = z.object({
  ...nodeBase, type: z.literal('npc'),
  data: common.extend({
    status: z.enum(['Unknown', 'Alive', 'Dead', 'Missing']),
    role: z.string(), faction: z.string(),
    attitude: z.enum(['Unknown', 'Friendly', 'Neutral', 'Hostile']),
    motivation: z.string(),
  }),
});
const pcSchema = z.object({
  ...nodeBase, type: z.literal('pc'),
  data: common.extend({
    status: z.enum(['Unknown', 'Alive', 'Dead', 'Missing']),
    playerName: z.string(), className: z.string(),
    level: z.number().int().min(1).max(20),
    species: z.string(),
    alignment: z.enum(['Unaligned', 'Lawful Good', 'Neutral Good', 'Chaotic Good',
      'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
      'Lawful Evil', 'Neutral Evil', 'Chaotic Evil']),
  }),
});
const factionSchema = z.object({
  ...nodeBase, type: z.literal('faction'),
  data: common.extend({
    status: z.enum(['Unknown', 'Active', 'Weakened', 'Disbanded']),
    category: z.string(), leader: z.string(), headquarters: z.string(),
    influence: z.string(), resources: z.string(),
  }),
});
const entrySchema = z.object({
  id: z.string().min(1), title: z.string(), description: z.string(),
  sessionRef: z.string(), createdAt: z.string(),
  delta: z.number().int(),
  strengthBefore: z.number().int().min(-5).max(5),
  strengthAfter: z.number().int().min(-5).max(5),
});
const relationshipSchema = z.object({
  id: z.string().min(1), sourceId: z.string(), targetId: z.string(),
  type: z.enum(RELATIONSHIP_TYPES), customLabel: z.string(),
  strength: z.number().int().min(-5).max(5),
  status: z.enum(['Active', 'Ended', 'Unknown']),
  description: z.string(), history: z.array(entrySchema),
  createdAt: z.string(), updatedAt: z.string(),
});
export const canvasSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  info: z.object({
    name: z.string(), campaignName: z.string(),
    description: z.string(), tags: z.array(z.string()),
  }),
  nodes: z.array(z.discriminatedUnion('type', [npcSchema, pcSchema, factionSchema])),
  relationships: z.array(relationshipSchema),
  viewport: point.extend({ zoom: z.number().min(0.2).max(2) }),
});
export type ParseResult =
  | { ok: true; canvas: CampaignCanvas; droppedOrphans: number }
  | { ok: false; canvas: CampaignCanvas; reason: string };

export function parsePersistedData(raw: unknown): ParseResult {
  const result = canvasSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false, canvas: createEmptyCanvas(),
      reason: 'Saved campaign data failed validation (' +
        result.error.issues.slice(0, 2).map((issue) => issue.path.join('.')).join(', ') + ').',
    };
  }
  const data = result.data as CampaignCanvas;
  const uniqueNodes = new Set<string>();
  const nodes = data.nodes.filter((node) => {
    if (uniqueNodes.has(node.id)) return false;
    uniqueNodes.add(node.id);
    return true;
  });
  const uniqueRelationships = new Set<string>();
  const relationships = data.relationships.filter((rel) => {
    if (!uniqueNodes.has(rel.sourceId) || !uniqueNodes.has(rel.targetId) ||
        rel.sourceId === rel.targetId || uniqueRelationships.has(rel.id)) return false;
    uniqueRelationships.add(rel.id);
    return true;
  });
  return {
    ok: true,
    canvas: { ...data, nodes, relationships },
    droppedOrphans: data.relationships.length - relationships.length,
  };
}
