/**
 * Multi-Tenant Cache Manager
 * Provides isolated cache namespaces with resource quotas
 * Supports enterprise multi-tenant deployments
 */

import { getLogger } from '@kitiumai/logger';
import { EventEmitter } from 'node:events';

import { CacheManager } from '../../CacheManager';
import type { CacheKeyConfig, ConnectionPoolConfig, RedisConfig, TTLConfig } from '../../types';

export interface TenantConfig {
  /** Tenant identifier */
  id: string;
  /** Maximum cache size in bytes for this tenant */
  maxSizeBytes?: number;
  /** Maximum number of keys for this tenant */
  maxKeys?: number;
  /** Custom TTL limits */
  ttlConfig?: Partial<TTLConfig>;
  /** Resource allocation priority (higher = more resources) */
  priority?: number;
  /** Whether tenant is active */
  active?: boolean;
  /** Custom key prefix for this tenant */
  keyPrefix?: string;
}

export interface TenantMetrics {
  id: string;
  keysCount: number;
  sizeBytes: number;
  hitRate: number;
  operationsCount: number;
  lastAccess: number;
  quotaExceeded: boolean;
}

export interface MultiTenantConfig {
  /** Default tenant configuration */
  defaultTenant: Omit<TenantConfig, 'id'>;
  /** Global resource limits */
  globalLimits?: {
    maxTotalSizeBytes?: number;
    maxTotalKeys?: number;
  };
  /** Quota enforcement policy */
  quotaPolicy?: 'strict' | 'soft' | 'warning';
  /** Metrics collection interval */
  metricsIntervalMs?: number;
}

/**
 * Multi-tenant cache manager
 * Provides isolated cache instances with resource management
 */
export class MultiTenantCacheManager extends EventEmitter {
  private tenants = new Map<string, TenantCacheInstance>();
  private metrics = new Map<string, TenantMetrics>();
  private logger = getLogger().child({ component: 'multi-tenant-cache' });
  private metricsTimer?: NodeJS.Timeout;

  constructor(
    private redisConfig: RedisConfig,
    private poolConfig: ConnectionPoolConfig,
    private baseKeyConfig: CacheKeyConfig,
    private baseTtlConfig: TTLConfig,
    private config: MultiTenantConfig
  ) {
    super();
    this.startMetricsCollection();
  }

  /**
   * Create or get a tenant-specific cache instance
   */
  getTenantCache(tenantId: string): TenantCacheInstance {
    if (!this.tenants.has(tenantId)) {
      const tenantConfig: TenantConfig = {
        id: tenantId,
        ...this.config.defaultTenant,
      };

      const tenantCache = new TenantCacheInstance(
        tenantId,
        tenantConfig,
        this.redisConfig,
        this.poolConfig,
        {
          ...this.baseKeyConfig,
          prefix: tenantConfig.keyPrefix || `${this.baseKeyConfig.prefix || 'cache'}:${tenantId}`,
        },
        {
          ...this.baseTtlConfig,
          ...tenantConfig.ttlConfig,
        },
        this
      );

      this.tenants.set(tenantId, tenantCache);
      this.initializeTenantMetrics(tenantId);
    }

    return this.tenants.get(tenantId)!;
  }

  /**
   * Remove a tenant and clean up resources
   */
  async removeTenant(tenantId: string): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      await tenant.disconnect();
      this.tenants.delete(tenantId);
      this.metrics.delete(tenantId);
      this.emit('tenantRemoved', { tenantId });
    }
  }

  /**
   * Get all tenant IDs
   */
  getTenantIds(): string[] {
    return Array.from(this.tenants.keys());
  }

  /**
   * Get tenant metrics
   */
  getTenantMetrics(tenantId?: string): TenantMetrics[] {
    if (tenantId) {
      const metrics = this.metrics.get(tenantId);
      return metrics ? [metrics] : [];
    }

    return Array.from(this.metrics.values());
  }

  /**
   * Update tenant configuration
   */
  updateTenantConfig(tenantId: string, updates: Partial<TenantConfig>): void {
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      tenant.updateConfig(updates);
      this.emit('tenantConfigUpdated', { tenantId, updates });
    }
  }

  /**
   * Check if tenant quota is exceeded
   */
  isTenantQuotaExceeded(tenantId: string): boolean {
    const metrics = this.metrics.get(tenantId);
    if (!metrics) return false;

    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    const config = tenant.getConfig();

    if (config.maxKeys && metrics.keysCount >= config.maxKeys) {
      return true;
    }

    if (config.maxSizeBytes && metrics.sizeBytes >= config.maxSizeBytes) {
      return true;
    }

    return false;
  }

  /**
   * Get global resource usage
   */
  getGlobalMetrics(): {
    totalTenants: number;
    totalKeys: number;
    totalSizeBytes: number;
    quotaExceededTenants: number;
  } {
    const allMetrics = Array.from(this.metrics.values());
    const quotaExceeded = allMetrics.filter((m) => m.quotaExceeded).length;

    return {
      totalTenants: this.tenants.size,
      totalKeys: allMetrics.reduce((sum, m) => sum + m.keysCount, 0),
      totalSizeBytes: allMetrics.reduce((sum, m) => sum + m.sizeBytes, 0),
      quotaExceededTenants: quotaExceeded,
    };
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    for (const tenant of this.tenants.values()) {
      await tenant.disconnect();
    }

    this.tenants.clear();
    this.metrics.clear();
  }

  /**
   * Record operation for tenant metrics
   */
  recordTenantOperation(
    tenantId: string,
    operation: string,
    hit: boolean,
    sizeBytes?: number
  ): void {
    const metrics = this.metrics.get(tenantId);
    if (!metrics) return;

    this.emit('tenantOperation', { tenantId, operation, hit, sizeBytes });

    metrics.operationsCount++;
    metrics.lastAccess = Date.now();

    if (sizeBytes !== undefined) {
      metrics.sizeBytes = Math.max(0, metrics.sizeBytes + sizeBytes);
    }

    // Update hit rate (simple moving average)
    const hitValue = hit ? 1 : 0;
    metrics.hitRate = metrics.hitRate * 0.9 + hitValue * 0.1;

    // Check quota
    const tenant = this.tenants.get(tenantId);
    if (tenant) {
      metrics.quotaExceeded = this.isTenantQuotaExceeded(tenantId);
    }
  }

  private initializeTenantMetrics(tenantId: string): void {
    this.metrics.set(tenantId, {
      id: tenantId,
      keysCount: 0,
      sizeBytes: 0,
      hitRate: 0,
      operationsCount: 0,
      lastAccess: Date.now(),
      quotaExceeded: false,
    });
  }

  private startMetricsCollection(): void {
    const interval = this.config.metricsIntervalMs || 30000; // 30 seconds default
    this.metricsTimer = setInterval(() => {
      this.collectTenantMetrics();
    }, interval);
  }

  private async collectTenantMetrics(): Promise<void> {
    for (const [tenantId, tenant] of this.tenants) {
      try {
        const stats = await tenant.getStats();
        const metrics = this.metrics.get(tenantId);

        if (metrics && stats) {
          metrics.keysCount = stats.itemCount;
          metrics.sizeBytes = stats.sizeBytes;
          metrics.quotaExceeded = this.isTenantQuotaExceeded(tenantId);
        }
      } catch (error) {
        this.logger.warn('Failed to collect tenant metrics', { tenantId, error });
      }
    }
  }
}

