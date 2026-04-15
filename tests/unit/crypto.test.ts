import { describe, it, expect } from 'vitest';
import {
  computeVerifier,
  decryptJson,
  deriveKey,
  encryptJson,
  newSalt,
  verifyPassword,
} from '../../src/main/core/crypto';

describe('crypto', () => {
  describe('newSalt', () => {
    it('returns a different value each call', () => {
      const a = newSalt();
      const b = newSalt();
      expect(a).not.toBe(b);
      expect(a.length).toBeGreaterThan(0);
    });
  });

  describe('deriveKey', () => {
    it('is deterministic for the same password+salt', () => {
      const salt = newSalt();
      const k1 = deriveKey('hunter2', salt);
      const k2 = deriveKey('hunter2', salt);
      expect(k1.equals(k2)).toBe(true);
    });

    it('yields different keys for different passwords', () => {
      const salt = newSalt();
      const k1 = deriveKey('hunter2', salt);
      const k2 = deriveKey('hunter3', salt);
      expect(k1.equals(k2)).toBe(false);
    });

    it('yields different keys for different salts', () => {
      const k1 = deriveKey('hunter2', newSalt());
      const k2 = deriveKey('hunter2', newSalt());
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('recovers the original object with the right key', () => {
      const key = deriveKey('pw', newSalt());
      const payload = { hello: 'world', nested: { n: 42 } };
      const blob = encryptJson(payload, key);
      const recovered = decryptJson<typeof payload>(blob, key);
      expect(recovered).toEqual(payload);
    });

    it('produces different ciphertext for the same input each time (random iv)', () => {
      const key = deriveKey('pw', newSalt());
      const a = encryptJson({ x: 1 }, key);
      const b = encryptJson({ x: 1 }, key);
      expect(a).not.toBe(b);
    });

    it('throws when decrypting with the wrong key', () => {
      const key = deriveKey('pw', newSalt());
      const blob = encryptJson({ x: 1 }, key);
      const wrongKey = deriveKey('pw', newSalt());
      expect(() => decryptJson(blob, wrongKey)).toThrow();
    });

    it('throws when the ciphertext has been tampered with', () => {
      const key = deriveKey('pw', newSalt());
      const blob = encryptJson({ x: 1 }, key);
      const buf = Buffer.from(blob, 'base64');
      // Flip one bit deep in the ciphertext.
      buf[buf.length - 1] ^= 0x01;
      expect(() => decryptJson(buf.toString('base64'), key)).toThrow();
    });

    it('throws on malformed blob', () => {
      const key = deriveKey('pw', newSalt());
      expect(() => decryptJson('not-base64-not-json', key)).toThrow();
    });
  });

  describe('verifyPassword', () => {
    it('accepts the correct password and rejects wrong ones', () => {
      const salt = newSalt();
      const verifier = computeVerifier('correcthorse', salt);
      expect(verifyPassword('correcthorse', salt, verifier)).toBe(true);
      expect(verifyPassword('wrongpw', salt, verifier)).toBe(false);
      expect(verifyPassword('', salt, verifier)).toBe(false);
    });

    it('is constant-time equality (no false positive on length mismatch)', () => {
      const salt = newSalt();
      const verifier = computeVerifier('pw', salt);
      expect(verifyPassword('pw', salt, 'not even the right length')).toBe(false);
    });
  });
});
