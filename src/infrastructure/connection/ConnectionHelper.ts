/**
 * Connection Helper
 * Manages connection lifecycle for Redis operations
 * Eliminates DRY violation of repeated try-finally connection patterns
 */

import type { RedisConnectionPool } from '../../RedisConnectionPool';

/**
 * Helper for managing Redis connection acquisition and release
 * Ensures proper resource cleanup even on errors
 * Reduces boilerplate try-finally blocks across all operations
 */
export class ConnectionHelper {
  constructor(private readonly pool: RedisConnectionPool) {}

  /**
   * Execute an operation with automatic connection management
   * Acquires connection before operation, releases after (even on error)
   *
   * @example
   * const result = await connHelper.withConnection(async (client) => {
   *   return await client.get(key);
   * });
   */
  async withConnection<T>(operation: (client: any) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      return await operation(connection);
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  /**
   * Execute multiple operations with the same connection
   * Useful for batching related operations
   *
   * @example
   * const [val1, val2] = await connHelper.withConnectionBatch(async (client) => {
   *   return Promise.all([
   *     client.get('key1'),
   *     client.get('key2'),
   *   ]);
   * });
   */
  async withConnectionBatch<T>(operation: (client: any) => Promise<T[]>): Promise<T[]> {
    const connection = await this.pool.getConnection();
    try {
      return await operation(connection);
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  /**
   * Execute an operation with connection error handling
   * Wraps the withConnection logic with error context
   */
  async withConnectionSafe<T>(
    operation: (client: any) => Promise<T>,
    onError: (error: unknown) => void
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      return await operation(connection);
    } catch (error) {
      onError(error);
      throw error;
    } finally {
      this.pool.releaseConnection(connection);
    }
  }
}