/**
 * Tenant-specific cache instance
 * Wraps CacheManager with tenant-specific configuration and limits
 */
export class TenantCacheInstance {
  private cacheManager: CacheManager;
  private config: TenantConfig;

  constructor(
    private tenantId: string,
    config: TenantConfig,
    redisConfig: RedisConfig,
    poolConfig: ConnectionPoolConfig,
    keyConfig: CacheKeyConfig,
    ttlConfig: TTLConfig,
    private parentManager: MultiTenantCacheManager
  ) {
    this.config = { ...config };
    this.cacheManager = new CacheManager(redisConfig, poolConfig, keyConfig, ttlConfig);
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    this.checkQuota();
    const result = await this.cacheManager.get<T>(key);

    this.parentManager.recordTenantOperation(
      this.tenantId,
      'get',
      result !== null,
      result ? this.estimateSize(result) : 0
    );

    return result;
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, options?: any): Promise<void> {
    this.checkQuota();

    const sizeBytes = this.estimateSize(value);
    if (this.config.maxSizeBytes && sizeBytes > this.config.maxSizeBytes) {
      throw new Error(`Value size ${sizeBytes} exceeds tenant quota`);
    }

    await this.cacheManager.set(key, value, options);
    this.parentManager.recordTenantOperation(this.tenantId, 'set', true, sizeBytes);
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<boolean> {
    const result = await this.cacheManager.delete(key);
    if (result) {
      this.parentManager.recordTenantOperation(this.tenantId, 'delete', true);
    }
    return result;
  }

  /**
   * Get or set value
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, options?: any): Promise<T> {
    this.checkQuota();
    return this.cacheManager.getOrSet(key, fn, options);
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Connect to cache
   */
  async connect(): Promise<void> {
    await this.cacheManager.connect();
  }

  /**
   * Disconnect from cache
   */
  async disconnect(): Promise<void> {
    await this.cacheManager.disconnect();
  }

  /**
   * Get tenant configuration
   */
  getConfig(): TenantConfig {
    return { ...this.config };
  }

  /**
   * Update tenant configuration
   */
  updateConfig(updates: Partial<TenantConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  private checkQuota(): void {
    if (this.parentManager.isTenantQuotaExceeded(this.tenantId)) {
      const policy = this.parentManager['config'].quotaPolicy || 'strict';

      switch (policy) {
        case 'strict':
          throw new Error(`Tenant ${this.tenantId} quota exceeded`);
        case 'warning':
          // Log warning but allow operation
          console.warn(`Tenant ${this.tenantId} quota exceeded`);
          break;
        case 'soft':
          // Allow but throttle
          // Implementation would add delays here
          break;
      }
    }
  }

  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
}

/**
 * Factory functions
 */
export function createMultiTenantCacheManager(
  redisConfig: RedisConfig,
  poolConfig: ConnectionPoolConfig,
  keyConfig: CacheKeyConfig,
  ttlConfig: TTLConfig,
  config: MultiTenantConfig
): MultiTenantCacheManager {
  return new MultiTenantCacheManager(redisConfig, poolConfig, keyConfig, ttlConfig, config);
}

export function createTenantCache(
  tenantId: string,
  config: TenantConfig,
  redisConfig: RedisConfig,
  poolConfig: ConnectionPoolConfig,
  keyConfig: CacheKeyConfig,
  ttlConfig: TTLConfig
): TenantCacheInstance {
  const { id: _ignoredTenantId, ...defaultTenant } = config;
  const manager = new MultiTenantCacheManager(redisConfig, poolConfig, keyConfig, ttlConfig, {
    defaultTenant,
  });

  const tenant = manager.getTenantCache(tenantId);
  tenant.updateConfig({ ...defaultTenant, id: tenantId });
  return tenant;
}
