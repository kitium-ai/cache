/**
 * Eviction Strategy Interface
 * Defines how to select cache entries for eviction when capacity is reached
 */

/**
 * Strategy for selecting which cache entries to evict
 * Implementations define different eviction policies (FIFO, LRU, LFU, etc.)
 */
export interface IEvictionStrategy<K, V> {
  /**
   * Record insertion of a new cache entry
   * Used by strategies to track insertion order
   */
  recordInsertion(key: K): void;

  /**
   * Record access to a cache entry
   * Used by strategies like LRU to track access order
   */
  recordAccess(key: K): void;

  /**
   * Select an entry to evict from the cache
   * Should return the key of the entry to remove
   * Returns null if no eviction is needed
   */
  selectEvictionCandidate(entries: Map<K, V>): K | null;

  /**
   * Clear all internal tracking state
   * Called when the cache is cleared
   */
  reset(): void;

  /**
   * Get the name of this eviction strategy
   */
  getName(): string;
}
