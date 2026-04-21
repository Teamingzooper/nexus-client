import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { createGmailOverlay } from '../../src/main/overlays/gmail';

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'gmail-focused-email.html'),
  'utf8',
);

describe('Gmail overlay — extractFocusedEmail', () => {
  beforeEach(() => {
    const dom = new JSDOM(fixture, { url: 'https://mail.google.com/mail/u/0/' });
    (globalThis as any).document = dom.window.document;
    (globalThis as any).window = dom.window;
  });

  it('extracts subject, sender, recipients, body', () => {
    const overlay = createGmailOverlay();
    const data = overlay.extractFocusedEmail();
    expect(data).not.toBeNull();
    expect(data!.provider).toBe('gmail');
    expect(data!.subject).toBe('Re: design review');
    expect(data!.from).toEqual({ name: 'Alice Smith', email: 'alice@example.com' });
    expect(data!.to.some((a) => a.email === 'me@gmail.com')).toBe(true);
    expect(data!.bodyText).toContain('Hello');
    expect(data!.messageId).toBe('msg-abc-123');
    expect(data!.threadId).toBe('thread-xyz-987');
  });

  it('extracts labels', () => {
    const overlay = createGmailOverlay();
    const data = overlay.extractFocusedEmail();
    expect(data!.labels).toEqual(expect.arrayContaining(['inbox', 'important']));
  });

  it('extracts attachments', () => {
    const overlay = createGmailOverlay();
    const data = overlay.extractFocusedEmail();
    expect(data!.attachments).toHaveLength(1);
    expect(data!.attachments[0].name).toBe('spec.pdf');
    expect(data!.attachments[0].sizeBytes).toBe(123456);
  });

  it('returns null when no email is focused', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://mail.google.com/mail/u/0/',
    });
    (globalThis as any).document = dom.window.document;
    const overlay = createGmailOverlay();
    expect(overlay.extractFocusedEmail()).toBeNull();
  });
});

describe('Gmail overlay — scrapeInboxPeek', () => {
  beforeEach(() => {
    const dom = new JSDOM(fixture, { url: 'https://mail.google.com/mail/u/0/' });
    (globalThis as any).document = dom.window.document;
    (globalThis as any).window = dom.window;
  });

  it('returns inbox rows up to N', () => {
    const overlay = createGmailOverlay();
    const items = overlay.scrapeInboxPeek(5);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].from.email).toBe('carol@example.com');
    expect(items[0].subject).toBe('Subject A');
    expect(items[0].snippet).toContain('Snippet A');
  });

  it('marks unread based on row class', () => {
    const overlay = createGmailOverlay();
    const items = overlay.scrapeInboxPeek(5);
    const unreadRow = items.find((it) => it.from.email === 'carol@example.com');
    const readRow = items.find((it) => it.from.email === 'dan@example.com');
    expect(unreadRow?.unread).toBe(true);
    expect(readRow?.unread).toBe(false);
  });

  it('respects N', () => {
    const overlay = createGmailOverlay();
    const items = overlay.scrapeInboxPeek(1);
    expect(items).toHaveLength(1);
  });
});
