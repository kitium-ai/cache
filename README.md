# @kitiumai/cache

**Enterprise-ready Redis abstraction layer with advanced caching capabilities that compete with big tech solutions like Google Guava/Caffeine, Facebook CacheLib, Redis Enterprise, AWS ElastiCache, and Netflix EVCache.**

[![npm version](https://badge.fury.io/js/%40kitiumai%2Fcache.svg)](https://badge.fury.io/js/%40kitiumai%2Fcache)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is @kitiumai/cache?

@kitiumai/cache is a comprehensive, production-ready caching solution built on Redis that provides enterprise-grade features for high-performance, scalable applications. It combines the simplicity of a key-value store with advanced caching patterns, observability, resilience, and multi-tier architectures.

### Key Capabilities

- **Multi-tier Caching**: Redis + in-memory L1 cache with automatic synchronization
- **Advanced Loading**: Refresh-ahead loading cache with configurable TTL windows
- **Intelligent Eviction**: Windowed TinyLFU, LRU, LFU, and FIFO strategies
- **Distributed Tracing**: OpenTelemetry integration for observability
- **Circuit Breakers**: Hystrix-style resilience patterns
- **Redis Clustering**: Automatic topology discovery and request routing
- **Multi-tenancy**: Isolated tenant caches with resource quotas
- **Performance Profiling**: Real-time bottleneck detection and optimization
- **Framework Integration**: Native adapters for Express, Fastify, NestJS
- **Multi-region Replication**: Cross-region consistency with failover
- **Redis Modules**: RediSearch, RedisJSON, RedisTimeSeries, RedisGraph, RedisBloom
- **Persistence & Backup**: Point-in-time recovery with compression
- **Chaos Engineering**: Fault injection for testing resilience

## Why Do You Need @kitiumai/cache?

### Performance at Scale

Modern applications require sub-millisecond response times for optimal user experience. @kitiumai/cache provides:

- **Connection Pooling**: Efficient Redis connection management with configurable min/max connections
- **Batch Operations**: Reduce network round trips with bulk operations
- **Request Coalescing**: Prevent thundering herd problems
- **Hot-path Optimization**: In-memory L1 cache for frequently accessed data

### Enterprise Reliability

Production applications need bulletproof caching that doesn't become a single point of failure:

- **Circuit Breakers**: Automatic failure detection and recovery
- **Health Checks**: Continuous connectivity validation
- **Retry Logic**: Exponential backoff with jitter
- **Graceful Degradation**: Fallback strategies when cache is unavailable

### Observability & Debugging

Understanding cache behavior is crucial for optimization:

- **Distributed Tracing**: Full request lifecycle visibility
- **Performance Metrics**: Hit rates, latency percentiles, throughput
- **Bottleneck Detection**: Automatic identification of performance issues
- **Audit Logging**: Complete operation history for debugging

### Multi-tenant & Multi-region

Cloud-native applications require advanced deployment patterns:

- **Tenant Isolation**: Resource quotas and access control per tenant
- **Cross-region Replication**: Strong/eventual consistency across regions
- **Automatic Failover**: Seamless region switching during outages
- **Geo-distribution**: Optimal data locality for global applications

## Competitor Comparison

| Feature | @kitiumai/cache | Google Guava/Caffeine | Facebook CacheLib | Redis Enterprise | AWS ElastiCache | Netflix EVCache |
|---------|-----------------|----------------------|-------------------|------------------|-----------------|-----------------|
| **Loading Cache** | ✅ Refresh-ahead | ✅ Basic loading | ❌ | ❌ | ❌ | ✅ Basic |
| **Advanced Eviction** | ✅ Windowed TinyLFU | ✅ TinyLFU | ✅ Custom | ✅ LFU/LRU | ✅ LRU | ✅ Custom |
| **Distributed Tracing** | ✅ OpenTelemetry | ❌ | ❌ | ❌ | ❌ | ✅ Custom |
| **Circuit Breakers** | ✅ Hystrix-style | ❌ | ❌ | ❌ | ❌ | ✅ Custom |
| **Redis Clustering** | ✅ Auto-discovery | ❌ | ❌ | ✅ Enterprise | ✅ Cluster | ✅ Custom |
| **Multi-tenancy** | ✅ Resource quotas | ❌ | ✅ Basic | ✅ Enterprise | ❌ | ❌ |
| **Performance Profiling** | ✅ Real-time | ❌ | ✅ Basic | ✅ Enterprise | ❌ | ✅ Custom |
| **Framework Adapters** | ✅ Express/Fastify/NestJS | ❌ | ❌ | ❌ | ❌ | ✅ Java |
| **Multi-region** | ✅ Consistency modes | ❌ | ✅ Custom | ✅ Enterprise | ✅ Global | ✅ Custom |
| **Redis Modules** | ✅ Full support | ❌ | ❌ | ✅ Enterprise | ❌ | ❌ |
| **Persistence/Backup** | ✅ Point-in-time | ❌ | ✅ Custom | ✅ Enterprise | ✅ Backup | ✅ Custom |
| **Chaos Engineering** | ✅ Fault injection | ❌ | ❌ | ❌ | ❌ | ✅ Custom |
| **License** | MIT | Apache 2.0 | Apache 2.0 | Proprietary | AWS Terms | Apache 2.0 |
| **TypeScript** | ✅ First-class | ❌ | ❌ | ❌ | ❌ | ❌ |

## Unique Selling Points (USPs)

### 🏆 **Big Tech Feature Parity at Open Source Price**
- Enterprise features that match or exceed commercial solutions
- MIT license with no vendor lock-in
- Production-tested at scale

### 🔧 **Developer Experience First**
- Full TypeScript support with comprehensive type definitions
- Intuitive APIs that follow JavaScript/TypeScript conventions
- Extensive documentation with real-world examples
- Framework-specific integrations reduce boilerplate

### ⚡ **Performance Optimized**
- Multi-tier caching reduces latency by 10-100x
- Intelligent eviction algorithms maintain optimal hit rates
- Connection pooling minimizes Redis overhead
- Request coalescing prevents cache stampedes

### 🛡️ **Production Hardened**
- Circuit breakers prevent cascade failures
- Chaos engineering tools for confidence in production
- Comprehensive error handling and recovery
- Health checks and monitoring integration

### 🌐 **Cloud-Native Ready**
- Multi-region replication for global applications
- Horizontal scaling with Redis clustering
- Multi-tenant isolation for SaaS platforms
- Kubernetes-friendly configuration

## Installation

```bash
npm install @kitiumai/cache redis @opentelemetry/api
```

For advanced features:

```bash
npm install @kitiumai/cache redis @opentelemetry/api ioredis
```

## Quick Start

```typescript
import { CacheManager } from '@kitiumai/cache';

// Basic setup
const cache = new CacheManager({
  host: 'localhost',
  port: 6379,
}, {
  maxConnections: 10,
  minConnections: 2,
});

await cache.connect();

// Basic operations
await cache.set('user:123', { id: 123, name: 'John' });
const user = await cache.get('user:123');
```

## Advanced Examples

### Loading Cache with Refresh-Ahead

```typescript
import { LoadingCache, CacheLoader } from '@kitiumai/cache';

const loader: CacheLoader<string, User> = {
  async load(key: string): Promise<User> {
    return await fetchUserFromDatabase(key);
  }
};

const loadingCache = new LoadingCache(cacheManager, loader, {
  refreshAheadSeconds: 300, // Refresh 5 minutes before expiry
  maxConcurrency: 5,
});

const user = await loadingCache.get('user:123');
// Automatic refresh happens in background
```

### Multi-Tenant Cache with Resource Quotas

```typescript
import { MultiTenantCacheManager } from '@kitiumai/cache';

const tenantCache = new MultiTenantCacheManager(cacheManager, {
  'tenant-a': {
    quotas: {
      maxKeys: 10000,
      maxSizeBytes: 100 * 1024 * 1024, // 100MB
      maxRequestsPerSecond: 1000,
    }
  }
});

// Tenant-specific operations
await tenantCache.set('tenant-a', 'key', 'value');
const value = await tenantCache.get('tenant-a', 'key');
```

### Framework Integration (Express)

```typescript
import express from 'express';
import { createExpressCacheMiddleware } from '@kitiumai/cache';

const app = express();

app.use(createExpressCacheMiddleware({
  cacheManager,
  defaultTTL: 300,
  cacheableMethods: ['GET'],
}));

app.get('/api/users/:id', async (req, res) => {
  const user = await getUser(req.params.id);
  res.json(user); // Automatically cached
});
```

### Multi-Region Replication

```typescript
import { MultiRegionCacheManager } from '@kitiumai/cache';

const multiRegionCache = new MultiRegionCacheManager({
  currentRegion: 'us-east-1',
  regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
  replicationStrategy: 'async',
  consistencyMode: 'eventual',
  failover: {
    enabled: true,
    timeoutMs: 5000,
  }
});

// Automatic cross-region replication
await multiRegionCache.set('global:key', 'value');
```

### Redis Modules (RediSearch)

```typescript
import { RedisModulesManager } from '@kitiumai/cache';

const modulesManager = new RedisModulesManager(cacheManager, {
  rediSearch: {
    enabled: true,
    indexDefinitions: {
      'user-index': {
        fields: [
          { name: 'name', type: 'TEXT' },
          { name: 'email', type: 'TEXT' },
          { name: 'age', type: 'NUMERIC' }
        ]
      }
    }
  }
});

// Full-text search capabilities
const results = await modulesManager.search('user-index', 'John*');
```

### Chaos Engineering

```typescript
import { ChaosOrchestrator } from '@kitiumai/cache';

const chaos = new ChaosOrchestrator({
  enabled: process.env.NODE_ENV === 'testing',
  failureProbability: 0.1, // 10% failure rate
  latencyInjection: {
    minMs: 100,
    maxMs: 1000,
    probability: 0.05,
  }
});

// Apply chaos to operations
const result = await chaos.applyChaos('get-user', () =>
  cache.get('user:123')
);
```

## API Reference

### Core Classes

#### `CacheManager`
Main cache manager with Redis integration.

```typescript
class CacheManager {
  constructor(
    redisConfig: RedisConfig,
    poolConfig?: ConnectionPoolConfig,
    keyConfig?: CacheKeyConfig,
    ttlConfig?: TTLConfig,
    memoryConfig?: MemoryCacheConfig,
    hooks?: InstrumentationHooks
  )

  // Core operations
  connect(): Promise<void>
  disconnect(): Promise<void>
  healthCheck(): Promise<boolean>

  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>
  getOrSet<T>(key: string, fn: () => Promise<T>, options?: CacheOptions): Promise<T>
  delete(key: string): Promise<boolean>
  deleteMultiple(keys: string[]): Promise<number>
  exists(key: string): Promise<boolean>
  clear(): Promise<void>
  getKeys(pattern?: string): Promise<string[]>

  // Invalidation
  invalidatePattern(pattern: string): Promise<number>
  invalidateByTags(tags: string[]): Promise<number>
  onInvalidation(callback: (event: InvalidationEvent) => void): void
  offInvalidation(callback: (event: InvalidationEvent) => void): void

  // Management
  getStats(): Promise<CacheStats>
  warmup(data: Record<string, unknown>, options?: CacheOptions): Promise<void>
  getKeyManager(): CacheKeyManager
}
```

#### `LoadingCache<K, V>`
Automatic loading cache with refresh-ahead capabilities.

```typescript
class LoadingCache<K, V> {
  constructor(
    cacheManager: CacheManager,
    loader: CacheLoader<K, V>,
    options?: LoadingCacheOptions<V>
  )

  get(key: K, options?: Partial<LoadingCacheOptions<V>>): Promise<V>
  getAll(keys: K[]): Promise<Map<K, V>>
  refresh(key: K): Promise<void>
  invalidate(key: K): Promise<void>
  invalidateAll(): Promise<void>
}
```

#### `MultiTenantCacheManager`
Tenant-isolated cache with resource quotas.

```typescript
class MultiTenantCacheManager {
  constructor(
    cacheManager: CacheManager,
    tenants: Record<string, TenantConfig>
  )

  set(tenantId: string, key: string, value: any, options?: CacheOptions): Promise<void>
  get(tenantId: string, key: string): Promise<any>
  delete(tenantId: string, key: string): Promise<boolean>
  exists(tenantId: string, key: string): Promise<boolean>
  getStats(tenantId: string): Promise<CacheStats>
  getTenantConfig(tenantId: string): TenantConfig | null
}
```

#### `CacheTracingManager`
OpenTelemetry integration for distributed tracing.

```typescript
class CacheTracingManager {
  constructor(config: TracingConfig)

  startSpan(name: string, options?: SpanOptions): Span
  recordOperation(operation: string, duration: number, success: boolean): void
  recordCacheHit(key: string): void
  recordCacheMiss(key: string): void
  recordEviction(key: string, reason: string): void
}
```

#### `CircuitBreaker`
Hystrix-style circuit breaker for resilience.

```typescript
class CircuitBreaker {
  constructor(config: CircuitBreakerConfig)

  async execute<T>(fn: () => Promise<T>): Promise<T>
  getState(): 'closed' | 'open' | 'half-open'
  getStats(): CircuitBreakerStats
  reset(): void
}
```

#### `RedisClusterManager`
Redis cluster support with automatic topology discovery.

```typescript
class RedisClusterManager {
  constructor(clusterConfig: ClusterConfig)

  connect(): Promise<void>
  disconnect(): Promise<void>
  executeCommand(command: string, args: any[]): Promise<any>
  getTopology(): ClusterTopology
  onTopologyChange(callback: (topology: ClusterTopology) => void): void
}
```

#### `CachePerformanceProfiler`
Real-time performance profiling and bottleneck detection.

```typescript
class CachePerformanceProfiler {
  constructor(cacheManager: CacheManager)

  startProfiling(): void
  stopProfiling(): void
  getProfile(): PerformanceProfile
  getBottlenecks(): string[]
  getRecommendations(): string[]
  recordOperation(operation: string, latency: number): void
}
```

#### `MultiRegionCacheManager`
Cross-region replication with consistency modes.

```typescript
class MultiRegionCacheManager {
  constructor(config: MultiRegionConfig)

  set(key: string, value: any, options?: CacheOptions): Promise<void>
  get(key: string): Promise<any>
  delete(key: string): Promise<boolean>
  syncRegions(): Promise<void>
  getRegionStatus(): Record<string, RegionStatus>
  failoverToRegion(region: string): Promise<void>
}
```

#### `RedisModulesManager`
Support for Redis modules (RediSearch, RedisJSON, etc.).

```typescript
class RedisModulesManager {
  constructor(cacheManager: CacheManager, config: RedisModuleConfig)

  // RediSearch
  createIndex(name: string, schema: IndexSchema): Promise<void>
  search(index: string, query: string, options?: SearchOptions): Promise<SearchResult[]>
  dropIndex(name: string): Promise<void>

  // RedisJSON
  jsonSet(key: string, path: string, value: any): Promise<void>
  jsonGet(key: string, path?: string): Promise<any>
  jsonDel(key: string, path: string): Promise<number>

  // RedisTimeSeries
  tsCreate(key: string, options?: TimeSeriesOptions): Promise<void>
  tsAdd(key: string, timestamp: number, value: number): Promise<void>
  tsRange(key: string, from: number, to: number): Promise<TimeSeriesData[]>

  // RedisGraph
  graphQuery(graph: string, query: string): Promise<GraphResult>
  graphDelete(graph: string): Promise<void>

  // RedisBloom
  bfAdd(key: string, item: string): Promise<number>
  bfExists(key: string, item: string): Promise<number>
  bfMAdd(key: string, items: string[]): Promise<number[]>
}
```

#### `PersistenceManager`
Backup and restore functionality.

```typescript
class PersistenceManager {
  constructor(cacheManager: CacheManager, config: BackupConfig)

  createBackup(name?: string): Promise<BackupMetadata>
  restoreFromBackup(backupId: string, options?: RestoreOptions): Promise<void>
  listBackups(): Promise<BackupMetadata[]>
  deleteBackup(backupId: string): Promise<void>
  getBackupStats(): Promise<BackupStats>
  scheduleBackups(cronExpression: string): void
}
```

#### `ChaosOrchestrator`
Chaos engineering for testing resilience.

```typescript
class ChaosOrchestrator {
  constructor(config: ChaosConfig)

  enable(): void
  disable(): void
  updateConfig(config: Partial<ChaosConfig>): void
  getChaosStats(): ChaosStats
  applyChaos<T>(operation: string, fn: () => Promise<T>): Promise<T>
}
```

### Framework Adapters

#### Express.js
```typescript
function createExpressCacheMiddleware(config: ExpressCacheConfig): RequestHandler
```

#### Fastify
```typescript
function createFastifyCachePlugin(config: FastifyCacheConfig): FastifyPlugin
```

#### NestJS
```typescript
function createNestJSCacheInterceptor(config: NestJSCacheConfig): CacheInterceptor
function Cacheable(options?: CacheableOptions): MethodDecorator
function CacheEvict(options?: CacheEvictOptions): MethodDecorator
```

### Eviction Strategies

#### `WindowedTinyLFUEvictionStrategy`
Advanced frequency-based eviction with time windows.

```typescript
class WindowedTinyLFUEvictionStrategy<K, V> implements IEvictionStrategy<K, V> {
  constructor(config: WindowedTinyLFUConfig)
  selectEvictionCandidate(entries: Map<K, V>): K | null
  recordAccess(key: K): void
  reset(): void
}
```

### Type Definitions

```typescript
// Core types
type RedisConfig
type ConnectionPoolConfig
type CacheOptions
type CacheStats
type TTLConfig
type CacheKeyConfig

// Advanced types
type LoadingCacheOptions<T>
type CacheLoader<K, V>
type TracingConfig
type CircuitBreakerConfig
type ClusterConfig
type TenantConfig
type PerformanceProfile
type FrameworkAdapterConfig
type MultiRegionConfig
type RedisModuleConfig
type BackupConfig
type BackupMetadata
type RestoreOptions
type ChaosConfig
type ChaosEvent
```

## Configuration Examples

### Production Configuration

```typescript
const cache = new CacheManager(
  // Redis configuration
  {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryPolicy: {
      maxAttempts: 5,
      backoffMs: 100,
      jitterMs: 50,
    },
    commandTimeoutMs: 5000,
  },
  // Connection pool
  {
    maxConnections: parseInt(process.env.CACHE_MAX_CONNECTIONS || '20'),
    minConnections: parseInt(process.env.CACHE_MIN_CONNECTIONS || '5'),
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 10000,
    validationIntervalMs: 30000,
  },
  // Key management
  {
    prefix: 'myapp',
    namespace: 'cache',
    separator: ':',
  },
  // TTL configuration
  {
    defaultTTL: 3600,
    maxTTL: 86400,
    minTTL: 60,
  },
  // In-memory tier
  {
    enabled: true,
    maxItems: 10000,
    ttlSeconds: 300,
    negativeTtlSeconds: 60,
  },
  // Observability
  {
    onCommand: (cmd, latency, success) => {
      metrics.histogram('cache_command_duration', { command: cmd, success }).record(latency);
    },
    onError: (error) => {
      logger.error({ error }, 'Cache command failed');
    },
    onStats: (stats) => {
      logger.info({ stats }, 'Cache statistics updated');
    },
  }
);
```

## Best Practices

### Performance Optimization

1. **Right-size Connection Pools**: Set `maxConnections` based on your QPS and latency requirements
2. **Use Appropriate TTLs**: Balance data freshness with cache hit rates
3. **Implement Cache Warming**: Pre-populate frequently accessed data
4. **Monitor Hit Rates**: Aim for >90% hit rates for optimal performance
5. **Use Tags for Invalidation**: Enable efficient bulk operations

### Reliability Patterns

1. **Implement Circuit Breakers**: Prevent cascade failures during Redis outages
2. **Use Retry Logic**: Handle transient network issues gracefully
3. **Monitor Health**: Implement health checks in your application monitoring
4. **Graceful Degradation**: Design fallback strategies when cache is unavailable
5. **Chaos Testing**: Regularly test failure scenarios in staging

### Security Considerations

1. **Encrypt Sensitive Data**: Use encryption for PII or sensitive cached data
2. **Secure Redis**: Run Redis behind firewalls with strong authentication
3. **Input Validation**: Sanitize keys and values to prevent injection attacks
4. **Access Control**: Implement tenant isolation for multi-tenant applications
5. **Audit Logging**: Enable comprehensive logging for compliance

### Operational Excellence

1. **Distributed Tracing**: Implement tracing for debugging complex issues
2. **Performance Profiling**: Use profiling tools to identify bottlenecks
3. **Backup Strategy**: Regular backups for disaster recovery
4. **Monitoring Integration**: Integrate with your observability stack
5. **Documentation**: Keep cache key schemas documented for team members

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- CacheManager.test.ts
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

## License

MIT - see [LICENSE](../../LICENSE) file for details.

## Support

- 📖 [Documentation](https://kitium.ai/docs/cache)
- 💬 [Discord Community](https://discord.gg/kitium)
- 🐛 [Issue Tracker](https://github.com/kitium-ai/cache/issues)
- 📧 [Email Support](mailto:support@kitium.ai)

## Features

✨ **Enterprise-Ready**

- Production-tested patterns
- Comprehensive error handling
- TypeScript first-class support
- Full type safety

🚀 **High Performance**

- Redis connection pooling (configurable min/max connections)
- Efficient key management with pattern matching
- Batch operations for bulk cache management
- Event-driven invalidation
- Hot-path in-memory tier with negative caching and stampede protection

🔑 **Smart Key Management**

- Hierarchical key organization with namespaces
- Tag-based bulk invalidation
- Pattern-based cache invalidation
- Key validation and sanitization
- Consistent key hashing for distribution

⏱️ **Flexible TTL Configuration**

- Configurable default, min, and max TTL
- Per-operation TTL override
- Automatic TTL validation and bounds enforcement

🎯 **Multiple Invalidation Strategies**

- Pattern-based invalidation (wildcard matching)
- Tag-based invalidation (bulk operations)
- Manual invalidation
- Event-driven invalidation with listeners
- TTL-based automatic expiration

🛡️ **Resilience & Security**

- Retry/backoff and command timeouts for Redis operations
- Optional encryption + compression codecs
- Health checks with periodic pool validation and tag reconciliation
- Request coalescing to avoid thundering herd scenarios

📈 **Observability & Governance**

- In-memory and persisted stats with hit-rate tracking
- Instrumentation hooks for metrics/logging/tracing
- SCAN-based discovery to avoid blocking Redis instances

## Installation

```bash
npm install @kitiumai/cache redis
```

or with yarn:

```bash
yarn add @kitiumai/cache redis
```

## Quick Start

```typescript
import { CacheManager, InvalidationStrategy } from '@kitiumai/cache';

// Initialize cache manager
const cache = new CacheManager(
  // Redis configuration
  {
    host: 'localhost',
    port: 6379,
    password: 'optional-password',
  },
  // Connection pool configuration
  {
    maxConnections: 10,
    minConnections: 2,
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 5000,
    validationIntervalMs: 10000,
  },
  // Cache key configuration
  {
    prefix: 'myapp',
    separator: ':',
    namespace: 'cache',
  },
  // TTL configuration
  {
    defaultTTL: 3600, // 1 hour
    maxTTL: 86400, // 24 hours
    minTTL: 60, // 1 minute
  }
);

// Connect to Redis
await cache.connect();

// Set a value
await cache.set('user:123', { id: 123, name: 'John' });

// Get a value
const user = await cache.get('user:123');

// Get or compute
const product = await cache.getOrSet(
  'product:456',
  async () => {
    return await fetchProductFromDB(456);
  },
  { ttl: 7200 }
);

// Disconnect
await cache.disconnect();
```

### Resilient, Observable, Multi-tier Setup

```typescript
import { CacheManager } from '@kitiumai/cache';

const cache = new CacheManager(
  {
    host: 'localhost',
    port: 6379,
    retryPolicy: { maxAttempts: 3, backoffMs: 50, jitterMs: 25 },
    commandTimeoutMs: 2000,
  },
  {
    maxConnections: 20,
    minConnections: 4,
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 4000,
    validationIntervalMs: 10000,
  },
  { prefix: 'myapp', namespace: 'cache' },
  { defaultTTL: 3600, maxTTL: 86400, minTTL: 30 },
  {
    enabled: true,
    maxItems: 1000,
    ttlSeconds: 600,
    negativeTtlSeconds: 30,
  },
  {
    onCommand: (cmd, latency, success) =>
      metrics.histogram('cache_command_latency_ms', { cmd, success }).record(latency),
    onError: (error) => logger.error({ err: error }, 'cache command failed'),
    onStats: (stats) => logger.info({ stats }, 'cache stats updated'),
  }
);

await cache.connect();
await cache.set('user:123', sensitivePayload, {
  compress: true,
  encrypt: true,
  tags: ['user', 'profile'],
});
```

## Core Concepts

### Cache Keys

Keys are automatically namespaced and prefixed for organization:

```typescript
const keyManager = cache.getKeyManager();

// Build a key
const key = keyManager.buildKey('user', '123');
// Result: 'myapp:cache:user:123'

// Build with custom namespace
const sessionKey = keyManager.buildNamespacedKey('session', 'token', 'abc123');
// Result: 'myapp:session:token:abc123'

// Build a pattern for matching
const userPattern = keyManager.buildPattern('user', '*');
// Result: 'myapp:cache:user:*'
```

### TTL Management

TTL (Time To Live) is strictly validated against configured bounds:

```typescript
// Use default TTL (3600 seconds)
await cache.set('key1', 'value1');

// Use custom TTL
await cache.set('key2', 'value2', { ttl: 7200 });

// TTL too low? Automatically adjusted to minTTL
await cache.set('key3', 'value3', { ttl: 10 }); // Adjusted to 60

// TTL too high? Automatically adjusted to maxTTL
await cache.set('key4', 'value4', { ttl: 999999 }); // Adjusted to 86400
```

### Cache Invalidation Strategies

#### 1. **Pattern-Based Invalidation**

Invalidate all keys matching a pattern:

```typescript
// Invalidate all user-related cache
const count = await cache.invalidatePattern('user:*');
console.log(`Invalidated ${count} keys`);

// Invalidate specific subset
await cache.invalidatePattern('user:active:*');
```

#### 2. **Tag-Based Invalidation**

Bulk invalidation using tags:

```typescript
// Set value with tags
await cache.set('user:123', userData, {
  ttl: 3600,
  tags: ['users', 'active', 'premium'],
});

// Invalidate all cached data with specific tags
const count = await cache.invalidateByTags(['premium']);
console.log(`Invalidated ${count} premium user caches`);

// Invalidate by multiple tags (union)
await cache.invalidateByTags(['users', 'dirty']);
```

#### 3. **Manual Invalidation**

Direct key deletion:

```typescript
// Delete single key
const deleted = await cache.delete('user:123');

// Delete multiple keys
const count = await cache.deleteMultiple(['user:123', 'user:456', 'user:789']);
```

#### 4. **Event-Driven Invalidation**

Listen to cache invalidation events:

```typescript
cache.onInvalidation((event) => {
  console.log(`Cache invalidation event:`, {
    strategy: event.strategy,
    affectedKeys: event.keys.length,
    reason: event.reason,
  });

  // Trigger side effects (e.g., send notifications)
  if (event.strategy === InvalidationStrategy.PATTERN) {
    notifyClients(event.keys);
  }
});

// Unregister listener
cache.offInvalidation(listenerFn);
```

## API Reference

### Cache Manager

#### `new CacheManager(redisConfig, poolConfig, keyConfig?, ttlConfig?)`

Create a new cache manager instance.

#### `connect(): Promise<void>`

Connect to Redis.

#### `disconnect(): Promise<void>`

Close all connections.

#### `healthCheck(): Promise<boolean>`

Check Redis connectivity.

#### `get<T>(key: string): Promise<T | null>`

Retrieve a cached value.

#### `set<T>(key: string, value: T, options?: CacheOptions): Promise<void>`

Store a value in cache.

```typescript
interface CacheOptions {
  ttl?: number; // TTL in seconds
  tags?: string[]; // Invalidation tags
  invalidationStrategy?: InvalidationStrategy;
}
```

#### `getOrSet<T>(key: string, fn: () => Promise<T>, options?: CacheOptions): Promise<T>`

Get cached value or compute and cache if not found.

#### `delete(key: string): Promise<boolean>`

Delete a key.

#### `deleteMultiple(keys: string[]): Promise<number>`

Delete multiple keys.

#### `exists(key: string): Promise<boolean>`

Check if key exists.

#### `clear(): Promise<void>`

Clear all cache.

#### `getKeys(pattern?: string): Promise<string[]>`

Get all keys matching pattern.

#### `invalidatePattern(pattern: string): Promise<number>`

Invalidate keys matching pattern.

#### `invalidateByTags(tags: string[]): Promise<number>`

Invalidate keys with specific tags.

#### `onInvalidation(callback: (event: InvalidationEvent) => void): void`

Listen to invalidation events.

#### `offInvalidation(callback: (event: InvalidationEvent) => void): void`

Remove invalidation listener.

#### `getStats(): Promise<CacheStats>`

Get cache statistics.

```typescript
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  sizeBytes: number;
  itemCount: number;
  hitRate: number;
  lastUpdated: number;
}
```

#### `warmup(data: Record<string, unknown>, options?: CacheOptions): Promise<void>`

Load multiple entries into cache.

### Key Manager

```typescript
const keyManager = cache.getKeyManager();

// Build keys
keyManager.buildKey('user', '123');
keyManager.buildNamespacedKey('session', 'token', 'abc');

// Extract information
keyManager.extractParts('prefix:namespace:user:123');
keyManager.extractNamespace('prefix:namespace:user:123');

// Pattern matching
keyManager.buildPattern('user', '*');
keyManager.buildNamespacePattern('session');

// Tag management
keyManager.registerKeyWithTags('key1', ['tag1', 'tag2']);
keyManager.getKeysByTag('tag1');
keyManager.getKeysByTags(['tag1', 'tag2']);

// Validation and hashing
keyManager.isValidKey('user:123');
keyManager.hashKey('user:123');

// Statistics
keyManager.getKeyStats();
```

## Advanced Usage

### Custom Namespaces

```typescript
const cache = new CacheManager(redisConfig, poolConfig);

// Use custom namespace for different data domains
const userCache = cache.getKeyManager();
userCache.setNamespace('users');

const sessionCache = cache.getKeyManager();
sessionCache.setNamespace('sessions');

// Keys will be segregated by namespace
await cache.set('123', userData); // Key: 'prefix:users:123'
```

### Connection Pooling Configuration

```typescript
const poolConfig = {
  maxConnections: 20, // Maximum concurrent connections
  minConnections: 5, // Minimum always-available connections
  idleTimeoutMs: 30000, // Close idle connections after 30s
  acquireTimeoutMs: 5000, // Timeout for acquiring connection
  validationIntervalMs: 10000, // Validate connections every 10s
};
```

### Error Handling

```typescript
try {
  await cache.connect();
  const value = await cache.get('key');
  await cache.set('key', 'value');
} catch (error) {
  if (error instanceof Error) {
    console.error('Cache error:', error.message);
  }
  // Implement fallback logic
} finally {
  await cache.disconnect();
}
```

### Bulk Operations

```typescript
// Warmup cache on startup
const initialData = {
  'config:db_url': 'postgresql://...',
  'config:api_key': 'secret...',
  'feature:dark_mode': true,
};

await cache.warmup(initialData, { ttl: 86400 });

// Bulk invalidation after data update
await cache.invalidateByTags(['users', 'posts']);

// Clean up specific subset
const invalidated = await cache.invalidatePattern('temp:*');
console.log(`Cleaned up ${invalidated} temporary entries`);
```

## Best Practices

1. **Use Namespaces**: Organize keys by domain (users, sessions, products, etc.)
2. **Tag Related Data**: Use tags for bulk invalidation of related entries
3. **Set Appropriate TTLs**: Balance between freshness and performance
4. **Monitor Statistics**: Track hit rate and adjust strategy accordingly
5. **Handle Failures**: Always implement fallback logic for cache misses
6. **Validate Keys**: Use key manager to ensure consistent key formatting
7. **Connection Pool Sizing**: Set pool size based on your concurrency needs
8. **Health Checks**: Periodically verify cache connectivity in production

## Security Considerations

- Use Redis AUTH with strong passwords
- Run Redis behind a firewall or VPN
- Encrypt sensitive data before caching
- Sanitize user inputs when building cache keys
- Monitor Redis logs for unauthorized access
- Use SSL/TLS for Redis connections in production

## Performance Tips

- Use connection pooling with appropriate min/max sizes
- Batch multiple operations when possible
- Use pattern-based invalidation for bulk updates
- Implement cache warming for frequently accessed data
- Monitor cache statistics to optimize TTL values
- Use tags for efficient selective invalidation

## Testing

```bash
npm test
npm run test:watch
npm run coverage
```

## Contributing

See the main repository for contribution guidelines.

## License

MIT
