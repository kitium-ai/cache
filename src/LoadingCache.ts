/**
 * Loading Cache with Automatic Refresh
 * Implements cache-aside pattern with refresh-ahead capabilities
 * Inspired by Google Guava LoadingCache
 */

import { EventEmitter } from 'node:events';

import { getLogger } from '@kitiumai/logger';

import { CacheManager } from './CacheManager';
import type { CacheOptions } from './types';

export interface LoadingCacheOptions<T> extends CacheOptions {
  /** Function to load value when not in cache */
  loader?: () => Promise<T>;
  /** Refresh-ahead time window in seconds before TTL expires */
  refreshAheadSeconds?: number;
  /** Whether to refresh asynchronously without blocking */
  asyncRefresh?: boolean;
  /** Maximum refresh attempts */
  maxRefreshAttempts?: number;
  /** Backoff multiplier for refresh retries */
  refreshBackoffMultiplier?: number;
}

export interface CacheLoader<K, V> {
  load(key: K): Promise<V>;
  loadAll?(keys: K[]): Promise<Map<K, V>>;
}

/**
 * LoadingCache provides automatic loading of cache values
 * with refresh-ahead capabilities for optimal performance
 */
export class LoadingCache<K = string, V = any> extends EventEmitter {
  private refreshTimers: Map<K, NodeJS.Timeout> = new Map();
  private refreshAttempts: Map<K, number> = new Map();
  private logger = getLogger().child({ component: 'loading-cache' });

  constructor(
    private cacheManager: CacheManager,
    private loader: CacheLoader<K, V>,
    private options: {
      refreshAheadSeconds?: number;
      asyncRefresh?: boolean;
      maxRefreshAttempts?: number;
      refreshBackoffMultiplier?: number;
      defaultTTL?: number;
    } = {}
  ) {
    super();
  }

  /**
   * Get value from cache, loading if necessary
   */
  async get(key: K, options?: Partial<LoadingCacheOptions<V>>): Promise<V> {
    const fullKey = this.buildKey(key);
    const cacheOptions = { ...this.options, ...options };

    try {
      // Try to get from cache first
      const cached = await this.cacheManager.get<V>(fullKey);
      if (cached !== null) {
        this.scheduleRefreshIfNeeded(key, fullKey, cacheOptions);
        return cached;
      }

      // Load and cache the value
      return await this.loadAndCache(key, fullKey, cacheOptions);
    } catch (error) {
      this.logger.error(
        'Failed to get value from loading cache',
        { key, error },
        this.toError(error)
      );
      throw error;
    }
  }

