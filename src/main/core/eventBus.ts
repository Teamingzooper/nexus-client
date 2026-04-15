import type { UnreadUpdate, ModuleManifest } from '../../shared/types';

export interface NexusEvents {
  'modules:loaded': { count: number };
  'modules:reloaded': { count: number };
  'module:activated': { moduleId: string };
  'module:enabled': { moduleId: string };
  'module:disabled': { moduleId: string };
  'module:registered': { manifest: ModuleManifest };
  'view:created': { moduleId: string };
  'view:destroyed': { moduleId: string };
  'view:suspended': { suspended: boolean };
  'view:ready': { moduleId: string };
  'view:load-failed': { moduleId: string; error: string };
  'notification:update': UnreadUpdate;
  'theme:changed': { themeId: string };
  'settings:changed': { key: string };
}

type Handler<K extends keyof NexusEvents> = (payload: NexusEvents[K]) => void;

export class EventBus {
  private handlers = new Map<keyof NexusEvents, Set<Handler<any>>>();

  on<K extends keyof NexusEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof NexusEvents>(event: K, payload: NexusEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[nexus] event handler error on ${String(event)}:`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
