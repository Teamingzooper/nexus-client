import React, { useEffect, useRef } from 'react';
import { useNexus } from '../store';

export function ConfirmDialog() {
  const confirm = useNexus((s) => s.confirm);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        confirm.onCancel?.();
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        confirm.onConfirm();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirm]);

  if (!confirm) return null;

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      onClick={() => confirm.onCancel?.()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className={`confirm-modal ${confirm.danger ? 'danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{confirm.title}</h2>
        <p>{confirm.message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={() => confirm.onCancel?.()}>
            {confirm.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmBtnRef}
            className={confirm.danger ? 'confirm-ok danger' : 'confirm-ok'}
            onClick={() => confirm.onConfirm()}
          >
            {confirm.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
