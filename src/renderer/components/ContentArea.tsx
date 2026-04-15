import React, { useEffect, useRef } from 'react';

interface Props {
  hasActive: boolean;
}

export function ContentArea({ hasActive }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const report = () => {
      const rect = el.getBoundingClientRect();
      window.nexus.setContentBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [hasActive]);

  return (
    <main ref={ref} className="content-area">
      {!hasActive && (
        <div className="empty-state">
          <h2>Welcome to Nexus</h2>
          <p>Select a module from the sidebar to get started.</p>
          <p className="hint">Open Settings to enable more messaging services.</p>
        </div>
      )}
    </main>
  );
}
