import { beforeEach, describe, expect, it, vi } from 'vitest';
import { del, get, set } from 'idb-keyval';
import { createEmptyCanvas, createNode } from '../domain/rules';
import { BACKUP_PREFIX, IndexedDbCanvasRepository, STORAGE_KEY } from './repository';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));

beforeEach(() => {
  vi.mocked(get).mockReset();
  vi.mocked(set).mockReset();
  vi.mocked(del).mockReset();
  vi.mocked(set).mockResolvedValue(undefined);
  vi.mocked(del).mockResolvedValue(undefined);
});
describe('IndexedDB repository', () => {
  it('loads valid saved data', async () => {
    const canvas = createEmptyCanvas();
    canvas.nodes = [createNode({ x: 2, y: 4 }, 'npc', 'npc')];
    vi.mocked(get).mockResolvedValue(canvas);
    const loaded = await new IndexedDbCanvasRepository().load();
    expect(loaded.canvas.nodes).toHaveLength(1);
    expect(loaded.warning).toBeNull();
  });
  it('backs up invalid raw data before opening a new canvas', async () => {
    const malformed = { schemaVersion: 1, nodes: 'broken' };
    vi.mocked(get).mockResolvedValue(malformed);
    const loaded = await new IndexedDbCanvasRepository().load();
    expect(loaded.canvas.nodes).toEqual([]);
    expect(loaded.warning).toMatch(/preserved/i);
    expect(vi.mocked(set)).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp('^' + BACKUP_PREFIX)),
      malformed,
    );
    expect(vi.mocked(del)).toHaveBeenCalledWith(STORAGE_KEY);
  });
  it('serializes saves and resets the primary key', async () => {
    const repo = new IndexedDbCanvasRepository();
    await repo.save(createEmptyCanvas());
    expect(vi.mocked(set)).toHaveBeenCalledWith(STORAGE_KEY, expect.objectContaining({ schemaVersion: 1 }));
    await repo.reset();
    expect(vi.mocked(del)).toHaveBeenCalledWith(STORAGE_KEY);
  });
});
