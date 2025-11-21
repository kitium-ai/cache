/**
 * Redis Cache Adapter
 * Implements the ICacheAdapter interface using Redis backend
 */

import { RedisClientType } from 'redis';
import { CacheOptions, CacheStats, ICacheAdapter, InvalidationStrategy, RedisConfig } from './types';
import { RedisConnectionPool } from './RedisConnectionPool';
import { CacheKeyManager } from './CacheKeyManager';

export class RedisAdapter implements ICacheAdapter {
  private pool: RedisConnectionPool;
  private keyManager: CacheKeyManager;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sizeBytes: 0,
    itemCount: 0,
    hitRate: 0,
    lastUpdated: Date.now(),
  };
  private defaultTTL: number;
  private isConnected: boolean = false;

  constructor(
    redisConfig: RedisConfig,
    poolConfig: any,
    keyManager: CacheKeyManager,
    defaultTTL: number = 3600,
  ) {
    this.pool = new RedisConnectionPool(redisConfig, poolConfig);
    this.keyManager = keyManager;
    this.defaultTTL = defaultTTL;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.pool.initialize();
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.pool.drain();
      this.isConnected = false;
    } catch (error) {
      throw new Error(`Failed to disconnect from Redis: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isConnected(): boolean {
    return this.isConnected;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.getConnection();
      try {
        const result = await client.ping();
        return result === 'PONG';
      } finally {
        this.pool.releaseConnection(client);
      }
    } catch {
      return false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.keyManager.isValidKey(key)) {
      this.stats.misses++;
      return null;
    }

    const client = await this.pool.getConnection();
    try {
      const value = await client.get(key);

      if (value) {
        this.stats.hits++;
        try {
          return JSON.parse(value) as T;
        } catch {
          // If not JSON, return as string
          return value as unknown as T;
        }
      } else {
        this.stats.misses++;
        return null;
      }
    } catch (error) {
      this.stats.misses++;
      throw new Error(`Failed to get key ${key}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
      this.updateStats();
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    if (!this.keyManager.isValidKey(key)) {
      throw new Error(`Invalid cache key: ${key}`);
    }

    const client = await this.pool.getConnection();
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const ttl = options?.ttl ?? this.defaultTTL;

      if (ttl > 0) {
        await client.setEx(key, ttl, serialized);
      } else {
        await client.set(key, serialized);
      }

      // Register key with tags if provided
      if (options?.tags && options.tags.length > 0) {
        this.keyManager.registerKeyWithTags(key, options.tags);

        // Store tags in Redis for persistence
        for (const tag of options.tags) {
          const tagKey = `tag:${tag}`;
          await client.sAdd(tagKey, key);
          // Set TTL on tag sets
          if (ttl > 0) {
            await client.expire(tagKey, ttl);
          }
        }
      }

      this.stats.itemCount++;
      this.updateStats();
    } catch (error) {
      throw new Error(`Failed to set key ${key}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async delete(key: string): Promise<boolean> {
    const client = await this.pool.getConnection();
    try {
      const result = await client.del(key);
      if (result > 0) {
        this.keyManager.unregisterKey(key);
        this.stats.itemCount--;
        this.stats.evictions++;
        this.updateStats();
        return true;
      }
      return false;
    } catch (error) {
      throw new Error(`Failed to delete key ${key}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.pool.getConnection();
    try {
      const result = await client.exists(key);
      return result > 0;
    } catch (error) {
      throw new Error(`Failed to check key existence: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async clear(): Promise<void> {
    const client = await this.pool.getConnection();
    try {
      // Get all keys with our prefix/namespace
      const pattern = this.keyManager.buildPattern('*');
      const keys = await client.keys(pattern);

      if (keys.length > 0) {
        await client.del(keys);
        this.stats.evictions += keys.length;
        this.stats.itemCount = 0;
      }

      this.keyManager.clearTags();
      this.updateStats();
    } catch (error) {
      throw new Error(`Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async getKeys(pattern?: string): Promise<string[]> {
    const client = await this.pool.getConnection();
    try {
      const searchPattern = pattern ? this.keyManager.buildPattern(pattern) : this.keyManager.buildPattern('*');
      const keys = await client.keys(searchPattern);
      return keys;
    } catch (error) {
      throw new Error(`Failed to get keys: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    const client = await this.pool.getConnection();
    try {
      const searchPattern = this.keyManager.buildPattern(pattern);
      const keys = await client.keys(searchPattern);

      if (keys.length > 0) {
        await client.del(keys);
        this.stats.evictions += keys.length;
        this.stats.itemCount -= keys.length;
        this.updateStats();
      }

      return keys.length;
    } catch (error) {
      throw new Error(`Failed to invalidate pattern: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    const client = await this.pool.getConnection();
    try {
      const keysToDelete = new Set<string>();

      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await client.sMembers(tagKey);
        keys.forEach(key => keysToDelete.add(key));
        await client.del(tagKey);
      }

      if (keysToDelete.size > 0) {
        const keyArray = Array.from(keysToDelete);
        await client.del(keyArray);
        this.stats.evictions += keyArray.length;
        this.stats.itemCount -= keyArray.length;
        this.updateStats();
      }

      return keysToDelete.size;
    } catch (error) {
      throw new Error(`Failed to invalidate by tags: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async getStats(): Promise<CacheStats> {
    return { ...this.stats };
  }

  /**
   * Private: Update statistics
   */
  private updateStats(): void {
    this.stats.hitRate =
      this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
        : 0;
    this.stats.lastUpdated = Date.now();
  }
}
