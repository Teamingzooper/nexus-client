import React, { useRef } from 'react';
import { useContentBounds } from '../hooks/useContentBounds';
import { useNexus } from '../store';

interface Props {
  hasActive: boolean;
}

export function ContentArea({ hasActive }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useNexus((s) => s.modules.filter((m) => s.state.enabledModuleIds.includes(m.manifest.id)));
  useContentBounds(ref, true);

  return (
    <main ref={ref} className="content-area">
      {!hasActive && (
        <div className="empty-state">
          <div className="empty-logo">N</div>
          <h2>Welcome to Nexus</h2>
          {enabled.length === 0 ? (
            <>
              <p>No modules enabled yet.</p>
              <p className="hint">
                Press <kbd>⌘,</kbd> to open settings and enable a module.
              </p>
            </>
          ) : (
            <>
              <p>Select a module from the sidebar to get started.</p>
              <p className="hint">
                Press <kbd>⌘1</kbd>–<kbd>⌘9</kbd> to jump to a module.
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
