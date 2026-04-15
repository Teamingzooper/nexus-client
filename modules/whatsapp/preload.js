// WhatsApp Web unread-count scraper.
// Runs in the embedded view's isolated world (contextIsolation: true, sandbox: true).
const { ipcRenderer } = require('electron');

let lastCount = -1;

function computeUnread() {
  let total = 0;
  // Unread badges appear as spans with aria-label like "3 unread messages".
  document.querySelectorAll('span[aria-label]').forEach((el) => {
    const label = el.getAttribute('aria-label') || '';
    const match = label.match(/(\d+)\s+unread/i);
    if (match) total += parseInt(match[1], 10) || 0;
  });
  return total;
}

function report() {
  const count = computeUnread();
  if (count !== lastCount) {
    lastCount = count;
    ipcRenderer.send('nexus:unread', count);
  }
}

function start() {
  report();
  const observer = new MutationObserver(() => {
    // throttle with rAF
    if (start._pending) return;
    start._pending = true;
    requestAnimationFrame(() => {
      start._pending = false;
      report();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
