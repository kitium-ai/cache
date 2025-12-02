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
export interface TTLConfig {
  /** Default TTL in seconds */
  defaultTTL: number;
  /** Maximum TTL allowed in seconds */
  maxTTL: number;
  /** Minimum TTL allowed in seconds */
  minTTL: number;
}

/**
 * Cache key configuration
 */
export interface CacheKeyConfig {
  /** Prefix for all cache keys */
  prefix?: string;
  /** Separator character for key parts */
  separator?: string;
  /** Namespace for organized key grouping */
  namespace?: string;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
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
}

/**
 * Redis client configuration
 */
export interface RedisConfig {
  /** Redis host */
  host: string;
  /** Redis port */
  port: number;
  /** Redis password (optional) */
  password?: string;
  /** Redis database number */
  db?: number;
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;
  /** Command timeout in milliseconds */
  commandTimeoutMs?: number;
  /** Enable retry logic */
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Cache options for individual operations
 */
export interface CacheOptions {
  /** TTL in seconds for this specific operation */
  ttl?: number;
  /** Invalidation strategy for this key */
  invalidationStrategy?: InvalidationStrategy;
  /** Custom tags for bulk invalidation */
  tags?: string[];
  /** Whether to compress the value before storing */
  compress?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
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
}

/**
 * Invalidation event
 */
export interface InvalidationEvent {
  /** Type of invalidation */
  strategy: InvalidationStrategy;
  /** Keys affected */
  keys: string[];
  /** Timestamp */
  timestamp: number;
  /** Optional reason for invalidation */
  reason?: string;
}

/**
 * Cache adapter interface for different cache backends
 */
export interface ICacheAdapter {
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

  /** Invalidate keys matching a pattern */
  invalidatePattern(pattern: string): Promise<number>;

  /** Invalidate keys with specific tags */
  invalidateByTags(tags: string[]): Promise<number>;

  /** Get cache statistics */
  getStats(): Promise<CacheStats>;

  /** Connect to cache backend */
  connect(): Promise<void>;

  /** Disconnect from cache backend */
  disconnect(): Promise<void>;

  /** Check if connected */
  getConnectionStatus(): boolean;

  /** Health check */
  healthCheck(): Promise<boolean>;
}

/**
 * Cache manager interface
 */
export interface ICacheManager {
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
}
