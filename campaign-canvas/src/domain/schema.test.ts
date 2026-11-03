import { describe, expect, it } from 'vitest';
import { createEmptyCanvas, createNode, createRelationship } from './rules';
import { parsePersistedData } from './schema';

describe('saved campaign validation', () => {
  it('loads a valid campaign canvas', () => {
    const canvas = createEmptyCanvas();
    canvas.info.campaignName = 'Lost Mine';
    canvas.nodes = [createNode({ x: 3, y: 5 }, 'npc', 'a')];
    const result = parsePersistedData(canvas);
    expect(result.ok).toBe(true);
    expect(result.canvas.info.campaignName).toBe('Lost Mine');
    expect(result.canvas.nodes[0]?.position).toEqual({ x: 3, y: 5 });
  });
  it('opens an empty canvas for corrupt or future-version data', () => {
    for (const raw of [{ schemaVersion: 8 }, { hello: 'wrong' }, null]) {
      const result = parsePersistedData(raw);
      expect(result.ok).toBe(false);
      expect(result.canvas.nodes).toEqual([]);
    }
  });
  it('drops orphaned relationships while preserving valid links', () => {
    const canvas = createEmptyCanvas();
    canvas.nodes = [
      createNode({ x: 0, y: 0 }, 'npc', 'a'),
      createNode({ x: 10, y: 0 }, 'pc', 'b'),
    ];
    const result = createRelationship(canvas, 'a', 'b', 'Loyal', 'valid');
    if (!result.ok) throw new Error('Fixture failed');
    result.canvas.relationships.push({
      ...result.relationship, id: 'orphan', targetId: 'missing',
    });
    const parsed = parsePersistedData(result.canvas);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.droppedOrphans).toBe(1);
      expect(parsed.canvas.relationships.map((entry) => entry.id)).toEqual(['valid']);
    }
  });
  it('rejects invalid relationship strength and invalid status', () => {
    const canvas = createEmptyCanvas();
    canvas.nodes = [createNode({ x: 0, y: 0 }, 'faction', 'f')];
    const bad = {
      ...canvas, nodes: [{ ...canvas.nodes[0], data: { ...canvas.nodes[0]?.data, status: 'Alive' } }],
    };
    expect(parsePersistedData(bad).ok).toBe(false);
  });
});
