# @kitiumai/cache

Enterprise-ready Redis abstraction layer with advanced caching capabilities. Provides connection pooling, intelligent cache key management, flexible TTL configuration, and multiple invalidation strategies.

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
    defaultTTL: 3600,      // 1 hour
    maxTTL: 86400,         // 24 hours
    minTTL: 60,            // 1 minute
  }
);

// Connect to Redis
await cache.connect();

// Set a value
await cache.set('user:123', { id: 123, name: 'John' });

// Get a value
const user = await cache.get('user:123');

// Get or compute
const product = await cache.getOrSet('product:456', async () => {
  return await fetchProductFromDB(456);
}, { ttl: 7200 });

// Disconnect
await cache.disconnect();
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
await cache.set('key3', 'value3', { ttl: 10 });  // Adjusted to 60

// TTL too high? Automatically adjusted to maxTTL
await cache.set('key4', 'value4', { ttl: 999999 });  // Adjusted to 86400
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
  ttl?: number;  // TTL in seconds
  tags?: string[];  // Invalidation tags
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
await cache.set('123', userData);  // Key: 'prefix:users:123'
```

### Connection Pooling Configuration

```typescript
const poolConfig = {
  maxConnections: 20,           // Maximum concurrent connections
  minConnections: 5,            // Minimum always-available connections
  idleTimeoutMs: 30000,         // Close idle connections after 30s
  acquireTimeoutMs: 5000,       // Timeout for acquiring connection
  validationIntervalMs: 10000,  // Validate connections every 10s
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
