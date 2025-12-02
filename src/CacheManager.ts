/**
 * Cache Manager
 * Main class for cache operations with support for multiple strategies
 */

import { EventEmitter } from 'events';
import {
  CacheKeyConfig,
  CacheOptions,
  CacheStats,
  ConnectionPoolConfig,
  ICacheAdapter,
  ICacheManager,
  InvalidationEvent,
  InvalidationStrategy,
  RedisConfig,
  TTLConfig,
} from './types';
import { CacheKeyManager } from './CacheKeyManager';
import { RedisAdapter } from './RedisAdapter';

export class CacheManager extends EventEmitter implements ICacheManager {
  private adapter: ICacheAdapter;
  private keyManager: CacheKeyManager;
  private ttlConfig: TTLConfig;
  private invalidationListeners: Set<(event: InvalidationEvent) => void> = new Set();

  constructor(
    redisConfig: RedisConfig,
    poolConfig: ConnectionPoolConfig,
    keyConfig: CacheKeyConfig = {},
    ttlConfig: TTLConfig = { defaultTTL: 3600, maxTTL: 86400, minTTL: 1 }
  ) {
    super();
    this.ttlConfig = ttlConfig;
    this.keyManager = new CacheKeyManager(keyConfig);
    this.adapter = new RedisAdapter(redisConfig, poolConfig, this.keyManager, ttlConfig.defaultTTL);
  }

  /**
   * Initialize the cache manager
   */
  async connect(): Promise<void> {
    await this.adapter.connect();
  }

  /**
   * Close connections
   */
  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return this.adapter.healthCheck();
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.keyManager.buildKey(key);
    return this.adapter.get<T>(fullKey);
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const fullKey = this.keyManager.buildKey(key);
    const ttl = this.validateAndAdjustTTL(options?.ttl);

    const cacheOptions: CacheOptions = {
      ...options,
      ttl,
    };

    await this.adapter.set(fullKey, value, cacheOptions);
  }

  /**
   * Get or compute a value
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const fullKey = this.keyManager.buildKey(key);

    // Try to get from cache
    const cached = await this.adapter.get<T>(fullKey);
    if (cached !== null) {
      return cached;
    }

    // Compute value
    const value = await fn();

    // Store in cache
    const ttl = this.validateAndAdjustTTL(options?.ttl);
    const cacheOptions: CacheOptions = {
      ...options,
      ttl,
    };

    await this.adapter.set(fullKey, value, cacheOptions);
    return value;
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.keyManager.buildKey(key);
    const result = await this.adapter.delete(fullKey);

    if (result) {
      this.emitInvalidationEvent({
        strategy: InvalidationStrategy.MANUAL,
        keys: [fullKey],
        timestamp: Date.now(),
        reason: 'Manual deletion',
      });
    }

    return result;
  }

  /**
   * Delete multiple keys
   */
  async deleteMultiple(keys: string[]): Promise<number> {
    let deleted = 0;
    const deletedKeys: string[] = [];

    for (const key of keys) {
      const fullKey = this.keyManager.buildKey(key);
      const result = await this.adapter.delete(fullKey);
      if (result) {
        deleted++;
        deletedKeys.push(fullKey);
      }
    }

    if (deleted > 0) {
      this.emitInvalidationEvent({
        strategy: InvalidationStrategy.MANUAL,
        keys: deletedKeys,
        timestamp: Date.now(),
        reason: 'Bulk deletion',
      });
    }

    return deleted;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.keyManager.buildKey(key);
    return this.adapter.exists(fullKey);
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    await this.adapter.clear();

    this.emitInvalidationEvent({
      strategy: InvalidationStrategy.MANUAL,
      keys: [],
      timestamp: Date.now(),
      reason: 'Cache cleared',
    });
  }

  /**
   * Get all keys matching pattern
   */
  async getKeys(pattern?: string): Promise<string[]> {
    const keys = await this.adapter.getKeys(pattern);
    // Remove the prefix/namespace from keys
    return keys.map((key) => {
      const parts = this.keyManager.extractParts(key);
      return parts.join(':');
    });
  }

  /**
   * Invalidate keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const count = await this.adapter.invalidatePattern(pattern);

    if (count > 0) {
      this.emitInvalidationEvent({
        strategy: InvalidationStrategy.PATTERN,
        keys: [],
        timestamp: Date.now(),
        reason: `Pattern invalidation: ${pattern}`,
      });
    }

    return count;
  }

  /**
   * Invalidate keys with specific tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    const keys = this.keyManager.getKeysByTags(tags);
    const count = await this.adapter.invalidateByTags(tags);

    if (count > 0) {
      this.emitInvalidationEvent({
        strategy: InvalidationStrategy.PATTERN,
        keys,
        timestamp: Date.now(),
        reason: `Tag invalidation: ${tags.join(', ')}`,
      });
    }

    return count;
  }

  /**
   * Register invalidation event listener
   */
  onInvalidation(callback: (event: InvalidationEvent) => void): void {
    this.invalidationListeners.add(callback);
  }

  /**
   * Remove invalidation event listener
   */
  offInvalidation(callback: (event: InvalidationEvent) => void): void {
    this.invalidationListeners.delete(callback);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return this.adapter.getStats();
  }

  /**
   * Warmup cache with initial data
   */
  async warmup(data: Record<string, unknown>, options?: CacheOptions): Promise<void> {
    const entries = Object.entries(data);
    const ttl = this.validateAndAdjustTTL(options?.ttl);

    const cacheOptions: CacheOptions = {
      ...options,
      ttl,
    };

    // Set all entries
    const promises = entries.map(([key, value]) => {
      const fullKey = this.keyManager.buildKey(key);
      return this.adapter.set(fullKey, value, cacheOptions);
    });

    await Promise.all(promises);
  }

  /**
   * Get cache key manager for advanced operations
   */
  getKeyManager(): CacheKeyManager {
    return this.keyManager;
  }

  /**
   * Get cache adapter for low-level operations
   */
  getAdapter(): ICacheAdapter {
    return this.adapter;
  }

  /**
   * Validate and adjust TTL according to configured limits
   */
  private validateAndAdjustTTL(ttl?: number): number {
    if (!ttl || ttl <= 0) {
      return this.ttlConfig.defaultTTL;
    }

    if (ttl < this.ttlConfig.minTTL) {
      return this.ttlConfig.minTTL;
    }

    if (ttl > this.ttlConfig.maxTTL) {
      return this.ttlConfig.maxTTL;
    }

    return ttl;
  }

  /**
   * Emit invalidation event to all listeners
   */
  private emitInvalidationEvent(event: InvalidationEvent): void {
    this.invalidationListeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        // Log error but don't throw
        console.error('Error in invalidation listener:', error);
      }
    });

    this.emit('invalidation', event);
  }
}
