/**
 * @kitiumai/cache - Enterprise-ready Redis abstraction layer
 *
 * A robust caching solution with:
 * - Redis connection pooling
 * - Advanced cache key management
 * - Flexible TTL configuration
 * - Multiple invalidation strategies
 * - Pluggable eviction policies (FIFO, LRU, LFU, Windowed TinyLFU)
 * - Compression and encryption support
 * - Type-safe operations
 * - Loading cache with refresh-ahead
 * - Distributed tracing and observability
 * - Circuit breaker patterns
 * - Redis clustering support
 * - Multi-tenancy with resource isolation
 * - Performance profiling and optimization
 * - Framework adapters (Express, Fastify, NestJS)
 * - Multi-region replication
 * - Redis modules support (RediSearch, RedisJSON, etc.)
 * - Persistence and backup management
 * - Chaos engineering tools
 */

// Core classes
export { CacheManager } from './CacheManager';
export { CacheKeyManager } from './CacheKeyManager';
export { RedisAdapter } from './RedisAdapter';
export { RedisConnectionPool } from './RedisConnectionPool';
export { InMemoryCache } from './InMemoryCache';

// Advanced caching features
export { LoadingCache } from './LoadingCache';
export { WindowedTinyLFUEvictionStrategy } from './core/strategies/WindowedTinyLFUEvictionStrategy';
export { CacheTracingManager } from './infrastructure/tracing/CacheTracingManager';
export { CircuitBreaker } from './infrastructure/resilience/CircuitBreaker';
export { RedisClusterManager } from './cluster/RedisClusterManager';
export { MultiTenantCacheManager } from './core/services/MultiTenantCacheManager';
export { CachePerformanceProfiler } from './core/services/CachePerformanceProfiler';
export {
  createExpressCacheMiddleware,
  createFastifyCachePlugin,
  createNestJSCacheInterceptor,
  createHTTPCacheAdapter,
  Cacheable,
  CacheEvict,
} from './infrastructure/adapters/FrameworkAdapters';
export { MultiRegionCacheManager } from './cluster/MultiRegionCacheManager';
export { PersistenceManager, ChaosOrchestrator } from './persistence/PersistenceManager';

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
  // Advanced feature types
  type LoadingCacheOptions,
  type CacheLoader,
  type EvictionWindow,
  type TracingConfig,
  type CircuitBreakerConfig,
  type ClusterConfig,
  type TenantConfig,
  type PerformanceProfile,
  type FrameworkAdapterConfig,
  type MultiRegionConfig,
  type RedisModuleConfig,
  type BackupConfig,
  type BackupMetadata,
  type RestoreOptions,
  type ChaosConfig,
  type ChaosEvent,
} from './types';
