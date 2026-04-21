import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { createOutlookOverlay } from '../../src/main/overlays/outlook';

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'outlook-focused-email.html'),
  'utf8',
);

describe('Outlook overlay — extractFocusedEmail', () => {
  beforeEach(() => {
    const dom = new JSDOM(fixture, { url: 'https://outlook.office.com/mail/' });
    (globalThis as any).document = dom.window.document;
    (globalThis as any).window = dom.window;
  });

  it('extracts subject, sender, body, threadId', () => {
    const overlay = createOutlookOverlay();
    const data = overlay.extractFocusedEmail();
    expect(data).not.toBeNull();
    expect(data!.provider).toBe('outlook');
    expect(data!.subject).toBe('Re: quarterly planning');
    expect(data!.from.email).toBe('alice@example.com');
    expect(data!.threadId).toBe('conv-987');
    expect(data!.bodyText).toContain('Outlook email');
  });

  it('extracts attachments', () => {
    const overlay = createOutlookOverlay();
    const data = overlay.extractFocusedEmail();
    expect(data!.attachments).toHaveLength(1);
    expect(data!.attachments[0].name).toBe('q4-plan.xlsx');
    expect(data!.attachments[0].sizeBytes).toBe(54321);
  });
});

describe('Outlook overlay — scrapeInboxPeek', () => {
  beforeEach(() => {
    const dom = new JSDOM(fixture, { url: 'https://outlook.office.com/mail/' });
    (globalThis as any).document = dom.window.document;
    (globalThis as any).window = dom.window;
  });

  it('returns up to N inbox items', () => {
    const overlay = createOutlookOverlay();
    const items = overlay.scrapeInboxPeek(5);
    expect(items.length).toBe(2);
    expect(items[0].subject).toBe('Subject A');
    expect(items[0].unread).toBe(true);
    expect(items[1].unread).toBe(false);
  });

  it('parses email from title attr like "Name <email@x>"', () => {
    const overlay = createOutlookOverlay();
    const items = overlay.scrapeInboxPeek(5);
    expect(items[1].from.email).toBe('dan@example.com');
    expect(items[1].from.name).toBe('Dan');
  });
});
