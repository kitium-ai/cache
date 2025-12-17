import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheManager } from '../CacheManager';
import {
  type CacheKeyConfig,
  type ConnectionPoolConfig,
  InvalidationStrategy,
  type RedisConfig,
  type TTLConfig,
} from '../types';

vi.mock('../RedisAdapter');

const redisConfig: RedisConfig = {
  host: 'localhost',
  port: 6379,
};

const poolConfig: ConnectionPoolConfig = {
  maxConnections: 10,
  minConnections: 2,
  idleTimeoutMs: 30_000,
  acquireTimeoutMs: 5_000,
  validationIntervalMs: 10_000,
};

const keyConfig: CacheKeyConfig = {
  prefix: 'test',
  separator: ':',
  namespace: 'cache',
};

const ttlConfig: TTLConfig = {
  defaultTTL: 3600,
  maxTTL: 86_400,
  minTTL: 60,
};

const TEST_KEY = 'test-key';
const TEST_VALUE = 'test-value';

const createCacheManager = (): CacheManager =>
  new CacheManager(redisConfig, poolConfig, keyConfig, ttlConfig);

describe('CacheManager key manager access', () => {
  it('provides access to key manager', () => {
    const cacheManager = createCacheManager();
    const keyManager = cacheManager.getKeyManager();
    expect(keyManager).toBeDefined();

    const key = keyManager.buildKey('user', '123');
    expect(key).toBe('test:cache:user:123');
  });
});

describe('CacheManager adapter access', () => {
  it('provides access to underlying adapter', () => {
    const cacheManager = createCacheManager();
    expect(cacheManager.getAdapter()).toBeDefined();
  });
});

describe('CacheManager TTL configuration', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createCacheManager();
  });

  it('uses default TTL when not specified', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'set');
    await cacheManager.set(TEST_KEY, TEST_VALUE, {});

    const [, , options] = spy.mock.calls[0] ?? [];
    expect(options?.ttl).toBe(ttlConfig.defaultTTL);
  });

  it('respects maximum TTL limit', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'set');
    await cacheManager.set(TEST_KEY, TEST_VALUE, { ttl: 999_999 });

    const [, , options] = spy.mock.calls[0] ?? [];
    expect(options?.ttl).toBeLessThanOrEqual(ttlConfig.maxTTL);
  });

  it('respects minimum TTL limit', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'set');
    await cacheManager.set(TEST_KEY, TEST_VALUE, { ttl: 10 });

    const [, , options] = spy.mock.calls[0] ?? [];
    expect(options?.ttl).toBeGreaterThanOrEqual(ttlConfig.minTTL);
  });

  it('accepts valid TTL within bounds', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'set');
    const customTtl = 1800;
    await cacheManager.set(TEST_KEY, TEST_VALUE, { ttl: customTtl });

    const [, , options] = spy.mock.calls[0] ?? [];
    expect(options?.ttl).toBe(customTtl);
  });
});

describe('CacheManager cache operations', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createCacheManager();
  });

  it('sets cache value', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'set').mockResolvedValue();
    await cacheManager.set('user:123', { name: 'John' });

    const [key] = spy.mock.calls[0] ?? [];
    expect(key).toContain('user:123');
  });

  it('gets cache value', async () => {
    vi.spyOn(cacheManager.getAdapter(), 'get').mockResolvedValue({ name: 'John' });
    const value = await cacheManager.get('user:123');

    expect(value).toEqual({ name: 'John' });
  });

  it('deletes cache key', async () => {
    vi.spyOn(cacheManager.getAdapter(), 'delete').mockResolvedValue(true);
    const isDeleted = await cacheManager.delete('user:123');
    expect(isDeleted).toBe(true);
  });

  it('checks key existence', async () => {
    vi.spyOn(cacheManager.getAdapter(), 'exists').mockResolvedValue(true);
    const hasKey = await cacheManager.exists('user:123');
    expect(hasKey).toBe(true);
  });

  it('clears entire cache', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'clear').mockResolvedValue();
    await cacheManager.clear();
    expect(spy).toHaveBeenCalled();
  });
});

