/**
 * @kitiumai/cache - Enterprise-ready Redis abstraction layer
 *
 * A robust caching solution with:
 * - Redis connection pooling
 * - Advanced cache key management
 * - Flexible TTL configuration
 * - Multiple invalidation strategies
 * - Type-safe operations
 */

export { CacheManager } from './CacheManager';
export { CacheKeyManager } from './CacheKeyManager';
export { RedisAdapter } from './RedisAdapter';
export { RedisConnectionPool } from './RedisConnectionPool';
export { InMemoryCache } from './InMemoryCache';

export {
  InvalidationStrategy,
  type TTLConfig,
  type CacheKeyConfig,
  type ConnectionPoolConfig,
  type RedisConfig,
  type CacheOptions,
  type CacheStats,
  type InvalidationEvent,
  type ICacheAdapter,
  type ICacheManager,
  type MemoryCacheConfig,
  type InstrumentationHooks,
} from './types';
