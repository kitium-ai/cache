/**
 * Redis Cache Adapter
 * Implements the ICacheAdapter interface using Redis backend
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { InternalError, toKitiumError } from '@kitiumai/error';
import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';
import { sleep, timeout } from '@kitiumai/utils-ts';
import {
  CacheOptions,
  CacheStats,
  ICacheAdapter,
  InstrumentationHooks,
  RedisConfig,
} from './types';
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
  private redisConfig: RedisConfig;
  private commandTimeoutMs?: number;
  private instrumentation?: InstrumentationHooks;
  private statsPersistKey: string;
  private encryptionKey?: Buffer;
  private logger: ReturnType<typeof getLogger>;

  constructor(
    redisConfig: RedisConfig,
    poolConfig: any,
    keyManager: CacheKeyManager,
    defaultTTL: number = 3600,
    instrumentation?: InstrumentationHooks
  ) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'redis-adapter' })
        : baseLogger;
    this.redisConfig = redisConfig;
    if (redisConfig.commandTimeoutMs !== undefined) {
      this.commandTimeoutMs = redisConfig.commandTimeoutMs;
    }
    this.pool = new RedisConnectionPool(redisConfig, poolConfig);
    this.keyManager = keyManager;
    this.defaultTTL = defaultTTL;
    if (instrumentation !== undefined) {
      this.instrumentation = instrumentation;
    }
    this.statsPersistKey = this.keyManager.buildNamespacedKey('meta', 'stats');
    if (redisConfig.encryptionKey !== undefined) {
      this.encryptionKey = createHash('sha256').update(redisConfig.encryptionKey).digest();
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.pool.initialize();
      this.isConnected = true;
      await this.reconcileTags();
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/redis_connection_failed',
        message: 'Failed to connect to Redis',
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error('Failed to connect to Redis', kitiumError);
      throw kitiumError;
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
      const kitiumError = toKitiumError(error, {
        code: 'cache/redis_disconnect_failed',
        message: 'Failed to disconnect from Redis',
        severity: 'error',
        kind: 'dependency',
        retryable: false,
        source: '@kitiumai/cache',
      });
      this.logger.error('Failed to disconnect from Redis', kitiumError);
      throw kitiumError;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.getConnection();
      try {
        const result = await this.runCommand('ping', () => client.ping());
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
      const value = await this.runCommand('get', () => client.get(key));

      if (value) {
        this.stats.hits++;
        return this.decodeValue<T>(value);
      } else {
        this.stats.misses++;
        return null;
      }
    } catch (error) {
      this.stats.misses++;
      const kitiumError = toKitiumError(error, {
        code: 'cache/get_failed',
        message: `Failed to get key ${key}`,
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error(`Failed to get key ${key}`, kitiumError);
      throw kitiumError;
    } finally {
      this.pool.releaseConnection(client);
      this.updateStats();
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    if (!this.keyManager.isValidKey(key)) {
      throw new InternalError({
        code: 'cache/invalid_key',
        message: `Invalid cache key: ${key}`,
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: '@kitiumai/cache',
      });
    }

    const client = await this.pool.getConnection();
    try {
      const serialized = this.encodeValue(value, options);
      const ttl = options?.ttl ?? this.defaultTTL;

      if (ttl > 0) {
        await this.runCommand('setEx', () => client.setEx(key, ttl, serialized));
      } else {
        await this.runCommand('set', () => client.set(key, serialized));
      }

      // Register key with tags if provided
      if (options?.tags && options.tags.length > 0) {
        this.keyManager.registerKeyWithTags(key, options.tags);

        // Store tags in Redis for persistence
        for (const tag of options.tags) {
          const tagKey = `tag:${tag}`;
          await this.runCommand('sAdd', () => client.sAdd(tagKey, key));
          // Set TTL on tag sets
          if (ttl > 0) {
            await this.runCommand('expire', () => client.expire(tagKey, ttl));
          }
        }
      }

      this.stats.itemCount++;
      this.updateStats();
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/set_failed',
        message: `Failed to set key ${key}`,
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error(`Failed to set key ${key}`, kitiumError);
      throw kitiumError;
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async delete(key: string): Promise<boolean> {
    const client = await this.pool.getConnection();
    try {
      const result = await this.runCommand('del', () => client.del(key));
      if (result > 0) {
        this.keyManager.unregisterKey(key);
        this.stats.itemCount--;
        this.stats.evictions++;
        this.updateStats();
        return true;
      }
      return false;
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/delete_failed',
        message: `Failed to delete key ${key}`,
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error(`Failed to delete key ${key}`, kitiumError);
      throw kitiumError;
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.pool.getConnection();
    try {
      const result = await this.runCommand('exists', () => client.exists(key));
      return result > 0;
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/exists_failed',
        message: 'Failed to check key existence',
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error('Failed to check key existence', kitiumError);
      throw kitiumError;
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async clear(): Promise<void> {
    const client = await this.pool.getConnection();
    try {
      // Get all keys with our prefix/namespace
      const pattern = this.keyManager.buildPattern('*');
      const keys = await this.scanKeys(client, pattern);

      if (keys.length > 0) {
        await this.runCommand('del', () => client.del(keys));
        this.stats.evictions += keys.length;
        this.stats.itemCount = 0;
      }

      this.keyManager.clearTags();
      this.updateStats();
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/clear_failed',
        message: 'Failed to clear cache',
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error('Failed to clear cache', kitiumError);
      throw kitiumError;
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async getKeys(pattern?: string): Promise<string[]> {
    const client = await this.pool.getConnection();
    try {
      const searchPattern = pattern
        ? this.keyManager.buildPattern(pattern)
        : this.keyManager.buildPattern('*');
      const keys = await this.scanKeys(client, searchPattern);
      return keys;
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/get_keys_failed',
        message: 'Failed to get keys',
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error('Failed to get keys', kitiumError);
      throw kitiumError;
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    const client = await this.pool.getConnection();
    try {
      const searchPattern = this.keyManager.buildPattern(pattern);
      const keys = await this.scanKeys(client, searchPattern);

      if (keys.length > 0) {
        await this.runCommand('del', () => client.del(keys));
        this.stats.evictions += keys.length;
        this.stats.itemCount -= keys.length;
        this.updateStats();
      }

      return keys.length;
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/invalidate_pattern_failed',
        message: 'Failed to invalidate pattern',
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error('Failed to invalidate pattern', kitiumError);
      throw kitiumError;
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
        const keys = await this.runCommand('sMembers', () => client.sMembers(tagKey));
        keys.forEach((key) => keysToDelete.add(key));
        await this.runCommand('del', () => client.del(tagKey));
      }

      if (keysToDelete.size > 0) {
        const keyArray = Array.from(keysToDelete);
        await this.runCommand('del', () => client.del(keyArray));
        this.stats.evictions += keyArray.length;
        this.stats.itemCount -= keyArray.length;
        this.updateStats();
      }

      return keysToDelete.size;
    } catch (error) {
      const kitiumError = toKitiumError(error, {
        code: 'cache/invalidate_tags_failed',
        message: 'Failed to invalidate by tags',
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
      this.logger.error('Failed to invalidate by tags', kitiumError);
      throw kitiumError;
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
    this.instrumentation?.onStats?.({ ...this.stats });
    void this.persistStats();
  }

  private async persistStats(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    try {
      const client = await this.pool.getConnection();
      await this.runCommand('set', () =>
        client.set(this.statsPersistKey, JSON.stringify(this.stats), {
          EX: 600, // eslint-disable-line @typescript-eslint/naming-convention
        })
      );
    } catch (error) {
      this.instrumentation?.onError?.(error as Error);
    }
  }

  private async runCommand<T>(command: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await this.executeWithRetry(() => this.withTimeout(fn()));
      this.instrumentation?.onCommand?.(command, Date.now() - start, true);
      return result;
    } catch (error) {
      this.instrumentation?.onCommand?.(command, Date.now() - start, false);
      this.instrumentation?.onError?.(error as Error);
      throw error;
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const policy = this.redisConfig.retryPolicy ?? { maxAttempts: 1, backoffMs: 0, jitterMs: 0 };
    
    // Use manual retry logic since utils-ts retry has different interface
    let attempt = 0;
    let lastError: unknown;

    while (attempt < policy.maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt >= policy.maxAttempts) {
          break;
        }
        const jitter = policy.jitterMs ? Math.floor(Math.random() * policy.jitterMs) : 0;
        const delay = policy.backoffMs * attempt + jitter;
        await sleep(delay);
      }
    }

    throw toKitiumError(lastError, {
      code: 'cache/retry_exhausted',
      message: 'Redis operation failed after retries',
      severity: 'error',
      kind: 'dependency',
      retryable: false,
      source: '@kitiumai/cache',
    });
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    if (!this.commandTimeoutMs) {
      return promise;
    }

    try {
      return await timeout(promise, this.commandTimeoutMs, 'Redis command timed out');
    } catch (error) {
      throw toKitiumError(error, {
        code: 'cache/command_timeout',
        message: 'Redis command timed out',
        severity: 'error',
        kind: 'dependency',
        retryable: true,
        source: '@kitiumai/cache',
      });
    }
  }

  private encodeValue<T>(value: T, options?: CacheOptions): string {
    const base = typeof value === 'string' ? value : JSON.stringify(value);
    const compress = options?.compress === true;
    const encrypt = options?.encrypt === true && this.encryptionKey;
    let payload: string | Buffer = base;

    if (compress) {
      payload = gzipSync(Buffer.from(String(base)));
    }

    if (encrypt) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.encryptionKey as Buffer, iv);
      const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
      const authTag = cipher.getAuthTag();
      payload = Buffer.concat([iv, authTag, encrypted]);
    }

    return JSON.stringify({
      compressed: compress,
      encrypted: Boolean(encrypt),
      payload: Buffer.isBuffer(payload) ? payload.toString('base64') : String(payload),
    });
  }

  private decodeValue<T>(stored: string): T | null {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.payload !== undefined) {
        let buffer = Buffer.from(parsed.payload, 'base64');
        if (parsed.encrypted && this.encryptionKey) {
          const iv = buffer.subarray(0, 12);
          const authTag = buffer.subarray(12, 28);
          const data = buffer.subarray(28);
          const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
          decipher.setAuthTag(authTag);
          buffer = Buffer.concat([decipher.update(data), decipher.final()]);
        }

        if (parsed.compressed) {
          buffer = gunzipSync(buffer);
        }

        const text = buffer.toString('utf8');
        return JSON.parse(text) as T;
      }

      return JSON.parse(stored) as T;
    } catch {
      return stored as unknown as T;
    }
  }

  private async reconcileTags(): Promise<void> {
    const client = await this.pool.getConnection();
    try {
      let cursor = 0;
      do {
        /* eslint-disable @typescript-eslint/naming-convention */
        const result = (await this.runCommand('scan', () =>
          client.scan(cursor, {
            MATCH: 'tag:*',
            COUNT: 100,
          })
        )) as { cursor: number; keys: string[] };
        /* eslint-enable @typescript-eslint/naming-convention */
        cursor = result.cursor;
        const tags = result.keys;
        for (const tagKey of tags) {
          const keys = await this.runCommand('sMembers', () => client.sMembers(tagKey));
          const tag = tagKey.replace(/^tag:/, '');
          keys.forEach((key) => this.keyManager.registerKeyWithTags(key, [tag]));
        }
      } while (cursor !== 0);
    } catch (error) {
      this.instrumentation?.onError?.(error as Error);
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  private async scanKeys(client: any, pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = 0;
    do {
      const result = (await this.runCommand('scan', () =>
        // eslint-disable-next-line @typescript-eslint/naming-convention
        client.scan(cursor, { MATCH: pattern, COUNT: 200 })
      )) as { cursor: number; keys: string[] };
      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== 0);
    return keys;
  }
}
