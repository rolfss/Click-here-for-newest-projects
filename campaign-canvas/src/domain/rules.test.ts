import { describe, expect, it } from 'vitest';
import {
  addHistoryEntry, changeNodeType, clampStrength, createEmptyCanvas, createNode,
  createRelationship, deleteHistoryEntry, deleteNodeCascade, editHistoryEntry,
  fieldsLostOnTypeChange, findRelationshipDuplicate, manuallySetStrength, updateNodeField,
} from './rules';
import type { CampaignCanvas, Relationship } from './types';
import { calculateEdgeOffsets } from '../relationships/geometry';

function pair(): { canvas: CampaignCanvas; first: string; second: string } {
  const canvas = createEmptyCanvas();
  const a = createNode({ x: 12, y: 35 }, 'npc', 'a');
  const b = createNode({ x: 255, y: 65 }, 'faction', 'b');
  return { canvas: { ...canvas, nodes: [a, b] }, first: a.id, second: b.id };
}
function relationship(): Relationship {
  const { canvas } = pair();
  const created = createRelationship(canvas, 'a', 'b', 'Neutral', 'rel');
  if (!created.ok) throw new Error('Fixture relationship failed');
  return created.relationship;
}
describe('campaign nodes', () => {
  it('creates an unnamed NPC at exactly the supplied coordinates', () => {
    const node = createNode({ x: 31.25, y: -9 }, 'npc', 'npc-1');
    expect(node.id).toBe('npc-1');
    expect(node.position).toEqual({ x: 31.25, y: -9 });
    expect(node.type).toBe('npc');
    expect(node.data.name).toBe('');
    expect(node.data.status).toBe('Unknown');
  });
  it('creates all types with type-specific defaults', () => {
    const pc = createNode({ x: 0, y: 0 }, 'pc');
    const faction = createNode({ x: 0, y: 0 }, 'faction');
    expect(pc.data).toHaveProperty('level', 1);
    expect(faction.data).toHaveProperty('headquarters', '');
    expect(faction.data.status).toBe('Unknown');
  });
  it('rounds and bounds character levels so saved data remains valid', () => {
    const pc = createNode({ x: 0, y: 0 }, 'pc');
    const updated = updateNodeField(pc, 'level', 19.7);
    expect(updated.data).toHaveProperty('level', 20);
    expect(updateNodeField(pc, 'level', -15).data).toHaveProperty('level', 1);
  });
  it('keeps shared values and discards incompatible ones on type changes', () => {
    const node = createNode({ x: 1, y: 2 }, 'npc', 'a');
    if (node.type !== 'npc') throw new Error('Unexpected fixture');
    node.data.name = 'Gundren';
    node.data.faction = 'Rockseeker';
    node.data.location = 'Phandalin';
    node.data.tags = ['ally'];
    node.data.status = 'Alive';
    expect(fieldsLostOnTypeChange(node, 'pc')).toContain('Faction (free text)');
    const changed = changeNodeType(node, 'pc');
    expect(changed.data.name).toBe('Gundren');
    expect(changed.data.location).toBe('Phandalin');
    expect(changed.data.tags).toEqual(['ally']);
    expect(changed.data.status).toBe('Alive');
    expect(changed.data).not.toHaveProperty('faction');
    expect(node.data.faction).toBe('Rockseeker');
  });
  it('warns about incompatible status and resets it to Unknown', () => {
    const node = createNode({ x: 0, y: 0 }, 'npc');
    node.data.status = 'Dead';
    expect(fieldsLostOnTypeChange(node, 'faction')).toContain('Status (Dead)');
    const changed = changeNodeType(node, 'faction');
    expect(changed.data.status).toBe('Unknown');
  });
  it('retains location and notes when switching to a faction', () => {
    const node = createNode({ x: 0, y: 0 });
    node.data.location = 'Neverwinter';
    node.data.notes = 'Distrustful';
    const changed = changeNodeType(node, 'faction');
    expect(changed.data.location).toBe('Neverwinter');
    expect(changed.data.notes).toBe('Distrustful');
  });
});
describe('directed relationships', () => {
  it('creates a Neutral relationship starting at 0', () => {
    const { canvas } = pair();
    const outcome = createRelationship(canvas, 'a', 'b', undefined, 'edge');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.relationship.strength).toBe(0);
      expect(outcome.relationship.status).toBe('Active');
      expect(outcome.canvas.relationships).toHaveLength(1);
      expect(canvas.relationships).toHaveLength(0);
    }
  });
  it('rejects self-links and non-existent endpoints', () => {
    const { canvas } = pair();
    expect(createRelationship(canvas, 'a', 'a')).toMatchObject({ ok: false, reason: 'self' });
    expect(createRelationship(canvas, 'a', 'absent')).toMatchObject({ ok: false, reason: 'missing' });
  });
  it('rejects identical directed duplicates but allows reverse and different types', () => {
    const { canvas } = pair();
    const first = createRelationship(canvas, 'a', 'b', 'Loyal', 'one');
    if (!first.ok) throw new Error('Fixture failed');
    const duplicate = createRelationship(first.canvas, 'a', 'b', 'Loyal', 'two');
    expect(duplicate).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(createRelationship(first.canvas, 'b', 'a', 'Loyal').ok).toBe(true);
    expect(createRelationship(first.canvas, 'a', 'b', 'Hostile').ok).toBe(true);
    expect(findRelationshipDuplicate(first.canvas.relationships, 'a', 'b', 'Loyal', 'other')?.id)
      .toBe('one');
    expect(findRelationshipDuplicate(first.canvas.relationships, 'a', 'b', 'Loyal', 'one'))
      .toBeUndefined();
  });
  it('deleting a node also removes its connections in one new state', () => {
    const { canvas } = pair();
    const created = createRelationship(canvas, 'a', 'b');
    if (!created.ok) throw new Error('Fixture failed');
    const removed = deleteNodeCascade(created.canvas, 'a');
    expect(removed.nodes.map((node) => node.id)).toEqual(['b']);
    expect(removed.relationships).toEqual([]);
    expect(created.canvas.relationships).toHaveLength(1);
  });
  it('offsets reverse and parallel links so their labels do not overlap', () => {
    const rel = relationship();
    const offsets = calculateEdgeOffsets([
      { ...rel, id: 'one' },
      { ...rel, id: 'two', type: 'Friendly' },
      { ...rel, id: 'three', sourceId: rel.targetId, targetId: rel.sourceId },
    ]);
    expect(offsets.one).not.toBe(offsets.two);
    expect(offsets.one).toBeGreaterThan(0);
    expect(offsets.three).toBeGreaterThan(0);
  });
});
describe('relationship history', () => {
  it('clamps to both limits', () => {
    expect(clampStrength(-99)).toBe(-5);
    expect(clampStrength(99)).toBe(5);
    expect(clampStrength(Number.NaN)).toBe(0);
  });
  it('records before/after values and applies deltas', () => {
    const first = addHistoryEntry(relationship(),
      { title: 'Saved Gundren', description: 'Rescued at Cragmaw', sessionRef: 'Session 7', delta: 2 },
      'e1', '2026-02-01T12:00:00Z');
    expect(first.history[0]).toMatchObject({
      title: 'Saved Gundren', sessionRef: 'Session 7', delta: 2,
      strengthBefore: 0, strengthAfter: 2,
    });
    expect(first.strength).toBe(2);
    const second = addHistoryEntry(first,
      { title: 'Great betrayal', description: '', sessionRef: '', delta: -20 },
      'e2', '2026-02-02T12:00:00Z');
    expect(second.history[1]).toMatchObject({ strengthBefore: 2, strengthAfter: -5 });
    expect(second.strength).toBe(-5);
  });
  it('clamps high-strength events and retains the requested delta', () => {
    const updated = addHistoryEntry(relationship(),
      { title: 'Alliance', description: '', sessionRef: '', delta: 10 }, 'e1');
    expect(updated.history[0]).toMatchObject({ delta: 10, strengthBefore: 0, strengthAfter: 5 });
    expect(updated.strength).toBe(5);
  });
  it('records manual strength changes as an event', () => {
    const updated = manuallySetStrength(relationship(), -3);
    expect(updated.strength).toBe(-3);
    expect(updated.history[0]).toMatchObject({
      title: 'Manual adjustment', delta: -3, strengthBefore: 0, strengthAfter: -3,
    });
    expect(manuallySetStrength(updated, -3)).toBe(updated);
  });
  it('deleting an event replays from 0 and recalculates a clamped chain', () => {
    const a = addHistoryEntry(relationship(),
      { title: 'First', description: '', sessionRef: '', delta: 10 }, 'a', '2026-01-01');
    const b = addHistoryEntry(a,
      { title: 'Second', description: '', sessionRef: '', delta: -2 }, 'b', '2026-01-02');
    const c = addHistoryEntry(b,
      { title: 'Third', description: '', sessionRef: '', delta: -1 }, 'c', '2026-01-03');
    expect(c.strength).toBe(2);
    const afterDelete = deleteHistoryEntry(c, 'a');
    expect(afterDelete.history.map((entry) =>
      [entry.id, entry.strengthBefore, entry.strengthAfter])).toEqual([
      ['b', 0, -2], ['c', -2, -3],
    ]);
    expect(afterDelete.strength).toBe(-3);
    expect(c.strength).toBe(2);
  });
  it('deleting the only event restores neutral strength', () => {
    const updated = addHistoryEntry(relationship(),
      { title: 'Incident', description: '', sessionRef: '', delta: -4 }, 'a');
    const removed = deleteHistoryEntry(updated, 'a');
    expect(removed.history).toHaveLength(0);
    expect(removed.strength).toBe(0);
  });
  it('editing metadata never changes the immutable delta', () => {
    const updated = addHistoryEntry(relationship(),
      { title: 'Incident', description: 'Before', sessionRef: '7', delta: 3 }, 'a');
    const edited = editHistoryEntry(updated, 'a', {
      title: 'New title', description: 'After', sessionRef: '8',
    });
    expect(edited.history[0]).toMatchObject({
      title: 'New title', description: 'After', sessionRef: '8', delta: 3,
      strengthBefore: 0, strengthAfter: 3,
    });
  });
});
