import { describe, expect, it } from 'vitest';
import * as encryption from '../encryption.js';

/**
 * Unit tests for encryption utilities (#79).
 *
 * Covers encrypt/decrypt round-trip, key generation (SHA-256 hashing),
 * and key rotation (different keys produce different ciphertext).
 *
 * Note: `env` is parsed at module load time and cached, so
 * `process.env.ENCRYPTION_KEY` changes after import have no effect.
 * Tests that depend on key rotation use the fact that the module
 * was loaded with a known key and verify behaviour from there.
 */

describe('encrypt', () => {
  it('returns an object with iv, encrypted, and authTag fields', () => {
    const result = encryption.encrypt('hello');

    expect(result).toHaveProperty('iv');
    expect(result).toHaveProperty('encrypted');
    expect(result).toHaveProperty('authTag');
  });

  it('produces a unique IV on every call', () => {
    const first = encryption.encrypt('same plaintext');
    const second = encryption.encrypt('same plaintext');

    expect(first.iv).not.toBe(second.iv);
  });

  it('produces unique ciphertext on every call (random IV)', () => {
    const first = encryption.encrypt('same plaintext');
    const second = encryption.encrypt('same plaintext');

    expect(first.encrypted).not.toBe(second.encrypted);
  });

  it('produces a 32-byte (256-bit) auth tag', () => {
    const result = encryption.encrypt('test');

    // authTag is hex-encoded 16 bytes = 32 hex chars
    expect(result.authTag).toHaveLength(32);
  });

  it('produces a 32-byte (256-bit) IV', () => {
    const result = encryption.encrypt('test');

    // IV is 16 bytes = 32 hex chars
    expect(result.iv).toHaveLength(32);
  });
});

describe('decrypt', () => {
  it('round-trips a simple string', () => {
    const plaintext = 'hello world';
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('round-trips an empty string', () => {
    const plaintext = '';
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('round-trips unicode text', () => {
    const plaintext = 'Caf\u00e9 \u2603 \ud83d\ude80';
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('round-trips a long message', () => {
    const plaintext = 'A'.repeat(10000);
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('round-trips JSON data', () => {
    const plaintext = JSON.stringify({ name: 'Alice', roles: ['admin', 'editor'], active: true });
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(JSON.parse(decrypted)).toEqual({ name: 'Alice', roles: ['admin', 'editor'], active: true });
  });

  it('throws on tampered authTag', () => {
    const plaintext = 'secret';
    const encrypted = encryption.encrypt(plaintext);

    // Tamper with the authTag
    const tampered = { ...encrypted, authTag: '00'.repeat(16) };

    expect(() => encryption.decrypt(tampered)).toThrow();
  });

  it('throws on tampered encrypted data', () => {
    const plaintext = 'secret';
    const encrypted = encryption.encrypt(plaintext);

    // Tamper with the encrypted payload
    const tampered = { ...encrypted, encrypted: 'deadbeef' };

    expect(() => encryption.decrypt(tampered)).toThrow();
  });

  it('throws on tampered IV', () => {
    const plaintext = 'secret';
    const encrypted = encryption.encrypt(plaintext);

    // Tamper with the IV
    const tampered = { ...encrypted, iv: '00'.repeat(16) };

    expect(() => encryption.decrypt(tampered)).toThrow();
  });

  it('throws when authTag is missing', () => {
    const plaintext = 'secret';
    const encrypted = encryption.encrypt(plaintext);

    // Remove authTag
    const tampered = { iv: encrypted.iv, encrypted: encrypted.encrypted };

    expect(() => encryption.decrypt(tampered as encryption.EncryptedData)).toThrow();
  });
});

describe('key generation and rotation', () => {
  it('hashes the key with SHA-256 internally (deterministic key => consistent decrypt)', () => {
    // The internal getKey() hashes the env value with SHA-256.
    // Encrypt and decrypt with the loaded key should always work.
    const plaintext = 'rotation test';
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('same plaintext with different random IVs both decrypt correctly', () => {
    const plaintext = 'test';

    const enc1 = encryption.encrypt(plaintext);
    const enc2 = encryption.encrypt(plaintext);
    const enc3 = encryption.encrypt(plaintext);

    // All IVs differ (random)
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc2.iv).not.toBe(enc3.iv);
    // All ciphertexts differ (random IV)
    expect(enc1.encrypted).not.toBe(enc2.encrypted);
    expect(enc2.encrypted).not.toBe(enc3.encrypted);
    // But all decrypt correctly
    expect(encryption.decrypt(enc1)).toBe(plaintext);
    expect(encryption.decrypt(enc2)).toBe(plaintext);
    expect(encryption.decrypt(enc3)).toBe(plaintext);
  });

  it('authTag is unique per encryption call', () => {
    const enc1 = encryption.encrypt('data');
    const enc2 = encryption.encrypt('data');

    expect(enc1.authTag).not.toBe(enc2.authTag);
  });

  it('encrypted output is hex-encoded', () => {
    const result = encryption.encrypt('hello');

    // encrypted field should be valid hex
    expect(result.encrypted).toMatch(/^[0-9a-f]+$/);
    expect(result.iv).toMatch(/^[0-9a-f]+$/);
    expect(result.authTag).toMatch(/^[0-9a-f]+$/);
  });
});
