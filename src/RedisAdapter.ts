/**
 * Redis Cache Adapter
 * Implements the ICacheAdapter interface using Redis backend
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
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
import { CacheErrorFactory } from './infrastructure/error/CacheErrorFactory';
import { ConnectionHelper } from './infrastructure/connection/ConnectionHelper';
import { CacheStatsManager } from './core/services/CacheStatsManager';

export class RedisAdapter implements ICacheAdapter {
  private pool: RedisConnectionPool;
  private keyManager: CacheKeyManager;
  private statsManager: CacheStatsManager;
  private errorFactory: CacheErrorFactory;
  private connectionHelper: ConnectionHelper;
  private defaultTTL: number;
  private isConnected: boolean = false;
  private redisConfig: RedisConfig;
  private commandTimeoutMs?: number;
  private instrumentation?: InstrumentationHooks;
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
    if (redisConfig.encryptionKey !== undefined) {
      this.encryptionKey = createHash('sha256').update(redisConfig.encryptionKey).digest();
    }

    // Initialize new services
    this.statsManager = new CacheStatsManager(instrumentation);
    this.errorFactory = new CacheErrorFactory(this.logger);
    this.connectionHelper = new ConnectionHelper(this.pool);
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
      throw this.errorFactory.connectionFailed('connect', error);
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
      throw this.errorFactory.connectionFailed('disconnect', error);
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
      this.statsManager.recordMiss();
      return null;
    }

    try {
      const value = await this.connectionHelper.withConnection(
        async (client): Promise<string | null> => {
          return await this.runCommand('get', () => client.get(key));
        }
      );

      if (value) {
        this.statsManager.recordHit();
        return this.decodeValue<T>(value as string);
      } else {
        this.statsManager.recordMiss();
        return null;
      }
    } catch (error) {
      this.statsManager.recordMiss();
      throw this.errorFactory.operationFailed('get', key, error);
    } finally {
      this.statsManager.updateAndNotify();
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    if (!this.keyManager.isValidKey(key)) {
      throw this.errorFactory.validationFailed(`Invalid cache key: ${key}`);
    }

    try {
      await this.connectionHelper.withConnection(async (client) => {
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

        this.statsManager.recordSet();
      });
      this.statsManager.updateAndNotify();
    } catch (error) {
      throw this.errorFactory.operationFailed('set', key, error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.connectionHelper.withConnection(async (client): Promise<number> => {
        return await this.runCommand('del', () => client.del(key));
      });

      if (result > 0) {
        this.keyManager.unregisterKey(key);
        this.statsManager.recordDelete();
        this.statsManager.recordEvictions(1);
        this.statsManager.updateAndNotify();
        return true;
      }
      return false;
    } catch (error) {
      throw this.errorFactory.operationFailed('delete', key, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.connectionHelper.withConnection(async (client): Promise<number> => {
        return await this.runCommand('exists', () => client.exists(key));
      });
      return result > 0;
    } catch (error) {
      throw this.errorFactory.operationFailed('exists', key, error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.connectionHelper.withConnection(async (client) => {
        // Get all keys with our prefix/namespace
        const pattern = this.keyManager.buildPattern('*');
        const keys = await this.scanKeys(client, pattern);

        if (keys.length > 0) {
          await this.runCommand('del', () => client.del(keys));
          this.statsManager.recordEvictions(keys.length);
        }

        this.keyManager.clearTags();
      });
      this.statsManager.updateAndNotify();
    } catch (error) {
      throw this.errorFactory.operationFailed('clear', undefined, error);
    }
  }

  async getKeys(pattern?: string): Promise<string[]> {
    try {
      return await this.connectionHelper.withConnection(async (client) => {
        const searchPattern = pattern
          ? this.keyManager.buildPattern(pattern)
          : this.keyManager.buildPattern('*');
        return await this.scanKeys(client, searchPattern);
      });
    } catch (error) {
      throw this.errorFactory.operationFailed('getKeys', undefined, error);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keysCount = await this.connectionHelper.withConnection(async (client) => {
        const searchPattern = this.keyManager.buildPattern(pattern);
        const keys = await this.scanKeys(client, searchPattern);

        if (keys.length > 0) {
          await this.runCommand('del', () => client.del(keys));
          this.statsManager.recordEvictions(keys.length);
        }

        return keys.length;
      });
      this.statsManager.updateAndNotify();
      return keysCount;
    } catch (error) {
      throw this.errorFactory.operationFailed('invalidatePattern', undefined, error);
    }
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      const keysCount = await this.connectionHelper.withConnection(async (client) => {
        const keysToDelete = new Set<string>();

        for (const tag of tags) {
          const tagKey = `tag:${tag}`;
          const keys = (await this.runCommand('sMembers', () =>
            client.sMembers(tagKey)
          )) as string[];
          keys.forEach((key: string) => keysToDelete.add(key));
          await this.runCommand('del', () => client.del(tagKey));
        }

        if (keysToDelete.size > 0) {
          const keyArray = Array.from(keysToDelete);
          await this.runCommand('del', () => client.del(keyArray));
          this.statsManager.recordEvictions(keyArray.length);
        }

        return keysToDelete.size;
      });
      this.statsManager.updateAndNotify();
      return keysCount;
    } catch (error) {
      throw this.errorFactory.operationFailed('invalidateByTags', undefined, error);
    }
  }

  async getStats(): Promise<CacheStats> {
    return this.statsManager.snapshot();
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

    throw this.errorFactory.retryExhausted(lastError as Error);
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    if (!this.commandTimeoutMs) {
      return promise;
    }

    try {
      return await timeout(promise, this.commandTimeoutMs, 'Redis command timed out');
    } catch (error) {
      throw this.errorFactory.commandTimeout(error as Error);
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
        const tags = result.keys as string[];
        for (const tagKey of tags) {
          const keys = (await this.runCommand('sMembers', () =>
            client.sMembers(tagKey)
          )) as string[];
          const tag = tagKey.replace(/^tag:/, '');
          keys.forEach((key: string) => this.keyManager.registerKeyWithTags(key, [tag]));
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
