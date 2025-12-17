/**
 * Multi-Region Replication Manager
 * Handles cross-region data synchronization and failover
 * Provides global cache consistency with automatic region failover
 */

import { EventEmitter } from 'node:events';

import { getLogger } from '@kitiumai/logger';

import { CacheManager } from '../CacheManager';
import type {
  CacheKeyConfig,
  CacheOptions,
  CacheStats,
  ConnectionPoolConfig,
  RedisConfig,
  TTLConfig,
} from '../types';

export type RegionConfig = {
  /** Region identifier */
  id: string;
  /** Primary Redis configuration */
  redis: RedisConfig;
  /** Connection pool configuration */
  pool: ConnectionPoolConfig;
  /** Replication priority (higher = preferred) */
  priority: number;
  /** Health check interval */
  healthCheckIntervalMs?: number;
  /** Replication lag tolerance */
  maxReplicationLagMs?: number;
}

export type ReplicationEvent = {
  type: 'write' | 'sync' | 'failover' | 'recovery';
  regionId: string;
  key?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type MultiRegionConfig = {
  /** All region configurations */
  regions: RegionConfig[];
  /** Write consistency mode */
  writeConsistency: 'strong' | 'eventual' | 'quorum';
  /** Read preference */
  readPreference: 'local' | 'nearest' | 'any';
  /** Replication batch size */
  batchSize?: number;
  /** Sync interval for eventual consistency */
  syncIntervalMs?: number;
  /** Failover timeout */
  failoverTimeoutMs?: number;
}

/**
 * Multi-region cache manager with replication and failover
 */
export class MultiRegionCacheManager extends EventEmitter {
  private readonly regions = new Map<string, RegionInstance>();
  private readonly activeRegions = new Set<string>();
  private primaryRegion: string;
  private readonly logger = getLogger().child({ component: 'multi-region-cache' });
  private syncTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(
    private readonly baseKeyConfig: CacheKeyConfig,
    private readonly baseTtlConfig: TTLConfig,
    private readonly config: MultiRegionConfig
  ) {
    super();

    if (config.regions.length === 0) {
      throw new Error('At least one region must be configured');
    }

    // Sort regions by priority
    const sortedRegions = [...config.regions].sort((a, b) => b.priority - a.priority);
    const primary = sortedRegions[0];
    if (!primary) {
      throw new Error('At least one region must be configured');
    }
    this.primaryRegion = primary.id;

    // Initialize regions
    for (const regionConfig of config.regions) {
      this.initializeRegion(regionConfig);
    }

    this.startHealthChecks();
    this.startReplicationSync();
  }

  /**
   * Get value from cache (with read preference)
   */
  async get<T>(key: string): Promise<T | null> {
    const regions = this.getReadableRegions();

    // Try local region first if preferred
    if (this.config.readPreference === 'local' || this.config.readPreference === 'nearest') {
      const localResult = await this.tryRegion<T>(this.primaryRegion, 'get', key);
      if (localResult !== null) {
        return localResult;
      }
    }

    // Try other regions
    for (const regionId of regions) {
      if (regionId === this.primaryRegion && this.config.readPreference === 'local') {
        continue; // Already tried
      }

      try {
        const result = await this.tryRegion<T>(regionId, 'get', key);
        if (result !== null) {
          return result;
        }
      } catch (error) {
        this.logger.warn('Failed to read from region', { regionId, key, error });
      }
    }

    return null;
  }

  /**
   * Set value with replication
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const writeRegions = this.getWritableRegions();

    if (this.config.writeConsistency === 'strong') {
      // Wait for all regions to confirm
      await Promise.all(
        writeRegions.map((regionId) => this.tryRegion(regionId, 'set', key, value, options))
      );
    } else if (this.config.writeConsistency === 'quorum') {
      // Wait for majority
      const quorumSize = Math.floor(writeRegions.length / 2) + 1;
      const promises = writeRegions.map((regionId) =>
        this.tryRegion(regionId, 'set', key, value, options)
      );

      await this.waitForQuorum(promises, quorumSize);
    } else {
      // Eventual consistency - write to primary and queue for others
      await this.tryRegion(this.primaryRegion, 'set', key, value, options);
      this.queueForReplication(
        key,
        value,
        options,
        writeRegions.filter((r) => r !== this.primaryRegion)
      );
    }

    this.emitReplicationEvent({
      type: 'write',
      regionId: this.primaryRegion,
      key,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete with replication
   */
  async delete(key: string): Promise<boolean> {
    const writeRegions = this.getWritableRegions();
    let isDeleted = false;

    if (this.config.writeConsistency === 'strong') {
      const results = await Promise.all(
        writeRegions.map((regionId) => this.tryRegion(regionId, 'delete', key))
      );
      isDeleted = results.some((result) => result === true);
    } else {
      isDeleted = await this.tryRegion(this.primaryRegion, 'delete', key);
      this.queueForReplication(
        key,
        null,
        undefined,
        writeRegions.filter((r) => r !== this.primaryRegion),
        true
      );
    }

    if (isDeleted) {
      this.emitReplicationEvent({
        type: 'write',
        regionId: this.primaryRegion,
        key,
        timestamp: Date.now(),
      });
    }

    return isDeleted;
  }

  /**
   * Get all active regions
   */
  getActiveRegions(): string[] {
    return Array.from(this.activeRegions);
  }

  /**
   * Get primary region
   */
  getPrimaryRegion(): string {
    return this.primaryRegion;
  }

  /**
   * Force failover to a different region
   */
  failoverToRegion(regionId: string): void {
    if (!this.regions.has(regionId)) {
      throw new Error(`Region ${regionId} not found`);
    }

    const oldPrimary = this.primaryRegion;
    this.primaryRegion = regionId;

    this.emitReplicationEvent({
      type: 'failover',
      regionId,
      timestamp: Date.now(),
      metadata: { fromRegion: oldPrimary },
    });

    this.logger.info('Failover completed', { from: oldPrimary, to: regionId });
  }

  /**
   * Get replication statistics
   */
  async getReplicationStats(): Promise<Record<string, unknown>> {
    const stats: Record<string, unknown> = {};

    for (const [regionId, region] of this.regions) {
      const regionStats = await region.getStats();
      stats[regionId] = {
        active: this.activeRegions.has(regionId),
        isPrimary: regionId === this.primaryRegion,
        stats: regionStats,
      };
    }

    return stats;
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    for (const region of this.regions.values()) {
      await region.close();
    }
  }

  private initializeRegion(config: RegionConfig): void {
    const region = new RegionInstance(config, this.baseKeyConfig, this.baseTtlConfig);
    this.regions.set(config.id, region);
    this.activeRegions.add(config.id);
  }

  private getReadableRegions(): string[] {
    return Array.from(this.activeRegions);
  }

  private getWritableRegions(): string[] {
    // For now, all active regions can be written to
    // In more advanced setups, this could be limited
    return Array.from(this.activeRegions);
  }

  private async tryRegion<T>(regionId: string, operation: 'get', key: string): Promise<T | null>;
  private async tryRegion<T>(
    regionId: string,
    operation: 'set',
    key: string,
    value: T,
    options?: CacheOptions
  ): Promise<void>;
  private async tryRegion(regionId: string, operation: 'delete', key: string): Promise<boolean>;
  private async tryRegion<T>(
    regionId: string,
    operation: 'get' | 'set' | 'delete',
    key: string,
    valueOrOptions?: T | CacheOptions,
    maybeOptions?: CacheOptions
  ): Promise<T | null | boolean | void> {
    const region = this.regions.get(regionId);
    if (!region || !this.activeRegions.has(regionId)) {
      throw new Error(`Region ${regionId} not available`);
    }

    switch (operation) {
      case 'get':
        return await region.get<T>(key);
      case 'set':
        return await region.set<T>(
          key,
          valueOrOptions as T,
          (maybeOptions ?? undefined) as CacheOptions | undefined
        );
      case 'delete':
        return await region.delete(key);
    }
  }

  private async waitForQuorum<T>(promises: Array<Promise<T>>, quorumSize: number): Promise<T[]> {
    const results: T[] = [];

    for (const promise of promises) {
      try {
        const result = await promise;
        results.push(result);
        if (results.length >= quorumSize) {
          return results;
        }
      } catch (error) {
        void error;
      }
    }

    if (results.length < quorumSize) {
      throw new Error(`Quorum not reached. Got ${results.length}/${quorumSize} confirmations`);
    }

    return results;
  }

  private queueForReplication(
    key: string,
    value: unknown,
    options: CacheOptions | undefined,
    targetRegions: string[],
    isDelete = false
  ): void {
    // In a real implementation, this would queue operations for async replication
    // For now, we'll just log the intent
    this.logger.debug('Queued for replication', {
      key,
      targetRegions,
      isDelete,
      hasOptions: options !== undefined,
      valueType: value === null ? 'null' : typeof value,
    });
  }

  private emitReplicationEvent(event: ReplicationEvent): void {
    this.emit('replicationEvent', event);
  }

  private startHealthChecks(): void {
    const interval = Math.min(
      ...Array.from(this.regions.values()).map(
        (r) => r.config.healthCheckIntervalMs ?? 30000
      )
    );

    this.healthCheckTimer = setInterval(() => {
      void this.performHealthChecks();
    }, interval);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [regionId, region] of this.regions) {
      try {
        const isHealthy = await region.healthCheck();
        const didHaveActiveStatus = this.activeRegions.has(regionId);

        if (isHealthy && !didHaveActiveStatus) {
          this.activeRegions.add(regionId);
          this.emitReplicationEvent({
            type: 'recovery',
            regionId,
            timestamp: Date.now(),
          });
        } else if (!isHealthy && didHaveActiveStatus) {
          this.activeRegions.delete(regionId);
          this.handleRegionFailure(regionId);
        }
      } catch (error) {
        this.logger.error('Health check failed', { regionId, error }, this.toError(error));
        this.activeRegions.delete(regionId);
        this.handleRegionFailure(regionId);
      }
    }
  }

  private handleRegionFailure(regionId: string): void {
    this.emitReplicationEvent({
      type: 'failover',
      regionId,
      timestamp: Date.now(),
      metadata: { reason: 'health_check_failed' },
    });

    // If primary failed, trigger automatic failover
    if (regionId === this.primaryRegion) {
      this.performAutomaticFailover();
    }
  }

  private performAutomaticFailover(): void {
    // Find highest priority active region
    let bestRegion: string | null = null;
    let bestPriority = -1;

    for (const regionId of this.activeRegions) {
      const region = this.regions.get(regionId);
      if (region && region.config.priority > bestPriority) {
        bestPriority = region.config.priority;
        bestRegion = regionId;
      }
    }

    if (bestRegion) {
      this.failoverToRegion(bestRegion);
    } else {
      this.logger.error('No healthy regions available for failover');
    }
  }

  private toError(error: unknown): Error | undefined {
    return error instanceof Error ? error : undefined;
  }

  private startReplicationSync(): void {
    if (this.config.writeConsistency !== 'eventual') {
      return;
    }

    const interval = this.config.syncIntervalMs ?? 60000; // 1 minute default
    this.syncTimer = setInterval(() => {
      this.performReplicationSync();
    }, interval);
  }

  private performReplicationSync(): void {
    // In a real implementation, this would sync pending operations
    // For now, just emit sync events
    this.emitReplicationEvent({
      type: 'sync',
      regionId: this.primaryRegion,
      timestamp: Date.now(),
    });
  }
}

/**
 * Region instance wrapper
 */
class RegionInstance {
  public cacheManager: CacheManager;

  constructor(
    public config: RegionConfig,
    keyConfig: CacheKeyConfig,
    ttlConfig: TTLConfig
  ) {
    this.cacheManager = new CacheManager(config.redis, config.pool, keyConfig, ttlConfig);
  }

  get<T>(key: string): Promise<T | null> {
    return this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    await this.cacheManager.set(key, value, options);
  }

  delete(key: string): Promise<boolean> {
    return this.cacheManager.delete(key);
  }

  healthCheck(): Promise<boolean> {
    return this.cacheManager.healthCheck();
  }

  getStats(): Promise<CacheStats> {
    return this.cacheManager.getStats();
  }

  async close(): Promise<void> {
    await this.cacheManager.disconnect();
  }
}

/**
 * Factory function to create multi-region cache manager
 */
export function createMultiRegionCacheManager(
  keyConfig: CacheKeyConfig,
  ttlConfig: TTLConfig,
  config: MultiRegionConfig
): MultiRegionCacheManager {
  return new MultiRegionCacheManager(keyConfig, ttlConfig, config);
}
