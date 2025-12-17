/**
 * Windowed TinyLFU (W-TinyLFU) Eviction Strategy
 * Combines recency and frequency for optimal cache performance
 * Based on the TinyLFU algorithm used in Caffeine cache
 */

import type { IEvictionStrategy } from './IEvictionStrategy';

interface TinyLFUConfig {
  /** Size of the window for recent accesses */
  windowSize: number;
  /** Sample size for frequency estimation */
  sampleSize: number;
  /** Reset threshold for frequency counters */
  resetThreshold: number;
}

/**
 * Windowed TinyLFU implementation
 * Maintains a sliding window of recent accesses and frequency counts
 * Evicts items with lowest frequency in the current window
 */
export class WindowedTinyLFUEvictionStrategy<K, V> implements IEvictionStrategy<K, V> {
  private window: K[] = [];
  private frequencyMap: Map<K, number> = new Map();
  private accessCount: number = 0;
  private resetCount: number = 0;

  constructor(
    private config: TinyLFUConfig = {
      windowSize: 100,
      sampleSize: 1000,
      resetThreshold: 10000,
    }
  ) {}

  /**
   * Record access to an entry - update frequency and window
   */
  recordAccess(key: K): void {
    this.updateFrequency(key);
    this.addToWindow(key);
    this.accessCount++;

    // Periodic reset to prevent frequency pollution
    if (this.accessCount >= this.config.resetThreshold) {
      this.resetFrequencies();
    }
  }

  /**
   * Record insertion of a new entry
   */
  recordInsertion(key: K): void {
    this.updateFrequency(key);
    this.addToWindow(key);
  }

  /**
   * Select victim for eviction using TinyLFU algorithm
   * Evicts the item with lowest frequency in current window
   */
  selectEvictionCandidate(entries: Map<K, V>): K | null {
    if (entries.size === 0) return null;

    let victim: K | null = null;
    let lowestFrequency = Infinity;

    // Only consider items in current window
    const windowSet = new Set(this.window);

    for (const [key] of entries) {
      if (!windowSet.has(key)) continue;

      const frequency = this.frequencyMap.get(key) || 0;
      if (frequency < lowestFrequency) {
        lowestFrequency = frequency;
        victim = key;
      }
    }

	    // If no victim found in window, fall back to random eviction
	    if (victim === null) {
	      const keys = Array.from(entries.keys());
	      const candidate = keys[Math.floor(Math.random() * keys.length)];
	      victim = candidate === undefined ? null : candidate;
	    }

    return victim;
  }

  /**
   * Reset all tracking state
   */
  reset(): void {
    this.window = [];
    this.frequencyMap.clear();
    this.accessCount = 0;
    this.resetCount = 0;
  }

  /**
   * Get strategy name
   */
  getName(): string {
    return 'WindowedTinyLFU';
  }

  /**
   * Get current window contents (for debugging)
   */
  getWindow(): readonly K[] {
    return [...this.window];
  }

  /**
   * Get frequency map (for debugging)
   */
  getFrequencyMap(): ReadonlyMap<K, number> {
    return new Map(this.frequencyMap);
  }

  private updateFrequency(key: K): void {
    const current = this.frequencyMap.get(key) || 0;
    this.frequencyMap.set(key, current + 1);
  }

  private addToWindow(key: K): void {
    // Remove existing occurrence if present
    const existingIndex = this.window.indexOf(key);
    if (existingIndex !== -1) {
      this.window.splice(existingIndex, 1);
    }

    // Add to end of window
    this.window.push(key);

    // Maintain window size
    if (this.window.length > this.config.windowSize) {
      this.window.shift();
    }
  }

  private resetFrequencies(): void {
    // Halve all frequencies to allow new items to compete
    for (const [key, frequency] of this.frequencyMap) {
      this.frequencyMap.set(key, Math.floor(frequency / 2));
    }

    this.accessCount = 0;
    this.resetCount++;
  }
}

/**
 * Simplified TinyLFU for smaller caches
 */
export class TinyLFUEvictionStrategy<K, V> extends WindowedTinyLFUEvictionStrategy<K, V> {
  constructor(sampleSize: number = 1000) {
    super({
      windowSize: Math.floor(sampleSize / 10),
      sampleSize,
      resetThreshold: sampleSize * 10,
    });
  }

	  override getName(): string {
	    return 'TinyLFU';
	  }
}
