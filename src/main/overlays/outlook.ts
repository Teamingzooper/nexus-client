import type { EmailData, EmailAddress, EmailAttachment, PeekItem } from '../../shared/types';
import type { EmailOverlay } from './types';

/** Parses "Name <email@x.com>" or just "email@x.com" or just "Name". */
function parseNameEmail(raw: string): EmailAddress {
  const trimmed = (raw ?? '').trim();
  const match = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  if (/^[^\s@]+@[^\s@]+$/.test(trimmed)) return { name: '', email: trimmed };
  return { name: trimmed, email: '' };
}

export function createOutlookOverlay(): EmailOverlay {
  return {
    provider: 'outlook',
    selectorsVersion: 'outlook-v1',

    extractFocusedEmail(): EmailData | null {
      try {
        const container = document.querySelector('#ReadingPaneContainerId [data-convid]') as HTMLElement | null;
        if (!container) return null;

        const threadId = container.getAttribute('data-convid');
        const subjectEl = document.querySelector('#ReadingPaneContainerId [role="heading"][aria-level="1"]') as HTMLElement | null;
        const subject = subjectEl?.textContent?.trim() ?? '';

        const fromEl = document.querySelector('[data-app-section="MessageHeader"] .OZZZK[title]') as HTMLElement | null;
        const from = parseNameEmail(fromEl?.getAttribute('title') ?? fromEl?.textContent ?? '');

        // TODO: distinguish "to" from "cc" recipients. Outlook's DOM doesn't
        // always separate them clearly; v1 surfaces all secondary recipients
        // in `to[]` and leaves `cc` empty. Follow-up to inspect real Outlook
        // markup and pick correct selectors.
        const to: EmailAddress[] = [];
        document.querySelectorAll('[data-app-section="MessageHeader"] .IovuJ span[title]').forEach((el) => {
          to.push(parseNameEmail((el as HTMLElement).getAttribute('title') ?? el.textContent ?? ''));
        });

        // TODO: if Date.parse fails, we fabricate "now" because EmailData.date
        // is typed as non-nullable string. Future: widen the type or abort.
        const dateEl = document.querySelector('[data-app-section="MessageHeader"] .AL_OM[aria-label]') as HTMLElement | null;
        const dateIso = dateEl?.getAttribute('aria-label') ?? '';
        const parsed = Date.parse(dateIso);
        const date = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();

        // NOTE: bodyHtml is raw innerHTML — passed to the clipboard unsanitized.
        // Outlook sanitizes its own rendered email HTML, but consumers of the JSON
        // export (paste targets, scripts) should treat this as untrusted content.
        const bodyEl = document.querySelector('[data-app-section="MessageBody"]') as HTMLElement | null;
        const bodyText = bodyEl?.textContent?.trim() ?? '';
        const bodyHtml = bodyEl?.innerHTML?.trim() ?? '';

        const attachments: EmailAttachment[] = [];
        document.querySelectorAll('[data-app-section="AttachmentWell"] [data-name]').forEach((el) => {
          const name = (el as HTMLElement).getAttribute('data-name') ?? '';
          const sizeAttr = (el as HTMLElement).getAttribute('data-size');
          const sizeBytes = sizeAttr ? Number(sizeAttr) : null;
          attachments.push({ name, sizeBytes: Number.isFinite(sizeBytes as number) ? (sizeBytes as number) : null });
        });

        const account = extractAccount();

        return {
          provider: 'outlook',
          account,
          messageId: null,
          threadId,
          date,
          from,
          to,
          cc: [],
          bcc: [],
          subject,
          bodyText,
          bodyHtml,
          labels: [],
          attachments,
        };
      } catch {
        return null;
      }
    },

    scrapeInboxPeek(n: number): PeekItem[] {
      try {
        const rows = Array.from(document.querySelectorAll('[role="listbox"][data-app-section="MessageList"] [role="option"][data-convid]')) as HTMLElement[];
        const items: PeekItem[] = [];
        for (const row of rows) {
          if (items.length >= n) break;
          const senderEl = row.querySelector('.lvHighlightAllClass');
          const subjectEl = row.querySelector('.lvHighlightSubjectClass');
          const snippetEl = row.querySelector('.lvHighlightSnippetClass');
          const dateEl = row.querySelector('span[aria-label]');
          const unread = row.getAttribute('data-is-read') === 'false';
          const threadId = row.getAttribute('data-convid');

          if (!senderEl || !subjectEl) continue;

          const from = parseNameEmail((senderEl as HTMLElement).getAttribute('title') ?? senderEl.textContent ?? '');
          const subject = subjectEl.textContent?.trim() ?? '';
          const snippet = snippetEl?.textContent?.trim() ?? '';
          const dateIso = dateEl?.getAttribute('aria-label') ?? '';
          const parsed = Date.parse(dateIso);
          const date = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();

          items.push({ messageId: null, threadId, from, subject, snippet, date, unread, isVip: false });
        }
        return items;
      } catch {
        return [];
      }
    },

    observeInbox(onChange: () => void): () => void {
      const target = document.querySelector('[role="listbox"][data-app-section="MessageList"]');
      if (!target) return () => {};
      const mo = new MutationObserver(() => onChange());
      mo.observe(target, { childList: true, subtree: true, attributes: true });
      return () => mo.disconnect();
    },

    injectVipContextMenu(onMark: (email: string) => void): () => void {
      function onContextMenu(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const el = target.closest('[title*="@"]') as HTMLElement | null;
        if (!el) return;
        const parsed = parseNameEmail(el.getAttribute('title') ?? '');
        if (!parsed.email) return;
        e.preventDefault();
        showSimpleMenu(e.clientX, e.clientY, [
          { label: '⭐ Mark as VIP', onClick: () => onMark(parsed.email) },
        ]);
      }
      document.addEventListener('contextmenu', onContextMenu, true);
      return () => document.removeEventListener('contextmenu', onContextMenu, true);
    },
  };
}

function extractAccount(): string {
  const titleMatch = document.title.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
  // Return empty string rather than a fabricated-but-plausible address so
  // downstream consumers of the JSON export can detect the failure.
  return titleMatch ? titleMatch[1] : '';
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
      document.removeEventListener('click', dismiss, true);
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
