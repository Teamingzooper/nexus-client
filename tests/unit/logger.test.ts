import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/main/core/logger';

describe('Logger', () => {
  let logSpy: any;
  let errSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('emits at all levels by default (debug threshold)', () => {
    const l = new Logger('t', 'debug');
    l.debug('d');
    l.info('i');
    l.warn('w');
    l.error('e');
    expect(logSpy).toHaveBeenCalledTimes(2); // debug + info
    expect(errSpy).toHaveBeenCalledTimes(2); // warn + error
  });

  it('suppresses below threshold', () => {
    const l = new Logger('t', 'warn');
    l.debug('d');
    l.info('i');
    l.warn('w');
    l.error('e');
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(2);
  });

  it('child logger inherits threshold and prefixes scope', () => {
    const parent = new Logger('parent', 'info');
    const child = parent.child('child');
    child.info('hi');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('[parent:child]');
  });

  it('setThreshold updates filtering', () => {
    const l = new Logger('t', 'debug');
    l.setThreshold('error');
    l.warn('w');
    l.error('e');
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
