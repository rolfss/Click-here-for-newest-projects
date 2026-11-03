import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmRequest {
  title: string;
  message: string;
  details?: string[];
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}
export function ConfirmDialog({
  request, onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}): JSX.Element | null {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!request) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, [request]);
  if (!request) return null;
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    if (event.key === 'Tab') {
      const focusable = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (focusable.length === 0) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-heading"
        aria-describedby="confirm-description" className="confirm-dialog" onKeyDown={onKeyDown}>
        <div className="dialog-heading">
          <AlertTriangle size={20} aria-hidden="true" />
          <h2 id="confirm-heading">{request.title}</h2>
        </div>
        <p id="confirm-description">{request.message}</p>
        {request.details && request.details.length > 0 && (
          <ul className="dialog-details">
            {request.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        )}
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={'button ' + (request.destructive ? 'button-danger' : 'button-primary')}
            onClick={() => { request.onConfirm(); onClose(); }}
          >{request.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
