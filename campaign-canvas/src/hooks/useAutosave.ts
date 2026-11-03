import { useEffect } from 'react';
import { repository } from '../storage/repository';
import { useCanvasStore } from '../store/canvasStore';
import type { CampaignCanvas } from '../domain/types';

export function useAutosave(): void {
  useEffect(() => {
    let pending: CampaignCanvas | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!pending) return;
      const snapshot = pending;
      pending = null;
      void repository.save(snapshot).catch(() => {
        useCanvasStore.getState().notify('Could not save changes. Check browser storage permissions.');
      });
    };
    const unsubscribe = useCanvasStore.subscribe((next, before) => {
      if (!next.hydrated || next.canvas === before.canvas) return;
      pending = next.canvas;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      unsubscribe();
      flush();
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
