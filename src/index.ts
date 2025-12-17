/**
 * @kitiumai/cache - Enterprise-ready Redis abstraction layer
 *
 * A robust caching solution with:
 * - Redis connection pooling
 * - Advanced cache key management
 * - Flexible TTL configuration
 * - Multiple invalidation strategies
 * - Pluggable eviction policies (FIFO, LRU, LFU)
 * - Compression and encryption support
 * - Type-safe operations
 */

// Core classes
export { CacheManager } from './CacheManager';
export { CacheKeyManager } from './CacheKeyManager';
export { RedisAdapter } from './RedisAdapter';
export { RedisConnectionPool } from './RedisConnectionPool';
export { InMemoryCache } from './InMemoryCache';

// Infrastructure services
export { CacheErrorFactory } from './infrastructure/error/CacheErrorFactory';
export { ConnectionHelper } from './infrastructure/connection/ConnectionHelper';
export { CacheStatsManager } from './core/services/CacheStatsManager';

// Eviction strategies
export type { IEvictionStrategy } from './core/strategies/IEvictionStrategy';
export { FIFOEvictionStrategy } from './core/strategies/FIFOEvictionStrategy';
export { LRUEvictionStrategy } from './core/strategies/LRUEvictionStrategy';
export { LFUEvictionStrategy } from './core/strategies/LFUEvictionStrategy';

// Value encoders
export type { IValueEncoder } from './core/strategies/IValueEncoder';
export { DefaultValueEncoder } from './core/strategies/DefaultValueEncoder';
export { NoOpValueEncoder } from './core/strategies/NoOpValueEncoder';

// Types and interfaces
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
  type ICacheOperations,
  type ICacheInvalidation,
  type ICacheMetrics,
  type ICacheLifecycle,
  type ICacheManager,
  type MemoryCacheConfig,
  type InstrumentationHooks,
} from './types';
