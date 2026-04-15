import type { WebContents } from 'electron';
import type { NotificationStrategySpec } from '../../../shared/types';
import type { Logger } from '../../core/logger';

export interface StrategyContext {
  moduleId: string;
  webContents: WebContents;
  logger: Logger;
  emit: (count: number, preview?: string) => void;
}

export interface NotificationStrategy {
  readonly kind: string;
  attach(ctx: StrategyContext): void;
  detach(): void;
}

export interface StrategyFactory {
  create(spec: NotificationStrategySpec): NotificationStrategy | null;
}
