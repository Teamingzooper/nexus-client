# Email Mode

Nexus v1.4 adds first-class email support for **Gmail** and **Outlook (Office 365)**. Email modules look and feel like any other Nexus service — they're wrapped web portals — but layer power-user features on top via a per-provider overlay that runs inside the embedded `WebContentsView`.

## What's included

- **Copy focused email as JSON** — press `Cmd+Shift+C` (macOS) / `Ctrl+Shift+C` (Windows / Linux) while reading an email. Your clipboard gets a structured JSON payload with sender, all recipients, subject, date, body (text + HTML), labels, and attachment metadata. Ideal for pasting into scripts, Notion, Obsidian, task trackers, or LLM chats.
- **Sidebar email peek** — a collapsible panel in the sidebar shows the latest messages from every email account in one place. Unread rows are bold; VIP rows are highlighted with a ⭐. Click a row to jump to that account's inbox.
- **VIP senders** — right-click a sender's name/email inside an email view and choose "⭐ Mark as VIP." VIPs appear with a ⭐ prefix and a dedicated unread counter in the peek panel. (Notification-level VIP prefixing and custom per-VIP sounds are scaffolded for v2 — see "Known limitations" below.)
- **Rebindable hotkeys** — every registered action (currently just `email.copyAsJson`, with more to come) appears in **Settings → Hotkeys** with click-to-rebind and conflict detection.
- **Kill-switch** — if a Gmail or Outlook redesign ever bricks the overlay, set `features.emailMode` to `false` in the Nexus app-state file to fall back to plain web-portal behaviour without uninstalling or downgrading.

## Add an email account

1. Sidebar → **+ Instance** → pick **Gmail** or **Outlook**.
2. Sign in to the embedded web view. Session cookies are persisted per-instance in an isolated Electron partition — Nexus never sees your password.
3. Repeat for additional accounts; a single module can have multiple instances (e.g. separate "work" and "personal" Gmail tabs).

## Clipboard JSON format

Pressing the Copy-as-JSON hotkey while focused on an email writes a payload of this shape to the clipboard:

```json
{
  "provider": "gmail",
  "account": "personal@gmail.com",
  "messageId": "<abc@mail.gmail.com>",
  "threadId": "thread_xyz",
  "date": "2026-04-21T14:32:00Z",
  "from": { "name": "Alice", "email": "alice@example.com" },
  "to": [{ "name": "Me", "email": "me@gmail.com" }],
  "cc": [],
  "bcc": [],
  "subject": "Re: design review",
  "bodyText": "…",
  "bodyHtml": "…",
  "labels": ["inbox", "important"],
  "attachments": [{ "name": "spec.pdf", "sizeBytes": 123456 }]
}
```

> **Note on `bodyHtml`:** this is raw HTML from the provider's rendered email, passed through unsanitized. Gmail and Outlook already sanitize their own rendered markup, but downstream consumers (paste targets, scripts) should still treat it as untrusted content.

## Managing VIPs

- **Context menu:** in any Gmail or Outlook view, right-click a sender name or address. The in-page menu offers "⭐ Mark as VIP." The sender is added with just the email; you can edit the label/sound later in settings.
- **Settings → Email → VIP senders:** add, edit, or remove VIP entries. Each has optional `label` (shown in listings and in the peek panel) and `sound` (stored for v2 — see below — but not yet applied to notifications).

**What VIPs currently do (v1):**
- Highlighted with a ⭐ and a dedicated unread counter in the sidebar peek panel.
- Stored and visible in Settings → Email.

**What VIPs will do in v2 (scaffolded but not yet firing):**
- ⭐ prefix on OS notifications.
- Custom notification sound per VIP.

The notification-hook plumbing needs a sender-email field added to the internal `notification:native` bus event before these fire — tracked as a follow-up.

## Peek panel

Configure the panel via **Settings → Email → Peek panel**:

- **Visibility** — always visible (default), show on hover, or hidden.
- **Items per account** — 1 to 20 rows per email instance.
- **Grouping** — by-account (each instance's items grouped together) or unified (chronological across all accounts).

Data is scraped from the open inbox view via a MutationObserver + a 60-second safety-net poll. If you're in a non-inbox view (Drafts, Sent, a thread), the panel falls back to the last known snapshot.

## Hotkeys

**Settings → Hotkeys** lists every rebindable action. Click a binding to record a new chord (press Escape to cancel). The UI shows a message if the chord you pick conflicts with another action, so you can unbind or rebind the other one first.

Current actions:

| Action | Default binding |
|---|---|
| Copy focused email as JSON | `Cmd+Shift+C` / `Ctrl+Shift+C` |

Hotkeys are **in-app** — they fire only while a Nexus window is focused.

## Known limitations (v1)

- **Gmail and Outlook only.** Proton Mail and Fastmail scrapers are planned for a later release. Community modules welcome.
- **DOM-dependent.** The overlay depends on selectors in Gmail's and Outlook's web UIs. If a provider rolls out a major redesign, copy-as-JSON falls back to plain selection text and the peek panel shows "unavailable" until Nexus ships updated selectors. Report breakage via GitHub issues with `[gmail-v1]` or `[outlook-v1]` in the title.
- **Recipient separation.** CC and BCC recipients currently appear in the `to[]` array rather than their own fields. See the TODO in `src/main/overlays/gmail.ts` / `outlook.ts`.
- **Date fallback.** On parse failure, the `date` field is populated with `Date.now()` rather than null (the type is non-nullable for v1). Refinement in a follow-up.
- **Read-only peek.** You can't reply, archive, or compose from the peek panel — click through to the provider's UI for those actions.

## Troubleshooting

- **Copy hotkey does nothing** — open **Settings → Hotkeys** and confirm `email.copyAsJson` has a binding. If a provider-native shortcut (Gmail's own `c` for compose, etc.) is conflicting, rebind to a different chord.
- **Peek panel is empty** — the overlay needs the inbox DOM to be rendered at least once. Scroll the inbox, or switch to it and back, to trigger the MutationObserver.
- **VIP prefix missing on notifications** — VIP notification prefixing and custom sounds are explicitly v2 (see above). The hook is installed in `NotificationService.showNative`, but the `notification:native` event in `src/main/core/eventBus.ts` does not yet carry a sender email, so the VIP check never fires. File an issue if you need this before v2 — it's a medium-size wiring task, not a hard one.

## Where the code lives

- **Shared types + IPC channels:** `src/shared/types.ts`
- **Settings schema:** `src/shared/schemas.ts` (`emailSettingsSchema`, `emailPeekConfigSchema`, `vipEntrySchema`)
- **Core services:** `src/main/services/hotkeyRegistryService.ts`, `src/main/services/emailOverlayService.ts`, `src/main/services/peekCacheService.ts`
- **VIP matcher:** `src/main/email/vipMatcher.ts`
- **Provider overlays:** `src/main/overlays/gmail.ts`, `src/main/overlays/outlook.ts`
- **ViewService injection:** `src/main/services/viewService.ts` (`before-input-event`, `additionalArguments`, overlay map)
- **Renderer UI:** `src/renderer/components/EmailPeekPanel.tsx`, `EmailSettingsTab.tsx`, `HotkeysSettingsTab.tsx`
- **Bundled modules:** `modules/gmail/`, `modules/outlook/`
