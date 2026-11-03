import type { Relationship } from '../domain/types';

export function calculateEdgeOffsets(relationships: readonly Relationship[]): Record<string, number> {
  const offsets: Record<string, number> = {};
  const groups = new Map<string, Relationship[]>();
  for (const relationship of relationships) {
    const key = [relationship.sourceId, relationship.targetId].sort().join('\u001f');
    const group = groups.get(key) ?? [];
    group.push(relationship);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const directions = new Set(group.map((rel) => rel.sourceId + '\u001f' + rel.targetId));
    const reverseExists = directions.size > 1;
    const seen = new Map<string, number>();
    for (const rel of group) {
      const direction = rel.sourceId + '\u001f' + rel.targetId;
      const index = seen.get(direction) ?? 0;
      seen.set(direction, index + 1);
      // Opposite directions reverse the path normal, so equal positive offsets separate them.
      offsets[rel.id] = reverseExists
        ? 38 + index * 34
        : index === 0 ? 0 : Math.ceil(index / 2) * 42 * (index % 2 ? 1 : -1);
    }
  }
  return offsets;
}
