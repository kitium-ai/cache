/**
 * Enterprise-ready cache package types and interfaces
 */

/**
 * Cache invalidation strategies
 */
export enum InvalidationStrategy {
  /** Immediate invalidation when data changes */
  IMMEDIATE = 'IMMEDIATE',
  /** Event-driven invalidation */
  EVENT_DRIVEN = 'EVENT_DRIVEN',
  /** Time-based invalidation using TTL */
  TTL = 'TTL',
  /** Pattern-based invalidation (invalidate keys matching a pattern) */
  PATTERN = 'PATTERN',
  /** Manual invalidation */
  MANUAL = 'MANUAL',
}

/**
 * TTL configuration options
 */
export type TTLConfig = {
  /** Default TTL in seconds */
  defaultTTL: number;
  /** Maximum TTL allowed in seconds */
  maxTTL: number;
  /** Minimum TTL allowed in seconds */
  minTTL: number;
};

/**
 * Cache key configuration
 */
export type CacheKeyConfig = {
  /** Prefix for all cache keys */
  prefix?: string;
  /** Separator character for key parts */
  separator?: string;
  /** Namespace for organized key grouping */
  namespace?: string;
};

/**
 * Connection pool configuration
 */
export type ConnectionPoolConfig = {
  /** Maximum number of connections in the pool */
  maxConnections: number;
  /** Minimum number of connections in the pool */
  minConnections: number;
  /** Connection idle timeout in milliseconds */
  idleTimeoutMs: number;
  /** Connection acquisition timeout in milliseconds */
  acquireTimeoutMs: number;
  /** Validation interval in milliseconds */
  validationIntervalMs: number;
};

/**
 * Redis client configuration
 */
export type RedisConfig = {
  /** Redis host */
  host: string;
  /** Redis port */
  port: number;
  /** Redis password (optional) */
  password?: string;
  /** Redis database number */
  db?: number;
  /** Optional encryption key for at-rest encryption */
  encryptionKey?: string;
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;
  /** Command timeout in milliseconds */
  commandTimeoutMs?: number;
  /** Enable retry logic */
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
    /** Optional jitter added to backoff to avoid stampedes */
    jitterMs?: number;
  };
  /** Optional sentinel configuration */
  sentinels?: { host: string; port: number }[];
  /** Sentinel master set name */
  sentinelName?: string;
  /** Optional cluster node list */
  clusterNodes?: { host: string; port: number }[];
  /** Preferred read replica flag */
  useReplicas?: boolean;
};

/**
 * Cache options for individual operations
 */
export type CacheOptions = {
  /** TTL in seconds for this specific operation */
  ttl?: number;
  /** Invalidation strategy for this key */
  invalidationStrategy?: InvalidationStrategy;
  /** Custom tags for bulk invalidation */
  tags?: string[];
  /** Whether to compress the value before storing */
  compress?: boolean;
  /** Whether to encrypt the value before storing */
  encrypt?: boolean;
};

/**
 * Memory cache configuration for hot key acceleration
 */
export type MemoryCacheConfig = {
  /** Enable in-memory cache tier */
  enabled: boolean;
  /** Maximum items allowed */
  maxItems: number;
  /** Default TTL in seconds for in-memory entries */
  ttlSeconds: number;
  /** TTL for negative cache entries */
  negativeTtlSeconds?: number;
  /** Maximum size in bytes before evicting oldest entries */
  maxSizeBytes?: number;
};

/**
 * Instrumentation hooks for observability
 */
export type InstrumentationHooks = {
  onCommand?: (command: string, latencyMs: number, success: boolean) => void;
  onError?: (error: Error) => void;
  onStats?: (stats: CacheStats) => void;
};

/**
 * Cache statistics
 */
export type CacheStats = {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of evictions */
  evictions: number;
  /** Current cache size in bytes */
  sizeBytes: number;
  /** Number of cached items */
  itemCount: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Last update timestamp */
  lastUpdated: number;
};

/**
 * Invalidation event
 */
export type InvalidationEvent = {
  /** Type of invalidation */
  strategy: InvalidationStrategy;
  /** Keys affected */
  keys: string[];
  /** Timestamp */
  timestamp: number;
  /** Optional reason for invalidation */
  reason?: string;
};

/**
 * Core cache operations interface
 * Provides basic get/set/delete operations
 */
export type ICacheOperations = {
  /** Get a value from cache */
  get<T>(key: string): Promise<T | null>;

  /** Set a value in cache */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /** Delete a key from cache */
  delete(key: string): Promise<boolean>;

  /** Check if key exists */
  exists(key: string): Promise<boolean>;

  /** Clear all cache */
  clear(): Promise<void>;

  /** Get all keys matching pattern */
  getKeys(pattern?: string): Promise<string[]>;
};

/**
 * Cache invalidation interface
 * Provides pattern and tag-based invalidation
 */
