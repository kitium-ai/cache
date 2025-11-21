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

export type {
  InvalidationStrategy,
  TTLConfig,
  CacheKeyConfig,
  ConnectionPoolConfig,
  RedisConfig,
  CacheOptions,
  CacheStats,
  InvalidationEvent,
  ICacheAdapter,
  ICacheManager,
} from './types';

export { InvalidationStrategy } from './types';
