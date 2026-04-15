type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(
    private scope: string,
    private threshold: Level = 'debug',
  ) {}

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.threshold);
  }

  setThreshold(level: Level): void {
    this.threshold = level;
  }

  debug(msg: string, meta?: unknown): void {
    this.emit('debug', msg, meta);
  }
  info(msg: string, meta?: unknown): void {
    this.emit('info', msg, meta);
  }
  warn(msg: string, meta?: unknown): void {
    this.emit('warn', msg, meta);
  }
  error(msg: string, meta?: unknown): void {
    this.emit('error', msg, meta);
  }

  private emit(level: Level, msg: string, meta?: unknown): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.threshold]) return;
    const ts = new Date().toISOString();
    const line = `${ts} [${level.toUpperCase()}] [${this.scope}] ${msg}`;
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    if (meta !== undefined) {
      out(line, meta);
    } else {
      out(line);
    }
  }
}

export const rootLogger = new Logger('nexus', process.env.NEXUS_LOG_LEVEL as Level | undefined ?? 'info');
