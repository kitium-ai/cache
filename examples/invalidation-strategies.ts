/**
 * Invalidation Strategies Example
 * Demonstrates various cache invalidation approaches
 */

import { CacheManager, InvalidationStrategy } from '../src';

async function invalidationExample(): Promise<void> {
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
    }
  );

  try {
    await cache.connect();

    // Setup: Create some cache entries with tags
    console.log('Setting up cache entries...\n');

    await cache.set(
      'user:1',
      { id: 1, name: 'Alice', status: 'active' },
      {
        tags: ['users', 'active', 'premium'],
      }
    );

    await cache.set(
      'user:2',
      { id: 2, name: 'Bob', status: 'active' },
      {
        tags: ['users', 'active'],
      }
    );

    await cache.set(
      'user:3',
      { id: 3, name: 'Charlie', status: 'inactive' },
      {
        tags: ['users', 'inactive'],
      }
    );

    await cache.set(
      'post:1',
      { id: 1, title: 'Post 1', authorId: 1 },
      {
        tags: ['posts', 'published'],
      }
    );

    await cache.set(
      'post:2',
      { id: 2, title: 'Post 2', authorId: 2 },
      {
        tags: ['posts', 'published'],
      }
    );

    console.log('Created 5 cache entries\n');

    // 1. Pattern-based invalidation
    console.log('1. PATTERN-BASED INVALIDATION');
    console.log('   Invalidating all user-related cache...');
    const invalidatedByPattern = await cache.invalidatePattern('user:*');
    console.log(`   Invalidated ${invalidatedByPattern} entries\n`);

    // Re-populate for next examples
    await cache.set(
      'user:1',
      { id: 1, name: 'Alice', status: 'active' },
      {
        tags: ['users', 'active', 'premium'],
      }
    );
    await cache.set(
      'user:2',
      { id: 2, name: 'Bob', status: 'active' },
      {
        tags: ['users', 'active'],
      }
    );
    await cache.set(
      'user:3',
      { id: 3, name: 'Charlie', status: 'inactive' },
      {
        tags: ['users', 'inactive'],
      }
    );

    // 2. Tag-based invalidation
    console.log('2. TAG-BASED INVALIDATION');
    console.log('   Invalidating all entries with "active" tag...');
    const invalidatedByTag = await cache.invalidateByTags(['active']);
    console.log(`   Invalidated ${invalidatedByTag} entries\n`);

    // Re-populate
    await cache.set(
      'user:1',
      { id: 1, name: 'Alice', status: 'active' },
      {
        tags: ['users', 'active', 'premium'],
      }
    );
    await cache.set(
      'user:2',
      { id: 2, name: 'Bob', status: 'active' },
      {
        tags: ['users', 'active'],
      }
    );

    // 3. Manual single key deletion
    console.log('3. MANUAL KEY DELETION');
    console.log('   Deleting specific key: user:1');
    const deleted = await cache.delete('user:1');
    console.log(`   Key deleted: ${deleted}\n`);

    // 4. Bulk manual deletion
    console.log('4. BULK MANUAL DELETION');
    const keysToDelete = ['user:2', 'user:3', 'post:1'];
    console.log(`   Deleting keys: ${keysToDelete.join(', ')}`);
    const deletedCount = await cache.deleteMultiple(keysToDelete);
    console.log(`   Deleted ${deletedCount} keys\n`);

    // Re-populate for event example
    await cache.set(
      'user:1',
      { id: 1, name: 'Alice', status: 'active' },
      {
        tags: ['users', 'active'],
      }
    );
    await cache.set(
      'user:2',
      { id: 2, name: 'Bob', status: 'active' },
      {
        tags: ['users', 'active'],
      }
    );

    // 5. Event-driven invalidation
    console.log('5. EVENT-DRIVEN INVALIDATION');
    console.log('   Registering invalidation listener...');

    let eventCount = 0;
    cache.onInvalidation((event) => {
      eventCount++;
      console.log(`   Event #${eventCount}:`, {
        strategy: event.strategy,
        affectedKeys: event.keys.length,
        reason: event.reason,
        timestamp: new Date(event.timestamp).toISOString(),
      });
    });

    console.log('   Triggering invalidation...');
    await cache.invalidateByTags(['users']);
    console.log('');

    // 6. Selective invalidation with complex patterns
    console.log('6. COMPLEX PATTERN INVALIDATION');

    // Setup hierarchical keys
    await cache.set('api:v1:users:1', { data: 'user 1' });
    await cache.set('api:v1:users:2', { data: 'user 2' });
    await cache.set('api:v1:posts:1', { data: 'post 1' });
    await cache.set('api:v2:users:1', { data: 'user 1' });

    console.log('   Invalidating only API v1 users: api:v1:users:*');
    const countV1Users = await cache.invalidatePattern('api:v1:users:*');
    console.log(`   Invalidated ${countV1Users} entries\n`);

    // 7. Clear entire cache
    console.log('7. COMPLETE CACHE CLEAR');
    console.log('   Clearing all cache...');
    await cache.clear();
    console.log('   Cache cleared\n');

    // 8. Get all keys
    console.log('8. QUERY CACHE KEYS');
    await cache.set('user:100', { id: 100 });
    await cache.set('user:101', { id: 101 });
    await cache.set('product:1', { id: 1 });

    const allKeys = await cache.getKeys();
    console.log(`   All keys: ${allKeys.join(', ')}`);

    const userKeys = await cache.getKeys('user:*');
    console.log(`   User keys: ${userKeys.join(', ')}\n`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await cache.disconnect();
  }
}

// Run the example
invalidationExample();
