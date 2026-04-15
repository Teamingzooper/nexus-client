/**
 * Main-world Notification shim.
 *
 * Returned as a string to be injected into a service view's page context via
 * webContents.executeJavaScript(shim, true). It replaces window.Notification
 * so that the page's new Notification(...) calls become CustomEvents on
 * document, which the Nexus isolated-world preload catches.
 *
 * Designed to be self-contained, idempotent, and safe to re-run on every
 * dom-ready (e.g. after an in-service reload).
 */
export const mainWorldNotificationShim = `(() => {
  try {
    if (window.__nexusNotifyInstalled) return;
    window.__nexusNotifyInstalled = true;

    const Original = window.Notification;

    function dispatch(detail) {
      try {
        document.dispatchEvent(new CustomEvent('nexus-notify', { detail }));
      } catch (e) {
        // If the page locks down CustomEvent we silently no-op.
      }
    }

    function NexusNotification(title, options) {
      const opts = options || {};
      dispatch({
        title: typeof title === 'string' ? title : String(title || ''),
        body: typeof opts.body === 'string' ? opts.body : '',
        tag: typeof opts.tag === 'string' ? opts.tag : '',
        icon: typeof opts.icon === 'string' ? opts.icon : '',
      });
      // Return a minimal Notification-like object so callers that hold a
      // reference and call .close() or assign event handlers don't crash.
      const stub = {
        title: title,
        body: opts.body || '',
        tag: opts.tag || '',
        icon: opts.icon || '',
        onclick: null,
        onshow: null,
        onclose: null,
        onerror: null,
        close: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () { return false; },
      };
      return stub;
    }

    NexusNotification.permission = 'granted';
    NexusNotification.requestPermission = function (cb) {
      if (typeof cb === 'function') {
        try { cb('granted'); } catch (e) {}
      }
      return Promise.resolve('granted');
    };

    // Preserve any prototype the page might introspect.
    if (Original && Original.prototype) {
      try {
        NexusNotification.prototype = Original.prototype;
      } catch (e) {}
    }

    try {
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        writable: true,
        value: NexusNotification,
      });
    } catch (e) {
      // Fall back to direct assignment.
      window.Notification = NexusNotification;
    }

    // Service workers have their own Notification global which our
    // window.Notification override never touches. BUT when the main thread
    // calls registration.showNotification(...) it goes through
    // ServiceWorkerRegistration.prototype.showNotification — that method
    // lives on the main-world prototype and we CAN patch it here. This is
    // the path WhatsApp Web takes for incoming-message popups, so
    // overriding it is essential for WhatsApp coverage.
    try {
      if (
        typeof ServiceWorkerRegistration !== 'undefined' &&
        ServiceWorkerRegistration.prototype &&
        ServiceWorkerRegistration.prototype.showNotification
      ) {
        var swProto = ServiceWorkerRegistration.prototype;
        var originalShow = swProto.showNotification;
        swProto.showNotification = function (title, options) {
          var opts = options || {};
          dispatch({
            title: typeof title === 'string' ? title : String(title || ''),
            body: typeof opts.body === 'string' ? opts.body : '',
            tag: typeof opts.tag === 'string' ? opts.tag : '',
            icon: typeof opts.icon === 'string' ? opts.icon : '',
          });
          return Promise.resolve();
        };
        swProto.showNotification.__nexusOriginal = originalShow;
      }
    } catch (e) {
      // Prototype locked down — window.Notification override still handles
      // the non-SW path.
    }
  } catch (e) {
    // Never let the shim crash the page.
  }
})();`;
