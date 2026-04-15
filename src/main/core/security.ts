import { Session, shell } from 'electron';
import * as path from 'path';
import type { Logger } from './logger';

const DEFAULT_ALLOWED_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'media',
  'fullscreen',
  'pointerLock',
  'notifications',
]);

export function hardenSession(
  ses: Session,
  origin: string,
  logger: Logger,
  allowedPermissions: Set<string> = DEFAULT_ALLOWED_PERMISSIONS,
): void {
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = allowedPermissions.has(permission);
    if (!allow) logger.debug(`denied ${permission} for ${origin}`);
    callback(allow);
  });

  ses.setPermissionCheckHandler((_wc, permission) => allowedPermissions.has(permission));

  ses.webRequest.onHeadersReceived((details, cb) => {
    const headers = details.responseHeaders ?? {};
    // Strip frame-ancestors so embedded UIs don't refuse to render.
    // We don't weaken the CSP of the page itself otherwise.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'x-frame-options') delete headers[key];
    }
    cb({ responseHeaders: headers });
  });
}

export function applyRendererCsp(ses: Session): void {
  ses.webRequest.onHeadersReceived((details, cb) => {
    const headers = details.responseHeaders ?? {};
    headers['Content-Security-Policy'] = [
      "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' ws://localhost:5173 http://localhost:5173; " +
        "object-src 'none'; " +
        "base-uri 'none'; " +
        "form-action 'none'",
    ];
    cb({ responseHeaders: headers });
  });
}

/**
 * Resolve a file path relative to a module, refusing anything that escapes the module dir.
 * Returns the absolute path if safe, or null.
 */
export function resolveModuleFile(moduleDir: string, relative: string): string | null {
  const resolvedModule = path.resolve(moduleDir);
  const resolved = path.resolve(moduleDir, relative);
  const rel = path.relative(resolvedModule, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

/**
 * Attach a navigation guard: redirects off-origin navigations to the system browser
 * instead of loading them inside the service view.
 */
export function installNavigationGuard(
  webContents: Electron.WebContents,
  allowedOrigin: string,
  logger: Logger,
): void {
  webContents.on('will-navigate', (event, target) => {
    try {
      const targetOrigin = new URL(target).origin;
      if (targetOrigin !== allowedOrigin) {
        event.preventDefault();
        logger.debug(`redirecting off-origin nav ${target} -> browser`);
        shell.openExternal(target).catch(() => {});
      }
    } catch {
      event.preventDefault();
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
}
