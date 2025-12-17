/**
 * Value Encoder Strategy Interface
 * Defines how cache values are encoded/decoded
 * Supports compression, encryption, and custom transformations
 */

import type { CacheOptions } from '../../types';

/**
 * Strategy for encoding/decoding cache values
 * Implementations can provide compression, encryption, or other transformations
 */
export interface IValueEncoder {
  /**
   * Encode (transform) a value before storing in cache
   */
  encode<T>(value: T, options?: CacheOptions): string;

  /**
   * Decode (reverse transform) a value retrieved from cache
   */
  decode<T>(encoded: string): T | null;

  /**
   * Get the name of this encoder
   */
  getName(): string;
}
