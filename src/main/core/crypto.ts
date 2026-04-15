import {
  scryptSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'crypto';

/**
 * Password-based encryption for per-profile state files. scrypt for the KDF
 * (built into node:crypto, memory-hard), AES-256-GCM for the cipher (AEAD,
 * 12-byte nonce, 16-byte tag).
 *
 * SCOPE NOTE: this encrypts the profile's state JSON only — instance
 * metadata, sidebar layout. It does NOT encrypt Chromium session
 * partitions (cookies, IndexedDB, service workers). Those sit in
 * `userData/Partitions/*` in plaintext regardless of password. A profile
 * password here is a UI separation + metadata lock, not a real security
 * boundary against disk-level attackers. Users are told this in the
 * profile creation UI.
 */

// scrypt parameters chosen for ~250ms derivation on a 2020 laptop. These
// are fine for client-side use and a decent brute-force speedbump.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 32;
const SCRYPT_VERIFIER_LEN = 32;

const AES_KEY_LEN = 32;
const AES_IV_LEN = 12;
const AES_TAG_LEN = 16;

const SALT_LEN = 16;

/** Generate a new random salt for a profile. Stored in profile metadata. */
export function newSalt(): string {
  return randomBytes(SALT_LEN).toString('base64');
}

/**
 * Derive an AES key from a password + salt. Used both for encryption and
 * for the separate password verifier.
 */
export function deriveKey(password: string, saltB64: string, length = AES_KEY_LEN): Buffer {
  const salt = Buffer.from(saltB64, 'base64');
  return scryptSync(password, salt, length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
}

/**
 * Compute a verifier — a separate scrypt output used to check the password
 * WITHOUT touching the encrypted state blob. Having a dedicated verifier
 * lets us say "wrong password" on a failed unlock without ambiguity over
 * AES-GCM auth-tag failures (which can also mean "corrupted file").
 *
 * We use a DIFFERENT salt than the encryption key to keep the two derivations
 * independent — otherwise a successful unlock implies you have an oracle
 * that also verifies passwords, and vice versa.
 */
export function computeVerifier(password: string, verifierSaltB64: string): string {
  return deriveKey(password, verifierSaltB64, SCRYPT_VERIFIER_LEN).toString('base64');
}

/** Constant-time string comparison for the verifier. */
export function verifyPassword(
  password: string,
  verifierSaltB64: string,
  expectedB64: string,
): boolean {
  try {
    const computed = Buffer.from(
      computeVerifier(password, verifierSaltB64),
      'base64',
    );
    const expected = Buffer.from(expectedB64, 'base64');
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

/**
 * Serialized ciphertext format:
 *   base64( iv(12) | authTag(16) | ciphertext )
 * The salt lives in the profile metadata, not the blob, because we want
 * to use the same salt across updates so the key is stable.
 */
export function encryptJson(plaintext: unknown, key: Buffer): string {
  if (key.length !== AES_KEY_LEN) {
    throw new Error(`encryptJson: key must be ${AES_KEY_LEN} bytes, got ${key.length}`);
  }
  const iv = randomBytes(AES_IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(plaintext), 'utf8');
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypt a base64 blob previously produced by encryptJson with the same key.
 * Throws on any failure (auth tag mismatch, invalid JSON, wrong key).
 */
export function decryptJson<T = unknown>(blobB64: string, key: Buffer): T {
  if (key.length !== AES_KEY_LEN) {
    throw new Error(`decryptJson: key must be ${AES_KEY_LEN} bytes, got ${key.length}`);
  }
  const blob = Buffer.from(blobB64, 'base64');
  if (blob.length < AES_IV_LEN + AES_TAG_LEN + 1) {
    throw new Error('decryptJson: blob too short');
  }
  const iv = blob.subarray(0, AES_IV_LEN);
  const tag = blob.subarray(AES_IV_LEN, AES_IV_LEN + AES_TAG_LEN);
  const ct = blob.subarray(AES_IV_LEN + AES_TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}
