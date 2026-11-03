import { useEffect } from 'react';
import { isTypingTarget } from './keyboard';
import { useCanvasStore } from '../store/canvasStore';

interface KeyboardOptions { dialogOpen: boolean; onDelete: () => void }
export function useKeyboard({ dialogOpen, onDelete }: KeyboardOptions): void {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (dialogOpen) return;
      if (isTypingTarget(event.target)) {
        if (event.key === 'Escape') {
          (event.target as HTMLElement).blur();
          event.preventDefault();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const store = useCanvasStore.getState();
      switch (event.key.toLowerCase()) {
        case 'v': store.setMode('select'); break;
        case 'h': store.setMode('hand'); break;
        case ' ': event.preventDefault(); store.setSpaceHeld(true); break;
        case 'escape': event.preventDefault(); store.setSelection(null); break;
        case 'delete':
        case 'backspace':
          if (store.selection) {
            event.preventDefault();
            onDelete();
          }
          break;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === ' ') useCanvasStore.getState().setSpaceHeld(false);
    };
    const blur = () => useCanvasStore.getState().setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [dialogOpen, onDelete]);
}
