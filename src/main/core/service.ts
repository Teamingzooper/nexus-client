import type { Logger } from './logger';
import type { EventBus } from './eventBus';

export interface ServiceContext {
  container: ServiceContainer;
  logger: Logger;
  bus: EventBus;
  userData: string;
  appPath: string;
  isDev: boolean;
}

export interface Service {
  readonly name: string;
  init(ctx: ServiceContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export class ServiceContainer {
  private services = new Map<string, Service>();
  private initOrder: string[] = [];
  private initialized = false;

  constructor(private ctx: Omit<ServiceContext, 'container'>) {}

  register(service: Service): this {
    if (this.initialized) {
      throw new Error(
        `cannot register service "${service.name}" after container is initialized`,
      );
    }
    if (this.services.has(service.name)) {
      throw new Error(`service "${service.name}" already registered`);
    }
    this.services.set(service.name, service);
    this.initOrder.push(service.name);
    return this;
  }

  get<T extends Service>(name: string): T {
    const s = this.services.get(name);
    if (!s) throw new Error(`service not found: ${name}`);
    return s as T;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const context: ServiceContext = { ...this.ctx, container: this };
    for (const name of this.initOrder) {
      const svc = this.services.get(name)!;
      this.ctx.logger.debug(`init ${name}`);
      await svc.init(context);
    }
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    // Dispose in reverse init order.
    for (const name of [...this.initOrder].reverse()) {
      const svc = this.services.get(name)!;
      try {
        await svc.dispose?.();
      } catch (err) {
        this.ctx.logger.error(`dispose ${name} failed`, err);
      }
    }
    this.services.clear();
    this.initOrder = [];
    this.initialized = false;
  }
}
