import type { EmailData, EmailAddress, EmailAttachment, PeekItem } from '../../shared/types';
import type { EmailOverlay } from './types';

export function createGmailOverlay(): EmailOverlay {
  return {
    provider: 'gmail',
    selectorsVersion: 'gmail-v1',

    extractFocusedEmail(): EmailData | null {
      try {
        const container = document.querySelector('.ii.gt[data-message-id], div[role="main"] .ii.gt') as HTMLElement | null;
        if (!container) return null;

        const messageId = container.getAttribute('data-message-id') ?? container.getAttribute('data-legacy-message-id');
        const subjectEl = document.querySelector('h2.hP') as HTMLElement | null;
        const subject = subjectEl?.textContent?.trim() ?? '';
        const threadId = subjectEl?.getAttribute('data-thread-perm-id') ?? null;

        const fromEl = document.querySelector('span.g2[email]') as HTMLElement | null;
        const from: EmailAddress = {
          name: fromEl?.getAttribute('name') ?? fromEl?.textContent?.trim() ?? '',
          email: fromEl?.getAttribute('email') ?? '',
        };

        const to: EmailAddress[] = [];
        const cc: EmailAddress[] = [];
        document.querySelectorAll('span.gD[email], span.g2.recipient[email]').forEach((el) => {
          const addr: EmailAddress = {
            name: el.getAttribute('name') ?? el.textContent?.trim() ?? '',
            email: el.getAttribute('email') ?? '',
          };
          to.push(addr);
        });

        const dateEl = document.querySelector('.g3.adh') as HTMLElement | null;
        const dateTitle = dateEl?.getAttribute('title') ?? dateEl?.textContent ?? '';
        const parsed = Date.parse(dateTitle);
        const date = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();

        const bodyEl = document.querySelector('.a3s.aiL') as HTMLElement | null;
        const bodyText = bodyEl?.textContent?.trim() ?? '';
        const bodyHtml = bodyEl?.innerHTML?.trim() ?? '';

        const labels: string[] = [];
        document.querySelectorAll('.aim').forEach((el) => {
          const t = el.textContent?.trim();
          if (t) labels.push(t);
        });

        const attachments: EmailAttachment[] = [];
        document.querySelectorAll('.aZo[data-attachment-name]').forEach((el) => {
          const name = el.getAttribute('data-attachment-name') ?? '';
          const sizeAttr = el.getAttribute('data-attachment-size');
          const sizeBytes = sizeAttr ? Number(sizeAttr) : null;
          attachments.push({ name, sizeBytes: Number.isFinite(sizeBytes as number) ? (sizeBytes as number) : null });
        });

        const account = extractAccount();

        return {
          provider: 'gmail',
          account,
          messageId,
          threadId,
          date,
          from,
          to,
          cc,
          bcc: [],
          subject,
          bodyText,
          bodyHtml,
          labels,
          attachments,
        };
      } catch {
        return null;
      }
    },

    scrapeInboxPeek(n: number): PeekItem[] {
      try {
        const rows = Array.from(document.querySelectorAll('table[role="grid"] tr[data-thread-id]')) as HTMLElement[];
        const items: PeekItem[] = [];
        for (const row of rows) {
          if (items.length >= n) break;
          const senderEl = row.querySelector('span[email]');
          const subjectEl = row.querySelector('.bog .bqe');
          const snippetEl = row.querySelector('.y2');
          const dateEl = row.querySelector('.xW span[title]');
          const unread = row.classList.contains('zE');
          const threadId = row.getAttribute('data-thread-id');
          const messageId = row.getAttribute('data-message-id');

          if (!senderEl || !subjectEl) continue;

          const from: EmailAddress = {
            name: senderEl.textContent?.trim() ?? '',
            email: senderEl.getAttribute('email') ?? '',
          };
          const subject = subjectEl.textContent?.trim() ?? '';
          const snippet = snippetEl?.textContent?.replace(/^\s*-\s*/, '').trim() ?? '';
          const dateRaw = dateEl?.getAttribute('title') ?? '';
          const parsed = Date.parse(dateRaw);
          const date = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();

          items.push({
            messageId,
            threadId,
            from,
            subject,
            snippet,
            date,
            unread,
            isVip: false,
          });
        }
        return items;
      } catch {
        return [];
      }
    },

    observeInbox(onChange: () => void): () => void {
      const target = document.querySelector('table[role="grid"]');
      if (!target) return () => {};
      const mo = new MutationObserver(() => onChange());
      mo.observe(target, { childList: true, subtree: true, attributes: true });
      return () => mo.disconnect();
    },

    injectVipContextMenu(onMark: (email: string) => void): () => void {
      function onContextMenu(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const emailEl = target.closest('span[email]') as HTMLElement | null;
        if (!emailEl) return;
        const email = emailEl.getAttribute('email');
        if (!email) return;
        e.preventDefault();
        showSimpleMenu(e.clientX, e.clientY, [
          { label: '⭐ Mark as VIP', onClick: () => onMark(email) },
        ]);
      }
      document.addEventListener('contextmenu', onContextMenu, true);
      return () => document.removeEventListener('contextmenu', onContextMenu, true);
    },
  };
}

function extractAccount(): string {
  const chip = document.querySelector('a[aria-label*="@"]') as HTMLElement | null;
  const match = chip?.getAttribute('aria-label')?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (match) return match[0];
  const t = document.title.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
  return t ? t[1] : 'unknown@gmail';
}

function showSimpleMenu(x: number, y: number, items: Array<{ label: string; onClick: () => void }>): void {
  const menu = document.createElement('div');
  menu.style.cssText = `
    position: fixed; left: ${x}px; top: ${y}px; z-index: 2147483647;
    background: #fff; color: #222; border: 1px solid #ccc; border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2); font: 13px system-ui, sans-serif;
    padding: 4px 0; min-width: 160px;
  `;
  for (const it of items) {
    const entry = document.createElement('div');
    entry.textContent = it.label;
    entry.style.cssText = 'padding: 6px 12px; cursor: pointer;';
    entry.addEventListener('mouseenter', () => { entry.style.background = '#eee'; });
    entry.addEventListener('mouseleave', () => { entry.style.background = ''; });
    entry.addEventListener('click', () => {
      it.onClick();
      menu.remove();
    });
    menu.appendChild(entry);
  }
  function dismiss(e: MouseEvent): void {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('click', dismiss, true);
    }
  }
  setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  document.body.appendChild(menu);
}
