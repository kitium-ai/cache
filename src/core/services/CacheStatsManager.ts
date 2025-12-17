/**
 * Cache Statistics Manager
 * Centralizes stats tracking and aggregation
 * Eliminates scattered stats updates throughout RedisAdapter
 */

import type { CacheStats, InstrumentationHooks } from '../../types';

/**
 * Manager for cache statistics tracking
 * Provides a single source of truth for metrics
 * Enables extensible metrics collection via instrumentation hooks
 */
export class CacheStatsManager {
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sizeBytes: 0,
    itemCount: 0,
    hitRate: 0,
    lastUpdated: Date.now(),
  };

  constructor(
    private readonly instrumentation?: InstrumentationHooks
  ) {}

  /**
   * Record a cache hit
   */
  recordHit(): void {
    this.stats.hits++;
    this.updateHitRate();
  }

  /**
   * Record a cache miss
   */
  recordMiss(): void {
    this.stats.misses++;
    this.updateHitRate();
  }

  /**
   * Record an item being set
   */
  recordSet(): void {
    this.stats.itemCount++;
  }

  /**
   * Record an item being deleted
   */
  recordDelete(): void {
    if (this.stats.itemCount > 0) {
      this.stats.itemCount--;
    }
  }

  /**
   * Record items being evicted
   * @param count Number of items evicted
   */
  recordEvictions(count: number = 1): void {
    this.stats.evictions += count;
    this.stats.itemCount = Math.max(0, this.stats.itemCount - count);
  }

  /**
   * Update memory usage
   * @param sizeBytes New size in bytes
   */
  updateMemoryUsage(sizeBytes: number): void {
    this.stats.sizeBytes = sizeBytes;
  }

  /**
   * Get current statistics snapshot
   */
  getStats(): Readonly<CacheStats> {
    return Object.freeze({ ...this.stats });
  }

  /**
   * Reset all statistics to initial state
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sizeBytes: 0,
      itemCount: 0,
      hitRate: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Update stats and trigger instrumentation hooks
   * Call this when stats need to be persisted or reported
   */
  updateAndNotify(): void {
    this.stats.lastUpdated = Date.now();
    this.instrumentation?.onStats?.(this.getStats() as CacheStats);
  }

  /**
   * Clear all stats but keep the hit rate calculation
   */
  clearCounters(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.itemCount = 0;
    this.stats.hitRate = 0;
    this.stats.lastUpdated = Date.now();
  }

  /**
   * Private: Calculate and update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0
      ? (this.stats.hits / total) * 100
      : 0;
  }

  /**
   * Create a copy of stats for reporting
   */
  snapshot(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Merge stats from another manager (useful for aggregating stats)
   */
  merge(other: CacheStatsManager): void {
    const otherStats = other.getStats();
    this.stats.hits += otherStats.hits;
    this.stats.misses += otherStats.misses;
    this.stats.evictions += otherStats.evictions;
    this.stats.itemCount += otherStats.itemCount;
    this.stats.sizeBytes += otherStats.sizeBytes;
    this.updateHitRate();
  }
}