export type ICacheInvalidation = {
  /** Invalidate keys matching a pattern */
  invalidatePattern(pattern: string): Promise<number>;

  /** Invalidate keys with specific tags */
  invalidateByTags(tags: string[]): Promise<number>;
};

/**
 * Cache statistics interface
 * Provides access to cache metrics
 */
export type ICacheMetrics = {
  /** Get cache statistics */
  getStats(): Promise<CacheStats>;
};

/**
 * Cache lifecycle interface
 * Provides connection and health management
 */
export type ICacheLifecycle = {
  /** Connect to cache backend */
  connect(): Promise<void>;

  /** Disconnect from cache backend */
  disconnect(): Promise<void>;

  /** Check if connected */
  getConnectionStatus(): boolean;

  /** Health check */
  healthCheck(): Promise<boolean>;
};

/**
 * Composite cache adapter interface
 * Implements all cache operation capabilities
 */
export type ICacheAdapter = ICacheOperations &
  ICacheInvalidation &
  ICacheMetrics &
  ICacheLifecycle;

/**
 * Cache manager interface
 */
export type ICacheManager = {
  /** Get a value from cache */
  get<T>(key: string): Promise<T | null>;

  /** Set a value in cache */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /** Get or compute a value */
  getOrSet<T>(key: string, fn: () => Promise<T>, options?: CacheOptions): Promise<T>;

  /** Delete a key */
  delete(key: string): Promise<boolean>;

  /** Delete multiple keys */
  deleteMultiple(keys: string[]): Promise<number>;

  /** Check if key exists */
  exists(key: string): Promise<boolean>;

  /** Clear all cache */
  clear(): Promise<void>;

  /** Get all keys */
  getKeys(pattern?: string): Promise<string[]>;

  /** Invalidate by pattern */
  invalidatePattern(pattern: string): Promise<number>;

  /** Invalidate by tags */
  invalidateByTags(tags: string[]): Promise<number>;

  /** Watch invalidation events */
  onInvalidation(callback: (event: InvalidationEvent) => void): void;

  /** Get statistics */
  getStats(): Promise<CacheStats>;

  /** Warmup cache with initial data */
  warmup(data: Record<string, unknown>, options?: CacheOptions): Promise<void>;

  /** Connect */
  connect(): Promise<void>;

  /** Disconnect */
  disconnect(): Promise<void>;

  /** Health check */
  healthCheck(): Promise<boolean>;
};

// ===== ADVANCED FEATURE TYPES =====

/**
 * Loading cache options
 */
export type LoadingCacheOptions<T> = CacheOptions & {
  /** Function to load value when not in cache */
  loader?: () => Promise<T>;
  /** Refresh-ahead window (seconds before expiry to refresh) */
  refreshWindow?: number;
  /** Maximum refresh concurrency */
  maxConcurrency?: number;
  /** Cache null/undefined values */
  cacheNulls?: boolean;
};

/**
 * Cache loader interface for loading cache
 */
export type CacheLoader<K, V> = {
  /** Load a single value */
  load(key: K): Promise<V>;
  /** Load multiple values */
  loadAll?(keys: K[]): Promise<Map<K, V>>;
  /** Reload a value (for refresh-ahead) */
  reload?(key: K, oldValue: V): Promise<V>;
};

/**
 * Eviction window configuration for Windowed TinyLFU
 */
export type EvictionWindow = {
  /** Window size in number of operations */
  size: number;
  /** Reset interval in milliseconds */
  resetIntervalMs: number;
  /** Window weight for combining with main cache */
  weight: number;
};

/**
 * Distributed tracing configuration
 */
export type TracingConfig = {
  /** Enable tracing */
  enabled: boolean;
  /** Service name for traces */
  serviceName: string;
  /** Sampling rate (0.0 to 1.0) */
  samplingRate: number;
  /** Custom tags to add to all spans */
  tags?: Record<string, string>;
  /** Exporter configuration */
  exporter?: {
    type: 'console' | 'jaeger' | 'zipkin' | 'otlp';
    endpoint?: string;
  };
};

/**
 * Circuit breaker configuration
 */
export type CircuitBreakerConfig = {
  /** Failure threshold (number of failures) */
  failureThreshold: number;
  /** Recovery timeout in milliseconds */
  recoveryTimeoutMs: number;
  /** Monitoring window in milliseconds */
  monitoringWindowMs: number;
  /** Success threshold for recovery */
  successThreshold: number;
  /** Half-open max requests */
  halfOpenMaxRequests: number;
};

/**
 * Redis cluster configuration
 */
export type ClusterConfig = {
  /** Enable clustering */
  enabled: boolean;
  /** Cluster nodes */
  nodes: { host: string; port: number }[];
  /** Redis options */
  redisOptions?: Partial<RedisConfig>;
  /** Cluster-specific options */
  clusterOptions?: {
    enableOfflineQueue?: boolean;
    maxRedirections?: number;
    retryDelayOnFailover?: number;
  };
};

