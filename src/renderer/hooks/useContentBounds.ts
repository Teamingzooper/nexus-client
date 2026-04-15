import { useEffect, useRef } from 'react';

export function useContentBounds(
  ref: React.RefObject<HTMLElement>,
  enabled: boolean,
): void {
  const lastBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const report = () => {
      rafRef.current = null;
      const el2 = ref.current;
      if (!el2) return;
      const rect = el2.getBoundingClientRect();
      const next = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.max(0, Math.round(rect.width)),
        h: Math.max(0, Math.round(rect.height)),
      };
      const last = lastBoundsRef.current;
      if (last && last.x === next.x && last.y === next.y && last.w === next.w && last.h === next.h) {
        return;
      }
      lastBoundsRef.current = next;
      window.nexus
        .setContentBounds({ x: next.x, y: next.y, width: next.w, height: next.h })
        .catch(() => {});
    };

    const schedule = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(report);
    };

    report();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener('resize', schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [ref, enabled]);
}
