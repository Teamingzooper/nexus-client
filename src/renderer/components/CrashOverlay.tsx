import { useNexus } from '../store';
import { useOverlay } from '../hooks/useOverlay';

/**
 * Renders over the content area when the currently-active instance's
 * renderer process has crashed. Offers the user a clear path to either
 * reload the instance (respawning its renderer) or dismiss the overlay
 * and continue using other instances.
 *
 * Uses the global overlay-count hook so the underlying WebContentsView
 * is moved offscreen while we show — otherwise the native view would
 * obscure our HTML.
 */
export function CrashOverlay(): JSX.Element | null {
  const activeId = useNexus((s) => s.state.activeInstanceId);
  const crashed = useNexus((s) => s.crashedInstances);
  const instances = useNexus((s) => s.state.instances);
  const reloadCrashed = useNexus((s) => s.reloadCrashedInstance);
  const dismiss = useNexus((s) => s.dismissCrash);

  // Only show when the *active* instance is crashed. Background instances
  // that crash are silently tracked and surface when the user activates
  // them.
  const crashInfo = activeId ? crashed[activeId] : undefined;
  const isVisible = !!crashInfo && !!activeId;

  // Always call useOverlay so the hook order stays stable across renders,
  // but pass a falsy flag when we don't actually want to suspend.
  useOverlay(isVisible);

  if (!isVisible || !activeId) return null;

  const instance = instances.find((i) => i.id === activeId);
  const instanceName = instance?.name ?? 'This instance';

  return (
    <div className="crash-overlay" role="alert">
      <div className="crash-overlay-card">
        <div className="crash-overlay-icon">⚠️</div>
        <h2 className="crash-overlay-title">{instanceName} stopped responding</h2>
        <p className="crash-overlay-reason">
          The embedded web view crashed
          {crashInfo.reason && crashInfo.reason !== 'crashed'
            ? ` (${crashInfo.reason})`
            : ''}
          . Reload to start it again, or dismiss and switch to another instance.
        </p>
        <div className="crash-overlay-actions">
          <button
            type="button"
            className="crash-overlay-reload"
            onClick={() => {
              void reloadCrashed(activeId);
            }}
            autoFocus
          >
            Reload
          </button>
          <button type="button" className="crash-overlay-dismiss" onClick={() => dismiss(activeId)}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
