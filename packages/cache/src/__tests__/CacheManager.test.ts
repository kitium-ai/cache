import { CacheManager } from '../CacheManager';
import { InvalidationStrategy, RedisConfig, ConnectionPoolConfig, CacheKeyConfig, TTLConfig } from '../types';

// Mock the Redis adapter
jest.mock('../RedisAdapter');

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  const redisConfig: RedisConfig = {
    host: 'localhost',
    port: 6379,
  };

  const poolConfig: ConnectionPoolConfig = {
    maxConnections: 10,
    minConnections: 2,
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 5000,
    validationIntervalMs: 10000,
  };

  const keyConfig: CacheKeyConfig = {
    prefix: 'test',
    separator: ':',
    namespace: 'cache',
  };

  const ttlConfig: TTLConfig = {
    defaultTTL: 3600,
    maxTTL: 86400,
    minTTL: 60,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = new CacheManager(redisConfig, poolConfig, keyConfig, ttlConfig);
  });

  describe('Key Management', () => {
    it('should provide access to key manager', () => {
      const keyManager = cacheManager.getKeyManager();
      expect(keyManager).toBeDefined();

      const key = keyManager.buildKey('user', '123');
      expect(key).toBe('test:cache:user:123');
    });
  });

  describe('Adapter Access', () => {
    it('should provide access to underlying adapter', () => {
      const adapter = cacheManager.getAdapter();
      expect(adapter).toBeDefined();
    });
  });

  describe('TTL Configuration', () => {
    it('should use default TTL when not specified', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'set');

      await cacheManager.set('test-key', 'test-value', {});

      expect(spy).toHaveBeenCalled();
      const [, , options] = spy.mock.calls[0];
      expect(options?.ttl).toBe(ttlConfig.defaultTTL);
    });

    it('should respect maximum TTL limit', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'set');

      await cacheManager.set('test-key', 'test-value', { ttl: 999999 });

      const [, , options] = spy.mock.calls[0];
      expect(options?.ttl).toBeLessThanOrEqual(ttlConfig.maxTTL);
    });

    it('should respect minimum TTL limit', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'set');

      await cacheManager.set('test-key', 'test-value', { ttl: 10 });

      const [, , options] = spy.mock.calls[0];
      expect(options?.ttl).toBeGreaterThanOrEqual(ttlConfig.minTTL);
    });

    it('should accept valid TTL within bounds', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'set');
      const customTTL = 1800;

      await cacheManager.set('test-key', 'test-value', { ttl: customTTL });

      const [, , options] = spy.mock.calls[0];
      expect(options?.ttl).toBe(customTTL);
    });
  });

  describe('Cache Operations', () => {
    it('should set cache value', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'set').mockResolvedValue(undefined);

      await cacheManager.set('user:123', { name: 'John' });

      expect(spy).toHaveBeenCalled();
      const [key] = spy.mock.calls[0];
      expect(key).toContain('user:123');
    });

    it('should get cache value', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'get').mockResolvedValue({ name: 'John' });

      const result = await cacheManager.get('user:123');

      expect(spy).toHaveBeenCalled();
      expect(result).toEqual({ name: 'John' });
    });

    it('should delete cache key', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'delete').mockResolvedValue(true);

      const result = await cacheManager.delete('user:123');

      expect(result).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('should check key existence', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'exists').mockResolvedValue(true);

      const result = await cacheManager.exists('user:123');

      expect(result).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('should clear entire cache', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'clear').mockResolvedValue(undefined);

      await cacheManager.clear();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Get or Set Operation', () => {
    it('should return cached value if exists', async () => {
      const mockValue = { id: 1, name: 'Test' };
      jest.spyOn(cacheManager.getAdapter(), 'get').mockResolvedValue(mockValue);

      const fn = jest.fn().mockResolvedValue({ id: 2, name: 'Computed' });
      const result = await cacheManager.getOrSet('test-key', fn);

      expect(result).toEqual(mockValue);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should compute and cache if not exists', async () => {
      const mockValue = { id: 1, name: 'Test' };
      jest.spyOn(cacheManager.getAdapter(), 'get').mockResolvedValue(null);
      jest.spyOn(cacheManager.getAdapter(), 'set').mockResolvedValue(undefined);

      const fn = jest.fn().mockResolvedValue(mockValue);
      const result = await cacheManager.getOrSet('test-key', fn);

      expect(result).toEqual(mockValue);
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('Bulk Operations', () => {
    it('should delete multiple keys', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'delete').mockResolvedValue(true);

      const count = await cacheManager.deleteMultiple(['key1', 'key2', 'key3']);

      expect(count).toBe(3);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should warmup cache with multiple entries', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'set').mockResolvedValue(undefined);

      const data = {
        'user:1': { id: 1, name: 'User 1' },
        'user:2': { id: 2, name: 'User 2' },
      };

      await cacheManager.warmup(data);

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should get keys by pattern', async () => {
      const spy = jest
        .spyOn(cacheManager.getAdapter(), 'getKeys')
        .mockResolvedValue(['test:cache:user:1', 'test:cache:user:2']);

      const keys = await cacheManager.getKeys('user:*');

      expect(keys).toHaveLength(2);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Invalidation', () => {
    it('should invalidate by pattern', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'invalidatePattern').mockResolvedValue(5);

      const count = await cacheManager.invalidatePattern('user:*');

      expect(count).toBe(5);
      expect(spy).toHaveBeenCalledWith('user:*');
    });

    it('should invalidate by tags', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'invalidateByTags').mockResolvedValue(10);

      const count = await cacheManager.invalidateByTags(['users', 'active']);

      expect(count).toBe(10);
      expect(spy).toHaveBeenCalledWith(['users', 'active']);
    });

    it('should register invalidation listener', (done) => {
      const listener = jest.fn();
      cacheManager.onInvalidation(listener);

      // Simulate invalidation
      const event = {
        strategy: InvalidationStrategy.PATTERN,
        keys: ['key1', 'key2'],
        timestamp: Date.now(),
        reason: 'Test',
      };

      cacheManager.getAdapter().invalidatePattern('test:*').then(() => {
        // Listener should be called
        setTimeout(() => {
          done();
        }, 100);
      });
    });

    it('should unregister invalidation listener', () => {
      const listener = jest.fn();
      cacheManager.onInvalidation(listener);
      cacheManager.offInvalidation(listener);

      // Verify listener is removed (would need to check internal state)
    });
  });

  describe('Health and Statistics', () => {
    it('should perform health check', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'healthCheck').mockResolvedValue(true);

      const result = await cacheManager.healthCheck();

      expect(result).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('should get cache statistics', async () => {
      const mockStats = {
        hits: 100,
        misses: 20,
        evictions: 5,
        sizeBytes: 10000,
        itemCount: 50,
        hitRate: 83.33,
        lastUpdated: Date.now(),
      };

      const spy = jest.spyOn(cacheManager.getAdapter(), 'getStats').mockResolvedValue(mockStats);

      const stats = await cacheManager.getStats();

      expect(stats).toEqual(mockStats);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Connection Lifecycle', () => {
    it('should connect', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'connect').mockResolvedValue(undefined);

      await cacheManager.connect();

      expect(spy).toHaveBeenCalled();
    });

    it('should disconnect', async () => {
      const spy = jest.spyOn(cacheManager.getAdapter(), 'disconnect').mockResolvedValue(undefined);

      await cacheManager.disconnect();

      expect(spy).toHaveBeenCalled();
    });
  });
});