describe('CacheManager getOrSet', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createCacheManager();
  });

  it('returns cached value if it exists', async () => {
    const cachedValue = { id: 1, name: 'Test' };
    vi.spyOn(cacheManager.getAdapter(), 'get').mockResolvedValue(cachedValue);

    const compute = vi.fn().mockResolvedValue({ id: 2, name: 'Computed' });
    const value = await cacheManager.getOrSet(TEST_KEY, compute);

    expect(value).toEqual(cachedValue);
    expect(compute).not.toHaveBeenCalled();
  });

  it('computes and caches if it does not exist', async () => {
    const computedValue = { id: 1, name: 'Test' };
    vi.spyOn(cacheManager.getAdapter(), 'get').mockResolvedValue(null);
    vi.spyOn(cacheManager.getAdapter(), 'set').mockResolvedValue();

    const compute = vi.fn().mockResolvedValue(computedValue);
    const value = await cacheManager.getOrSet(TEST_KEY, compute);

    expect(value).toEqual(computedValue);
    expect(compute).toHaveBeenCalled();
  });
});

describe('CacheManager bulk operations', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createCacheManager();
  });

  it('deletes multiple keys', async () => {
    vi.spyOn(cacheManager.getAdapter(), 'delete').mockResolvedValue(true);
    const count = await cacheManager.deleteMultiple(['key1', 'key2', 'key3']);
    expect(count).toBe(3);
  });

  it('warms up cache with multiple entries', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'set').mockResolvedValue();
    await cacheManager.warmup({
      'user:1': { id: 1, name: 'User 1' },
      'user:2': { id: 2, name: 'User 2' },
    });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('gets keys by pattern', async () => {
    const spy = vi
      .spyOn(cacheManager.getAdapter(), 'getKeys')
      .mockResolvedValue(['test:cache:user:1', 'test:cache:user:2']);

    const keys = await cacheManager.getKeys('user:*');
    expect(keys).toHaveLength(2);
    expect(spy).toHaveBeenCalled();
  });
});

describe('CacheManager invalidation', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createCacheManager();
  });

  it('invalidates by pattern', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'invalidatePattern').mockResolvedValue(5);

    const count = await cacheManager.invalidatePattern('user:*');
    expect(count).toBe(5);
    expect(spy).toHaveBeenCalledWith('user:*');
  });

  it('invalidates by tags', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'invalidateByTags').mockResolvedValue(10);

    const count = await cacheManager.invalidateByTags(['users', 'active']);
    expect(count).toBe(10);
    expect(spy).toHaveBeenCalledWith(['users', 'active']);
  });

  it('registers invalidation listener', async () => {
    const listener = vi.fn();
    cacheManager.onInvalidation(listener);

    vi.spyOn(cacheManager.getAdapter(), 'invalidatePattern').mockResolvedValue(2);

    await cacheManager.invalidatePattern('test:*');

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: InvalidationStrategy.PATTERN })
    );
  });

  it('unregisters invalidation listener', async () => {
    const listener = vi.fn();
    cacheManager.onInvalidation(listener);
    cacheManager.offInvalidation(listener);

    vi.spyOn(cacheManager.getAdapter(), 'invalidatePattern').mockResolvedValue(2);
    await cacheManager.invalidatePattern('test:*');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('CacheManager health and statistics', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createCacheManager();
  });

  it('performs health check', async () => {
    vi.spyOn(cacheManager.getAdapter(), 'healthCheck').mockResolvedValue(true);
    const isHealthy = await cacheManager.healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('gets cache statistics', async () => {
    const mockStats = {
      hits: 100,
      misses: 20,
      evictions: 5,
      sizeBytes: 10_000,
      itemCount: 50,
      hitRate: 83.33,
      lastUpdated: Date.now(),
    };

    const spy = vi.spyOn(cacheManager.getAdapter(), 'getStats').mockResolvedValue(mockStats);
    const stats = await cacheManager.getStats();

    expect(stats).toEqual(mockStats);
    expect(spy).toHaveBeenCalled();
  });
});

describe('CacheManager connection lifecycle', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createCacheManager();
  });

  it('connects', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'connect').mockResolvedValue();
    await cacheManager.connect();
    expect(spy).toHaveBeenCalled();
  });

  it('disconnects', async () => {
    const spy = vi.spyOn(cacheManager.getAdapter(), 'disconnect').mockResolvedValue();
    await cacheManager.disconnect();
    expect(spy).toHaveBeenCalled();
  });
});
