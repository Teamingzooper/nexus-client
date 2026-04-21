import type { EmailOverlay } from './types';

/**
 * STUB — full implementation lands in Task 9 of the Nexus Mail plan.
 * This minimal factory keeps `npm run typecheck` green between Task 8 and Task 9
 * without shipping a broken build state.
 */
export function createGmailOverlay(): EmailOverlay {
  return {
    provider: 'gmail',
    selectorsVersion: 'gmail-stub',
    extractFocusedEmail: () => null,
    scrapeInboxPeek: () => [],
    observeInbox: () => () => {},
    injectVipContextMenu: () => () => {},
  };
}