/**
 * Multi-tenant configuration
 */
export type TenantConfig = {
  /** Tenant identifier */
  id: string;
  /** Resource quotas */
  quotas: {
    maxKeys: number;
    maxSizeBytes: number;
    maxRequestsPerSecond: number;
  };
  /** Custom TTL settings */
  ttl?: Partial<TTLConfig>;
  /** Isolation level */
  isolation: 'soft' | 'hard';
  /** Custom eviction strategy */
  evictionStrategy?: string;
};

/**
 * Performance profile data
 */
export type PerformanceProfile = {
  /** Profile timestamp */
  timestamp: number;
  /** Operation latency percentiles */
  latencyPercentiles: {
    p50: number;
    p95: number;
    p99: number;
    p999: number;
  };
  /** Throughput metrics */
  throughput: {
    requestsPerSecond: number;
    bytesPerSecond: number;
  };
  /** Cache efficiency metrics */
  efficiency: {
    hitRate: number;
    evictionRate: number;
    memoryUtilization: number;
  };
  /** Bottleneck analysis */
  bottlenecks: string[];
  /** Optimization recommendations */
  recommendations: string[];
};

/**
 * Framework adapter configuration
 */
export type FrameworkAdapterConfig = {
  /** Framework type */
  framework: 'express' | 'fastify' | 'nestjs';
  /** Cache header name */
  cacheHeader?: string;
  /** Cache control directives */
  cacheControl?: {
    maxAge?: number;
    sMaxAge?: number;
    private?: boolean;
    noCache?: boolean;
  };
  /** Custom middleware options */
  middleware?: Record<string, unknown>;
};

/**
 * Multi-region cache configuration
 */
export type MultiRegionConfig = {
  /** Enable multi-region */
  enabled: boolean;
  /** Current region */
  currentRegion: string;
  /** All regions */
  regions: string[];
  /** Replication strategy */
  replicationStrategy: 'async' | 'sync' | 'eventual';
  /** Consistency mode */
  consistencyMode: 'strong' | 'eventual' | 'causal';
  /** Cross-region latency tolerance */
  crossRegionLatencyMs: number;
  /** Failover configuration */
  failover: {
    enabled: boolean;
    timeoutMs: number;
    retryAttempts: number;
  };
};

/**
 * Redis modules configuration
 */
export type RedisModuleConfig = {
  /** Enable RediSearch */
  rediSearch?: {
    enabled: boolean;
    indexDefinitions: Record<string, unknown>;
  };
  /** RedisJSON */
  redisJSON?: {
    enabled: boolean;
    pathSeparator: string;
  };
  /** RedisTimeSeries */
  redisTimeSeries?: {
    enabled: boolean;
    retentionPolicy?: number;
  };
  /** RedisGraph */
  redisGraph?: {
    enabled: boolean;
    graphName: string;
  };
  /** RedisBloom */
  redisBloom?: {
    enabled: boolean;
    errorRate?: number;
    capacity?: number;
  };
};

/**
 * Backup configuration
 */
export type BackupConfig = {
  /** Backup directory */
  directory: string;
  /** Maximum number of backups to keep */
  maxBackups: number;
  /** Compression enabled */
  compression: boolean;
  /** Include metadata */
  includeMetadata: boolean;
};

/**
 * Backup metadata
 */
export type BackupMetadata = {
  id: string;
  timestamp: number;
  version: string;
  totalKeys: number;
  totalSizeBytes: number;
  compression: boolean;
  checksum: string;
  duration: number;
};

/**
 * Restore options
 */
export type RestoreOptions = {
  /** Validate checksum after restore */
  validateChecksum: boolean;
  /** Overwrite existing keys */
  overwrite: boolean;
  /** Dry run mode */
  dryRun: boolean;
  /** Progress callback */
  onProgress?: (progress: { current: number; total: number; key: string }) => void;
};

/**
 * Chaos engineering configuration
 */
export type ChaosConfig = {
  /** Enable chaos mode */
  enabled: boolean;
  /** Failure injection probability (0.0 to 1.0) */
  failureProbability: number;
  /** Latency injection */
  latencyInjection?: {
    minMs: number;
    maxMs: number;
    probability: number;
  };
  /** Data corruption simulation */
  dataCorruption?: {
    probability: number;
    corruptionType: 'flip_bits' | 'truncate' | 'garbage';
  };
  /** Network partition simulation */
  networkPartition?: {
    probability: number;
    durationMs: number;
  };
};

/**
 * Chaos event data
 */
export type ChaosEvent = {
  type: 'latency_injected' | 'failure_injected' | 'corruption_applied' | 'partition_simulated';
  timestamp: number;
  operation: string;
  details: Record<string, unknown>;
};
