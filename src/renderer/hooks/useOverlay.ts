import { useEffect } from 'react';
import { useNexus } from '../store';

/**
 * Register the calling component as an active "overlay" that must visually
 * cover the embedded WebContentsViews. While any component has this hook
 * active, App.tsx asks the main process to collapse the active service view
 * to zero bounds so the React UI is never obscured by Chromium content.
 *
 * Usage:
 *   function MyDialog() {
 *     useOverlay();
 *     return <div className="modal">...</div>;
 *   }
 *
 * Reference-counted, so nesting (e.g. ConfirmDialog opened while Settings
 * is already open) is safe — the count only drops to zero when every
 * overlay has unmounted.
 */
export function useOverlay(active: boolean = true): void {
  const push = useNexus((s) => s.pushOverlay);
  const pop = useNexus((s) => s.popOverlay);

  useEffect(() => {
    if (!active) return;
    push();
    return () => {
      pop();
    };
  }, [active, push, pop]);
}
