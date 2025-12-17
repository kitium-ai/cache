/**
 * No-Op (No Operation) Value Encoder
 * Provides identity encoding/decoding without compression or encryption
 * Useful for testing and debugging
 */

import type { CacheOptions } from '../../types';
import type { IValueEncoder } from './IValueEncoder';

/**
 * No-op encoder for pass-through storage
 * Minimal overhead, useful for testing and benchmarking
 */
export class NoOpValueEncoder implements IValueEncoder {
  /**
   * Encode a value with minimal transformation
   * Just serializes to JSON if not already a string
   */
  encode<T>(value: T, _options?: CacheOptions): string {
    if (typeof value === 'string') {
      return JSON.stringify({ value, isString: true });
    }
    return JSON.stringify({ value, isString: false });
  }

  /**
   * Decode a value by reversing the minimal transformation
   */
  decode<T>(encoded: string): T | null {
    try {
      const parsed = JSON.parse(encoded);
      if (parsed && parsed.value !== undefined) {
        return parsed.value as T;
      }
      return JSON.parse(encoded) as T;
    } catch {
      return null;
    }
  }

  /**
   * Get encoder name
   */
  getName(): string {
    return 'NoOpValueEncoder';
  }
}
