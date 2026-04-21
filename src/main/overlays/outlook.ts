import type { EmailOverlay } from './types';

/**
 * STUB — full implementation lands in Task 10 of the Nexus Mail plan.
 * This minimal factory keeps `npm run typecheck` green between Task 8 and Task 10
 * without shipping a broken build state.
 */
export function createOutlookOverlay(): EmailOverlay {
  return {
    provider: 'outlook',
    selectorsVersion: 'outlook-stub',
    extractFocusedEmail: () => null,
    scrapeInboxPeek: () => [],
    observeInbox: () => () => {},
    injectVipContextMenu: () => () => {},
  };
}
