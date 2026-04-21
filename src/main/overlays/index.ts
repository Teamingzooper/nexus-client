import type { EmailOverlay } from './types';

/**
 * Returns the overlay factory for a given provider id. Overlay bundles are
 * pure functions — no main-process state, no Electron APIs. They run inside
 * the WebContentsView via the preload script.
 */
export async function loadOverlay(provider: 'gmail' | 'outlook'): Promise<EmailOverlay> {
  if (provider === 'gmail') {
    const mod = await import('./gmail');
    return mod.createGmailOverlay();
  }
  if (provider === 'outlook') {
    const mod = await import('./outlook');
    return mod.createOutlookOverlay();
  }
  throw new Error(`unknown email provider: ${provider}`);
}
