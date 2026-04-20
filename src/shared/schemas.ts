import { z } from 'zod';
import { profileIdSchema } from './profile';

export const notificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dom'),
    selector: z.string().min(1),
    parse: z.enum(['int', 'text']).optional(),
  }),
  z.object({
    kind: z.literal('title'),
    pattern: z.string().optional(),
  }),
  z.object({ kind: z.literal('custom') }),
  z.object({ kind: z.literal('none') }),
]);

export const manifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, 'id must be lowercase alphanumeric with - or _'),
  name: z.string().min(1).max(64),
  version: z.string().min(1).max(32),
  author: z.string().max(128).optional(),
  description: z.string().max(512).optional(),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), 'module url must be https'),
  icon: z
    .string()
    .max(256)
    .refine((p) => !p.includes('..'), 'icon path must not contain ..')
    .optional(),
  partition: z.string().regex(/^persist:[a-z0-9-_]+$/).optional(),
  userAgent: z.string().max(512).optional(),
  permissions: z.array(z.string()).max(16).optional(),
  allowedOrigins: z
    .array(
      z
        .string()
        .url()
        .refine((u) => u.startsWith('https://'), 'allowed origin must be https'),
    )
    .max(16)
    .optional(),
  inject: z
    .object({
      css: z
        .string()
        .max(256)
        .refine((p) => !p.includes('..'), 'css path must not contain ..')
        .optional(),
      preload: z
        .string()
        .max(256)
        .refine((p) => !p.includes('..'), 'preload path must not contain ..')
        .optional(),
    })
    .optional(),
  notifications: notificationSchema.optional(),
});

const hexColor = z
  .string()
  .regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'must be a hex color');

export const themeColorsSchema = z.object({
  bg: hexColor,
  sidebar: hexColor,
  sidebarHover: hexColor,
  accent: hexColor,
  accentFg: hexColor,
  text: hexColor,
  textMuted: hexColor,
  border: hexColor,
  badge: hexColor,
  badgeFg: hexColor,
});

export const themeSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, 'theme id must be lowercase alphanumeric with - or _'),
  name: z.string().min(1).max(64),
  colors: themeColorsSchema,
});

export const themePackSchema = z.object({
  $schema: z.literal('nexus-theme-pack').optional(),
  version: z.literal(1),
  name: z.string().max(128).optional(),
  author: z.string().max(128).optional(),
  themes: z.array(themeSchema).min(1).max(64),
});

export const boundsSchema = z.object({
  x: z.number().int().min(0).max(10000),
  y: z.number().int().min(0).max(10000),
  width: z.number().int().min(0).max(10000),
  height: z.number().int().min(0).max(10000),
});

export const moduleIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/);

export const themeIdSchema = moduleIdSchema;

/**
 * Global app-wide state. Does NOT include instances, sidebar layout, or
 * active instance — those are per-profile and live in ProfileService.
 * Only things that apply to the whole app regardless of which profile
 * is active belong here.
 */
// Time-of-day stored as "HH:MM" 24-hour. Used for DND start/end.
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM 24-hour');

export const appStateSchema = z.object({
  themeId: themeIdSchema,
  activeProfileId: profileIdSchema.nullable(),
  notificationsEnabled: z.boolean().optional(),
  notificationSound: z.boolean().optional(),
  notificationPrivacyMode: z.boolean().optional(),
  dndEnabled: z.boolean().optional(),
  dndStart: timeOfDay.optional(),
  dndEnd: timeOfDay.optional(),
  launchAtLogin: z.boolean().optional(),
  sidebarCompact: z.boolean().optional(),
  sidebarWidth: z.number().int().min(68).max(600).optional(),
  closeToTray: z.boolean().optional(),
  globalShortcutEnabled: z.boolean().optional(),
  globalShortcut: z.string().max(64).optional(),
  windowState: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().min(400),
      height: z.number().min(300),
      maximized: z.boolean().optional(),
    })
    .optional(),
});
