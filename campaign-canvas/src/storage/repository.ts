import { del, get, set } from 'idb-keyval';
import { createEmptyCanvas } from '../domain/rules';
import { parsePersistedData } from '../domain/schema';
import type { CampaignCanvas } from '../domain/types';

export const STORAGE_KEY = 'campaign-canvas:version-1';
export const BACKUP_PREFIX = 'campaign-canvas:corrupted-backup:';
export interface LoadResult {
  canvas: CampaignCanvas;
  warning: string | null;
}
export interface CanvasRepository {
  load(): Promise<LoadResult>;
  save(canvas: CampaignCanvas): Promise<void>;
  reset(): Promise<void>;
}
export class IndexedDbCanvasRepository implements CanvasRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<LoadResult> {
    try {
      const raw: unknown = await get(STORAGE_KEY);
      if (raw === undefined) return { canvas: createEmptyCanvas(), warning: null };
      const parsed = parsePersistedData(raw);
      if (!parsed.ok) {
        const backupKey = BACKUP_PREFIX + new Date().toISOString();
        await set(backupKey, raw);
        await del(STORAGE_KEY);
        return {
          canvas: parsed.canvas,
          warning: 'Stored canvas data was invalid. A copy was preserved in IndexedDB (' +
            backupKey + '). A new empty canvas was opened.',
        };
      }
      return {
        canvas: parsed.canvas,
        warning: parsed.droppedOrphans
          ? parsed.droppedOrphans + ' orphaned or duplicate relationships were removed from saved data.'
          : null,
      };
    } catch {
      return {
        canvas: createEmptyCanvas(),
        warning: 'Browser storage could not be read. Edits may not survive refresh; check IndexedDB permissions.',
      };
    }
  }
  save(canvas: CampaignCanvas): Promise<void> {
    this.queue = this.queue.catch(() => undefined).then(async () => {
      await set(STORAGE_KEY, canvas);
    });
    return this.queue;
  }
  async reset(): Promise<void> {
    await this.queue.catch(() => undefined);
    await del(STORAGE_KEY);
  }
}
export const repository = new IndexedDbCanvasRepository();
