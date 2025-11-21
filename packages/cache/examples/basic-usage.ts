/**
 * Basic Usage Example
 * Demonstrates fundamental cache operations
 */

import { CacheManager } from '../src';

async function basicExample(): Promise<void> {
  // Initialize cache manager
  const cache = new CacheManager(
    {
      host: 'localhost',
      port: 6379,
    },
    {
      maxConnections: 10,
      minConnections: 2,
      idleTimeoutMs: 30000,
      acquireTimeoutMs: 5000,
      validationIntervalMs: 10000,
    },
    {
      prefix: 'demo',
      separator: ':',
      namespace: 'app',
    },
    {
      defaultTTL: 3600,
      maxTTL: 86400,
      minTTL: 60,
    }
  );

  try {
    // Connect to Redis
    console.log('Connecting to Redis...');
    await cache.connect();

    // 1. Set a value
    console.log('\n1. Setting a value...');
    await cache.set('user:123', {
      id: 123,
      name: 'John Doe',
      email: 'john@example.com',
    });
    console.log('Value set for user:123');

    // 2. Get a value
    console.log('\n2. Getting the value...');
    const user = await cache.get('user:123');
    console.log('Retrieved user:', user);

    // 3. Check if key exists
    console.log('\n3. Checking if key exists...');
    const exists = await cache.exists('user:123');
    console.log('Key exists:', exists);

    // 4. Set value with custom TTL
    console.log('\n4. Setting value with custom TTL...');
    await cache.set('session:abc123', { sessionId: 'abc123', userId: 123 }, {
      ttl: 1800, // 30 minutes
    });
    console.log('Session cached with 30-minute TTL');

    // 5. Get or compute
    console.log('\n5. Get or compute pattern...');
    const product = await cache.getOrSet('product:456', async () => {
      console.log('  Computing product data (not in cache)...');
      return { id: 456, name: 'Laptop', price: 999.99 };
    });
    console.log('Product:', product);

    // 6. Second get-or-set (should be from cache)
    console.log('\n6. Get or compute again (should be cached)...');
    const cachedProduct = await cache.getOrSet('product:456', async () => {
      console.log('  Computing product data (not in cache)...');
      return { id: 456, name: 'Laptop', price: 999.99 };
    });
    console.log('Product (from cache):', cachedProduct);

    // 7. Delete a key
    console.log('\n7. Deleting a key...');
    const deleted = await cache.delete('user:123');
    console.log('Key deleted:', deleted);

    // 8. Verify deletion
    console.log('\n8. Checking after deletion...');
    const notExists = await cache.exists('user:123');
    console.log('Key exists:', notExists);

    // 9. Get cache statistics
    console.log('\n9. Cache statistics...');
    const stats = await cache.getStats();
    console.log('Statistics:', stats);

    // 10. Health check
    console.log('\n10. Health check...');
    const healthy = await cache.healthCheck();
    console.log('Cache is healthy:', healthy);

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  } finally {
    // Disconnect
    console.log('\nDisconnecting...');
    await cache.disconnect();
  }
}

// Run the example
basicExample();
