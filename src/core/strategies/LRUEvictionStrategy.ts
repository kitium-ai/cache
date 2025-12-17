/**
 * LRU (Least Recently Used) Eviction Strategy
 * Evicts the least recently accessed entry
 * Optimal for caches where recent data is more likely to be reused
 */

import type { IEvictionStrategy } from './IEvictionStrategy';

/**
 * LRU eviction implementation
 * Tracks access order and evicts least recently used entries
 */
export class LRUEvictionStrategy<K, V> implements IEvictionStrategy<K, V> {
  private accessOrder: Map<K, number> = new Map();
  private accessCounter: number = 0;

  /**
   * Record access to an entry - update its access timestamp
   */
  recordAccess(key: K): void {
    this.accessOrder.set(key, this.accessCounter++);
  }

  /**
   * Record insertion of a new entry
   * Must be called when a new entry is added to cache
   */
  recordInsertion(key: K): void {
    this.accessOrder.set(key, this.accessCounter++);
  }

  /**
   * Select the least recently used entry for eviction
   */
  selectEvictionCandidate(entries: Map<K, V>): K | null {
    let lruKey: K | null = null;
    let lruTime: number = Infinity;

    for (const [key] of entries) {
      const accessTime = this.accessOrder.get(key);
      if (accessTime !== undefined && accessTime < lruTime) {
        lruTime = accessTime;
        lruKey = key;
      }
    }

    return lruKey;
  }

  /**
   * Remove tracking for a deleted key
   */
  removeKey(key: K): void {
    this.accessOrder.delete(key);
  }

  /**
   * Clear all tracking state
   */
  reset(): void {
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return 'LRU';
  }

  /**
   * Get the number of tracked entries
   */
  getTrackedCount(): number {
    return this.accessOrder.size;
  }
}
