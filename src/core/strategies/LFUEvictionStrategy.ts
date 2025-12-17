/**
 * LFU (Least Frequently Used) Eviction Strategy
 * Evicts the least frequently accessed entry
 * Optimal for caches where popular data is more likely to be reused
 */

import type { IEvictionStrategy } from './IEvictionStrategy';

/**
 * LFU eviction implementation
 * Tracks access frequency and evicts least frequently used entries
 * Includes LRU as tiebreaker when frequency is equal
 */
export class LFUEvictionStrategy<K, V> implements IEvictionStrategy<K, V> {
  private frequency: Map<K, number> = new Map();
  private lastAccessTime: Map<K, number> = new Map();
  private currentTime: number = 0;

  /**
   * Record access to an entry - increment its frequency
   */
  recordAccess(key: K): void {
    const currentFreq = this.frequency.get(key) ?? 0;
    this.frequency.set(key, currentFreq + 1);
    this.lastAccessTime.set(key, this.currentTime++);
  }

  /**
   * Record insertion of a new entry
   * Must be called when a new entry is added to cache
   */
  recordInsertion(key: K): void {
    this.frequency.set(key, 1);
    this.lastAccessTime.set(key, this.currentTime++);
  }

  /**
   * Select the least frequently used entry for eviction
   * Uses last access time as tiebreaker (LRU)
   */
  selectEvictionCandidate(entries: Map<K, V>): K | null {
    let lfuKey: K | null = null;
    let lfuFreq: number = Infinity;
    let lfuTime: number = Infinity;

    for (const [key] of entries) {
      const freq = this.frequency.get(key) ?? 0;
      const accessTime = this.lastAccessTime.get(key) ?? 0;

      // Select by minimum frequency, then by oldest access time
      if (freq < lfuFreq || (freq === lfuFreq && accessTime < lfuTime)) {
        lfuFreq = freq;
        lfuTime = accessTime;
        lfuKey = key;
      }
    }

    return lfuKey;
  }

  /**
   * Remove tracking for a deleted key
   */
  removeKey(key: K): void {
    this.frequency.delete(key);
    this.lastAccessTime.delete(key);
  }

  /**
   * Clear all tracking state
   */
  reset(): void {
    this.frequency.clear();
    this.lastAccessTime.clear();
    this.currentTime = 0;
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return 'LFU';
  }

  /**
   * Get the frequency of an entry
   */
  getFrequency(key: K): number {
    return this.frequency.get(key) ?? 0;
  }

  /**
   * Get the number of tracked entries
   */
  getTrackedCount(): number {
    return this.frequency.size;
  }
}