  /**
   * Get all values for the given keys
   */
  async getAll(keys: K[], options?: Partial<LoadingCacheOptions<V>>): Promise<Map<K, V>> {
    const cacheOptions = { ...this.options, ...options };
    const result = new Map<K, V>();
    const keysToLoad: K[] = [];

    // Check cache for all keys
    for (const key of keys) {
      const fullKey = this.buildKey(key);
      try {
        const cached = await this.cacheManager.get<V>(fullKey);
        if (cached !== null) {
          result.set(key, cached);
          this.scheduleRefreshIfNeeded(key, fullKey, cacheOptions);
        } else {
          keysToLoad.push(key);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached value', { key, error });
        keysToLoad.push(key);
      }
    }

    // Load missing keys
    if (keysToLoad.length > 0) {
      try {
        const loadedValues = await this.loadAllAndCache(keysToLoad, cacheOptions);
        for (const [key, value] of loadedValues) {
          result.set(key, value);
        }
      } catch (error) {
        this.logger.error(
          'Failed to load multiple values',
          { keys: keysToLoad, error },
          this.toError(error)
        );
        throw error;
      }
    }

    return result;
  }

  /**
   * Invalidate a specific key
   */
  async invalidate(key: K): Promise<boolean> {
    const fullKey = this.buildKey(key);
    this.clearRefreshTimer(key);
    this.refreshAttempts.delete(key);
    return await this.cacheManager.delete(fullKey);
  }

  /**
   * Invalidate all keys
   */
  async invalidateAll(): Promise<void> {
    this.clearAllRefreshTimers();
    this.refreshAttempts.clear();
    await this.cacheManager.clear();
  }

  /**
   * Refresh a key immediately
   */
  async refresh(key: K): Promise<void> {
    const fullKey = this.buildKey(key);
    const cacheOptions = { ...this.options };

    try {
      await this.loadAndCache(key, fullKey, cacheOptions);
      this.logger.debug('Successfully refreshed cache key', { key });
    } catch (error) {
      this.logger.error('Failed to refresh cache key', { key, error }, this.toError(error));
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    this.clearAllRefreshTimers();
    this.refreshAttempts.clear();
    await this.cacheManager.disconnect();
  }

  private buildKey(key: K): string {
    return typeof key === 'string' ? key : JSON.stringify(key);
  }

  private toError(error: unknown): Error | undefined {
    return error instanceof Error ? error : undefined;
  }

  private async loadAndCache(key: K, fullKey: string, options: LoadingCacheOptions<V>): Promise<V> {
    const value = await this.loader.load(key);
    const ttl = options.ttl || this.options.defaultTTL || 3600;

    await this.cacheManager.set(fullKey, value, { ttl });
    this.scheduleRefreshIfNeeded(key, fullKey, options);

    return value;
  }

  private async loadAllAndCache(keys: K[], options: LoadingCacheOptions<V>): Promise<Map<K, V>> {
    const loadedValues = await this.loader.loadAll!(keys);
    const ttl = options.ttl || this.options.defaultTTL || 3600;

    // Cache all loaded values
    for (const [key, value] of loadedValues) {
      const fullKey = this.buildKey(key);
      await this.cacheManager.set(fullKey, value, { ttl });
      this.scheduleRefreshIfNeeded(key, fullKey, options);
    }

    return loadedValues;
  }

  private scheduleRefreshIfNeeded(key: K, fullKey: string, options: LoadingCacheOptions<V>): void {
    const refreshAheadSeconds = options.refreshAheadSeconds || this.options.refreshAheadSeconds;
    if (!refreshAheadSeconds) return;

    this.clearRefreshTimer(key);

    const ttl = options.ttl || this.options.defaultTTL || 3600;
    const refreshDelay = Math.max(0, (ttl - refreshAheadSeconds) * 1000);

    const timer = setTimeout(async () => {
      await this.performRefresh(key, fullKey, options);
    }, refreshDelay);

    this.refreshTimers.set(key, timer);
  }

  private async performRefresh(
    key: K,
    fullKey: string,
    options: LoadingCacheOptions<V>
  ): Promise<void> {
    const maxAttempts = options.maxRefreshAttempts || this.options.maxRefreshAttempts || 3;
    const currentAttempts = this.refreshAttempts.get(key) || 0;

    if (currentAttempts >= maxAttempts) {
      this.logger.warn('Max refresh attempts exceeded', { key, attempts: currentAttempts });
      return;
    }

    this.refreshAttempts.set(key, currentAttempts + 1);

    try {
      if (options.asyncRefresh) {
        // Async refresh - don't wait for completion
        this.loader
          .load(key)
          .then(async (value) => {
            const ttl = options.ttl || this.options.defaultTTL || 3600;
            await this.cacheManager.set(fullKey, value, { ttl });
            this.refreshAttempts.delete(key);
            this.logger.debug('Async refresh completed', { key });
          })
          .catch((error) => {
            this.logger.error('Async refresh failed', { key, error }, this.toError(error));
            // Schedule retry with backoff
            this.scheduleRetryRefresh(key, fullKey, options, currentAttempts + 1);
          });
      } else {
        // Sync refresh
        const value = await this.loader.load(key);
        const ttl = options.ttl || this.options.defaultTTL || 3600;
        await this.cacheManager.set(fullKey, value, { ttl });
        this.refreshAttempts.delete(key);
        this.logger.debug('Sync refresh completed', { key });
      }
    } catch (error) {
      this.logger.error('Refresh failed', { key, error }, this.toError(error));
      // Schedule retry with backoff
      this.scheduleRetryRefresh(key, fullKey, options, currentAttempts + 1);
    }
  }

  private scheduleRetryRefresh(
    key: K,
    fullKey: string,
    options: LoadingCacheOptions<V>,
    attemptNumber: number
  ): void {
    const backoffMultiplier =
      options.refreshBackoffMultiplier || this.options.refreshBackoffMultiplier || 2;
    const delay = Math.pow(backoffMultiplier, attemptNumber) * 1000; // Exponential backoff

    const timer = setTimeout(async () => {
      await this.performRefresh(key, fullKey, options);
    }, delay);

    this.refreshTimers.set(key, timer);
  }

  private clearRefreshTimer(key: K): void {
    const timer = this.refreshTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(key);
    }
  }

  private clearAllRefreshTimers(): void {
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
  }
}

/**
 * Factory function to create a LoadingCache
 */
export function createLoadingCache<K, V>(
  cacheManager: CacheManager,
  loader: CacheLoader<K, V>,
  options?: LoadingCache<K, V>['options']
): LoadingCache<K, V> {
  return new LoadingCache(cacheManager, loader, options);
}
