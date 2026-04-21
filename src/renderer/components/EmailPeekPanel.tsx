import { useMemo, useState } from 'react';
import { useNexus } from '../store';
import type { PeekItem } from '../../shared/types';

/**
 * Cross-account "Email peek" panel. Mounted in the sidebar, below the
 * instance list. Shows the latest N items per email account, with unread
 * and VIP highlighting. Clicking a row focuses the originating instance.
 *
 * Visibility is driven by `emailPeekConfig.visible`:
 *   - 'always' — always visible (default)
 *   - 'hover'  — CSS reveals on sidebar hover (uses data-visible attr)
 *   - 'hidden' — panel returns null
 */
export function EmailPeekPanel(): JSX.Element | null {
  const emailPeek = useNexus((s) => s.emailPeek);
  const config = useNexus((s) => s.emailPeekConfig);
  const activate = useNexus((s) => s.activateInstance);
  const [collapsed, setCollapsed] = useState(false);

  const totalUnread = useMemo(() => {
    let n = 0;
    for (const items of Object.values(emailPeek)) {
      for (const it of items) if (it.unread) n++;
    }
    return n;
  }, [emailPeek]);

  const vipUnread = useMemo(() => {
    let n = 0;
    for (const items of Object.values(emailPeek)) {
      for (const it of items) if (it.unread && it.isVip) n++;
    }
    return n;
  }, [emailPeek]);

  if (config.visible === 'hidden') return null;
  if (Object.keys(emailPeek).length === 0) return null;

  const rows: Array<{ instanceId: string; item: PeekItem }> = [];
  for (const [instanceId, items] of Object.entries(emailPeek)) {
    for (const it of items.slice(0, config.perAccount)) rows.push({ instanceId, item: it });
  }
  if (config.grouping === 'unified') {
    rows.sort((a, b) => b.item.date.localeCompare(a.item.date));
  }

  return (
    <div className="email-peek-panel" data-visible={config.visible}>
      <button
        className="email-peek-header"
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="email-peek-title">
          📧 Email peek {totalUnread > 0 ? `(${totalUnread})` : ''}
        </span>
        {vipUnread > 0 && <span className="email-peek-vip-badge">⭐ {vipUnread}</span>}
        <span className="email-peek-chevron">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <ul className="email-peek-list">
          {rows.length === 0 ? (
            <li className="email-peek-empty">No recent mail</li>
          ) : (
            rows.map(({ instanceId, item }, i) => (
              <li
                key={`${instanceId}-${item.messageId ?? item.threadId ?? i}`}
                className={
                  'email-peek-row' +
                  (item.unread ? ' is-unread' : '') +
                  (item.isVip ? ' is-vip' : '')
                }
                onClick={() => {
                  void activate(instanceId);
                }}
                title={`${item.from.name || item.from.email} — ${item.subject}`}
              >
                <span className="email-peek-from">
                  {item.isVip ? '⭐ ' : ''}
                  {item.from.name || item.from.email}
                </span>
                <span className="email-peek-subject">{item.subject}</span>
                <span className="email-peek-time">{relativeTime(item.date)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
