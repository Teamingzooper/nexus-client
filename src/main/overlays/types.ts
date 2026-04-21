import type { EmailData, PeekItem } from '../../shared/types';

export interface EmailOverlay {
  provider: 'gmail' | 'outlook';
  selectorsVersion: string;

  /**
   * Reads the currently-focused email from the DOM. Returns null if none is
   * focused or selectors don't match (DOM changed).
   */
  extractFocusedEmail(): EmailData | null;

  /**
   * Returns the latest N items from the current inbox-like view.
   * Returns [] if the view is not recognized (e.g. user is in Sent, Drafts).
   */
  scrapeInboxPeek(n: number): PeekItem[];

  /**
   * Installs a MutationObserver on inbox-relevant DOM. The returned function
   * removes the observer.
   */
  observeInbox(onChange: () => void): () => void;

  /**
   * Injects a right-click context menu item "Mark as VIP" on sender elements.
   * The returned function removes the injection.
   */
  injectVipContextMenu(onMark: (email: string) => void): () => void;
}

export type OverlayFactory = () => EmailOverlay;
