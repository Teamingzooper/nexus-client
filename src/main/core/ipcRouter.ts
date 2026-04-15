import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { z, ZodType } from 'zod';
import type { Logger } from './logger';

export interface IpcHandlerSpec<I, O> {
  input?: ZodType<I>;
  handler: (input: I, event: IpcMainInvokeEvent) => Promise<O> | O;
}

export class IpcRouter {
  private registered: string[] = [];

  constructor(private logger: Logger) {}

  register<I, O>(channel: string, spec: IpcHandlerSpec<I, O>): void {
    if (this.registered.includes(channel)) {
      throw new Error(`ipc channel already registered: ${channel}`);
    }
    ipcMain.handle(channel, async (event, raw) => {
      try {
        const input = spec.input ? spec.input.parse(raw) : (raw as I);
        const result = await spec.handler(input, event);
        return { ok: true, data: result };
      } catch (err) {
        if (err instanceof z.ZodError) {
          this.logger.warn(`ipc validation failed on ${channel}`, err.flatten());
          return { ok: false, error: 'invalid input', details: err.flatten() };
        }
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`ipc handler error on ${channel}: ${message}`);
        return { ok: false, error: message };
      }
    });
    this.registered.push(channel);
  }

  dispose(): void {
    for (const c of this.registered) ipcMain.removeHandler(c);
    this.registered = [];
  }
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };
