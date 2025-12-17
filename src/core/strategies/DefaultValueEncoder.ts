/**
 * Default Value Encoder
 * Provides compression (gzip) and encryption (AES-256-GCM)
 * Extracted from RedisAdapter for reusability
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import type { CacheOptions } from '../../types';
import type { IValueEncoder } from './IValueEncoder';

/**
 * Default encoder supporting gzip compression and AES-256-GCM encryption
 */
export class DefaultValueEncoder implements IValueEncoder {
  private encryptionKey?: Buffer;

  constructor(encryptionKeyString?: string) {
    if (encryptionKeyString) {
      this.encryptionKey = createHash('sha256').update(encryptionKeyString).digest();
    }
  }

  /**
   * Encode a value with optional compression and encryption
   */
  encode<T>(value: T, options?: CacheOptions): string {
    const base = typeof value === 'string' ? value : JSON.stringify(value);
    const compress = options?.compress === true;
    const encrypt = options?.encrypt === true && this.encryptionKey;

    let payload: string | Buffer = base;

    // Apply compression if requested
    if (compress) {
      payload = gzipSync(Buffer.from(String(base)));
    }

    // Apply encryption if requested and key is available
    if (encrypt && this.encryptionKey) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
      const authTag = cipher.getAuthTag();
      payload = Buffer.concat([iv, authTag, encrypted]);
    }

    // Serialize with metadata
    return JSON.stringify({
      compressed: compress,
      encrypted: Boolean(encrypt),
      payload: Buffer.isBuffer(payload) ? payload.toString('base64') : String(payload),
    });
  }

  /**
   * Decode a value, reversing compression and encryption
   */
  decode<T>(encoded: string): T | null {
    try {
      const parsed = JSON.parse(encoded);
      if (parsed && parsed.payload !== undefined) {
        let buffer = Buffer.from(parsed.payload, 'base64');

        // Decrypt if needed
        if (parsed.encrypted && this.encryptionKey) {
          const iv = buffer.subarray(0, 12);
          const authTag = buffer.subarray(12, 28);
          const data = buffer.subarray(28);
          const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
          decipher.setAuthTag(authTag);
          buffer = Buffer.concat([decipher.update(data), decipher.final()]);
        }

        // Decompress if needed
        if (parsed.compressed) {
          buffer = gunzipSync(buffer);
        }

        const text = buffer.toString('utf8');
        return JSON.parse(text) as T;
      }

      // Fallback to direct JSON parsing
      return JSON.parse(encoded) as T;
    } catch {
      return null;
    }
  }

  /**
   * Get encoder name
   */
  getName(): string {
    return 'DefaultValueEncoder';
  }

  /**
   * Check if encryption is available
   */
  isEncryptionAvailable(): boolean {
    return this.encryptionKey !== undefined;
  }
}
