/**
 * Redis Connection Pool
 * Manages a pool of Redis client connections for optimal resource utilization
 */

import { createClient, RedisClientType } from 'redis';
import { ConnectionPoolConfig, RedisConfig } from './types';

export class RedisConnectionPool {
  private pool: RedisClientType[] = [];
  private availableConnections: RedisClientType[] = [];
  private inUseConnections: Set<RedisClientType> = new Set();
  private config: ConnectionPoolConfig;
  private redisConfig: RedisConfig;
  private isInitialized: boolean = false;
  private connectionMutex: Promise<void> = Promise.resolve();
  private waitQueue: Array<{
    resolve: (client: RedisClientType) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  constructor(redisConfig: RedisConfig, poolConfig: ConnectionPoolConfig) {
    this.redisConfig = redisConfig;
    this.config = poolConfig;

    // Validate configuration
    if (poolConfig.minConnections > poolConfig.maxConnections) {
      throw new Error('minConnections cannot be greater than maxConnections');
    }

    if (poolConfig.minConnections < 1) {
      throw new Error('minConnections must be at least 1');
    }
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create minimum number of connections
      for (let i = 0; i < this.config.minConnections; i++) {
        const client = await this.createConnection();
        this.pool.push(client);
        this.availableConnections.push(client);
      }

      // Start validation interval
      this.startValidationInterval();

      this.isInitialized = true;
    } catch (error) {
      // Clean up any created connections
      await Promise.all(this.pool.map(client => this.closeConnection(client)));
      throw error;
    }
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<RedisClientType> {
    if (!this.isInitialized) {
      throw new Error('Connection pool not initialized');
    }

    // Try to get from available connections
    let client = this.availableConnections.pop();

    if (client) {
      // Verify connection is still healthy
      if (await this.isConnectionHealthy(client)) {
        this.inUseConnections.add(client);
        return client;
      } else {
        // Remove unhealthy connection
        await this.closeConnection(client);
        this.pool = this.pool.filter(c => c !== client);
      }
    }

    // Create new connection if pool is not at max capacity
    if (this.pool.length < this.config.maxConnections) {
      try {
        const newClient = await this.createConnection();
        this.pool.push(newClient);
        this.inUseConnections.add(newClient);
        return newClient;
      } catch (error) {
        // If creation fails, wait for an available connection
        return this.waitForConnection();
      }
    }

    // Wait for a connection to be released
    return this.waitForConnection();
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(client: RedisClientType): void {
    if (!this.inUseConnections.has(client)) {
      return;
    }

    this.inUseConnections.delete(client);

    // Check if connection is still healthy
    if (client.isOpen) {
      this.availableConnections.push(client);

      // Notify waiting requests
      const waitItem = this.waitQueue.shift();
      if (waitItem) {
        clearTimeout(waitItem.timeout);
        waitItem.resolve(client);
        this.inUseConnections.add(client);
      }
    } else {
      // Remove unhealthy connection from pool
      this.pool = this.pool.filter(c => c !== client);
    }
  }

  /**
   * Drain the pool and close all connections
   */
  async drain(): Promise<void> {
    // Wait for any in-use connections to be released
    let attempts = 0;
    while (this.inUseConnections.size > 0 && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    // Clear wait queue
    for (const waitItem of this.waitQueue) {
      clearTimeout(waitItem.timeout);
      waitItem.reject(new Error('Connection pool is draining'));
    }
    this.waitQueue = [];

    // Close all connections
    await Promise.all(this.pool.map(client => this.closeConnection(client)));

    this.pool = [];
    this.availableConnections = [];
    this.inUseConnections.clear();
    this.isInitialized = false;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    availableConnections: number;
    inUseConnections: number;
    waitingRequests: number;
  } {
    return {
      totalConnections: this.pool.length,
      availableConnections: this.availableConnections.length,
      inUseConnections: this.inUseConnections.size,
      waitingRequests: this.waitQueue.length,
    };
  }

  /**
   * Private: Create a new Redis connection
   */
  private async createConnection(): Promise<RedisClientType> {
    const client = createClient({
      socket: {
        host: this.redisConfig.host,
        port: this.redisConfig.port,
        connectTimeout: this.redisConfig.connectTimeoutMs || 5000,
      },
      password: this.redisConfig.password,
      db: this.redisConfig.db || 0,
      commandTimeout: this.redisConfig.commandTimeoutMs || 5000,
    });

    try {
      await client.connect();
      return client;
    } catch (error) {
      client.quit();
      throw error;
    }
  }

  /**
   * Private: Close a Redis connection
   */
  private async closeConnection(client: RedisClientType): Promise<void> {
    try {
      await client.quit();
    } catch {
      // Connection might already be closed
      try {
        await client.disconnect();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Private: Check if a connection is healthy
   */
  private async isConnectionHealthy(client: RedisClientType): Promise<boolean> {
    try {
      if (!client.isOpen) {
        return false;
      }

      // Send ping command to verify connection
      const result = await client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Private: Start periodic validation of connections
   */
  private startValidationInterval(): void {
    setInterval(async () => {
      if (!this.isInitialized) {
        return;
      }

      // Check idle connections
      const now = Date.now();
      const idleConnections: RedisClientType[] = [];

      for (const client of this.availableConnections) {
        if (!(await this.isConnectionHealthy(client))) {
          // Remove unhealthy connection
          this.pool = this.pool.filter(c => c !== client);
          this.availableConnections = this.availableConnections.filter(c => c !== client);
          await this.closeConnection(client);
        }
      }

      // Maintain minimum connections
      while (this.pool.length < this.config.minConnections) {
        try {
          const client = await this.createConnection();
          this.pool.push(client);
          this.availableConnections.push(client);
        } catch {
          // If we can't create a connection, we'll try again next interval
          break;
        }
      }
    }, this.config.validationIntervalMs);
  }

  /**
   * Private: Wait for a connection to become available
   */
  private waitForConnection(): Promise<RedisClientType> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.waitQueue.findIndex(item => item.resolve === resolve);
        if (idx >= 0) {
          this.waitQueue.splice(idx, 1);
        }
        reject(new Error(`Failed to acquire connection within ${this.config.acquireTimeoutMs}ms`));
      }, this.config.acquireTimeoutMs);

      this.waitQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Check if pool is initialized
   */
  isInitialized(): boolean {
    return this.isInitialized;
  }
}
