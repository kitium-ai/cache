/**
 * FIFO (First In First Out) Eviction Strategy
 * Evicts the oldest entry (first added) regardless of access patterns
 */

import type { IEvictionStrategy } from './IEvictionStrategy';

/**
 * FIFO eviction implementation
 * Maintains insertion order and evicts the oldest entry
 */
export class FIFOEvictionStrategy<K, V> implements IEvictionStrategy<K, V> {
  private insertionOrder: K[] = [];

  /**
   * Record access - for FIFO, we don't need to do anything on access
   * Only insertion matters
   */
  recordAccess(_key: K): void {
    // FIFO doesn't care about access patterns
  }

  /**
   * Select the oldest (first inserted) entry for eviction
   */
  selectEvictionCandidate(entries: Map<K, V>): K | null {
    // Find the first key in insertion order that still exists
    while (this.insertionOrder.length > 0) {
      const oldestKey = this.insertionOrder[0];
      if (oldestKey !== undefined && entries.has(oldestKey)) {
        return oldestKey;
      }
      // Remove stale entries from our tracking
      this.insertionOrder.shift();
    }
    return null;
  }

  /**
   * Record insertion of a new entry
   * Must be called when a new entry is added to cache
   */
  recordInsertion(key: K): void {
    this.insertionOrder.push(key);
  }

  /**
   * Clear the insertion order tracking
   */
  reset(): void {
    this.insertionOrder = [];
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return 'FIFO';
  }
}
