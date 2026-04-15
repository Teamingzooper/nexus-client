import React, { useRef } from 'react';
import { useContentBounds } from '../hooks/useContentBounds';
import { useNexus } from '../store';

interface Props {
  hasActive: boolean;
}

export function ContentArea({ hasActive }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const instances = useNexus((s) => s.state.instances);
  useContentBounds(ref, true);

  return (
    <main ref={ref} className="content-area">
      {!hasActive && (
        <div className="empty-state">
          <div className="empty-logo">N</div>
          <h2>Welcome to Nexus</h2>
          {instances.length === 0 ? (
            <>
              <p>No instances yet.</p>
              <p className="hint">
                Press <kbd>⌘,</kbd> to open settings and add an instance of a module.
              </p>
            </>
          ) : (
            <>
              <p>Pick an instance from the sidebar to start.</p>
              <p className="hint">
                Press <kbd>⌘1</kbd>–<kbd>⌘9</kbd> to jump · <kbd>F2</kbd> to rename.
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
