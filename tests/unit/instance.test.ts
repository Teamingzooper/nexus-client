import { describe, it, expect } from 'vitest';
import {
  moduleInstanceSchema,
  nextInstanceId,
  nextInstanceName,
  partitionForInstance,
} from '../../src/shared/instance';

describe('nextInstanceId', () => {
  it('returns the module id when none exist yet', () => {
    expect(nextInstanceId('whatsapp', [])).toBe('whatsapp');
  });

  it('returns moduleId-2 for the second instance', () => {
    expect(nextInstanceId('whatsapp', ['whatsapp'])).toBe('whatsapp-2');
  });

  it('keeps incrementing past collisions', () => {
    expect(nextInstanceId('whatsapp', ['whatsapp', 'whatsapp-2', 'whatsapp-3'])).toBe(
      'whatsapp-4',
    );
  });

  it('skips gaps in existing numbering', () => {
    expect(nextInstanceId('whatsapp', ['whatsapp', 'whatsapp-2'])).toBe('whatsapp-3');
  });
});

describe('nextInstanceName', () => {
  it('returns the module name when none exist', () => {
    expect(nextInstanceName('WhatsApp', [])).toBe('WhatsApp');
  });

  it('returns "Name 2" for the second instance', () => {
    expect(nextInstanceName('WhatsApp', ['WhatsApp'])).toBe('WhatsApp 2');
  });

  it('increments past collisions', () => {
    expect(nextInstanceName('WhatsApp', ['WhatsApp', 'WhatsApp 2'])).toBe('WhatsApp 3');
  });
});

describe('partitionForInstance', () => {
  it('always returns a persistent partition', () => {
    expect(partitionForInstance('whatsapp')).toBe('persist:whatsapp');
    expect(partitionForInstance('whatsapp-2')).toBe('persist:whatsapp-2');
  });
});

describe('moduleInstanceSchema', () => {
  it('accepts a valid instance', () => {
    const res = moduleInstanceSchema.safeParse({
      id: 'whatsapp-2',
      moduleId: 'whatsapp',
      name: 'Work',
    });
    expect(res.success).toBe(true);
  });

  it('rejects ids with invalid characters', () => {
    expect(
      moduleInstanceSchema.safeParse({ id: 'Whats App', moduleId: 'whatsapp', name: 'x' })
        .success,
    ).toBe(false);
    expect(
      moduleInstanceSchema.safeParse({ id: '../escape', moduleId: 'whatsapp', name: 'x' })
        .success,
    ).toBe(false);
  });

  it('rejects empty names', () => {
    expect(
      moduleInstanceSchema.safeParse({ id: 'whatsapp', moduleId: 'whatsapp', name: '' })
        .success,
    ).toBe(false);
  });
});
