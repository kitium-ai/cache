/**
 * Redis Cluster Support
 * Provides distributed caching with automatic sharding and failover
 * Compatible with Redis Cluster and Redis Enterprise
 */

import { EventEmitter } from 'node:events';

import { getLogger } from '@kitiumai/logger';
import type { RedisClientType } from 'redis';

import type { CacheOptions } from '../types';

const NO_AVAILABLE_CLUSTER_NODE_ERROR = 'No available cluster node';

export type ClusterNode = {
  host: string;
  port: number;
}

export type ClusterConfig = {
  /** Initial cluster nodes */
  nodes: ClusterNode[];
  /** Redis password */
  password?: string;
  /** Key prefix for this cluster */
  keyPrefix?: string;
  /** Maximum retry attempts for cluster operations */
  maxRetries?: number;
  /** Enable read from replicas */
  enableReadReplicas?: boolean;
  /** Cluster refresh interval in milliseconds */
  clusterRefreshIntervalMs?: number;
}

export type SlotRange = {
  start: number;
  end: number;
  master: ClusterNode;
  replicas: ClusterNode[];
}

/**
 * Redis Cluster Manager
 * Handles cluster topology discovery and request routing
 */
export class RedisClusterManager extends EventEmitter {
  private readonly slots: Map<number, SlotRange> = new Map();
  private readonly nodes: Map<string, RedisClientType> = new Map();
  private readonly logger = getLogger().child({ component: 'redis-cluster' });
  private refreshTimer?: NodeJS.Timeout;
  private lastRefreshTimestamp = 0;

  constructor(private readonly config: ClusterConfig) {
    super();
    this.startTopologyRefresh();
  }

  /**
   * Get the node responsible for a given key
   */
  getNodeForKey(key: string): ClusterNode | null {
    const slot = this.calculateSlot(key);
    const slotRange = this.findSlotRange(slot);
    return slotRange ? slotRange.master : null;
  }

  /**
   * Get a replica node for read operations (if enabled)
   */
  getReplicaForKey(key: string): ClusterNode | null {
    if (!this.config.enableReadReplicas) {
      return null;
    }

    const slot = this.calculateSlot(key);
    const slotRange = this.findSlotRange(slot);

    if (slotRange && slotRange.replicas.length > 0) {
      // Simple round-robin selection
      const replicaIndex = Math.floor(Math.random() * slotRange.replicas.length);
      return slotRange.replicas[replicaIndex] ?? null;
    }

    return null;
  }

  /**
   * Refresh cluster topology
   */
  async refreshTopology(): Promise<void> {
    try {
      if (this.config.nodes.length === 0) {
        throw new Error('No cluster nodes configured');
      }
      // Connect to a random node to get cluster info
      const randomNode = this.config.nodes[Math.floor(Math.random() * this.config.nodes.length)];
      if (!randomNode) {
        throw new Error(NO_AVAILABLE_CLUSTER_NODE_ERROR);
      }
      const client = await this.createClient(randomNode);

      const clusterSlots = await client.sendCommand(['CLUSTER', 'SLOTS']);
      await client.quit();

      this.updateSlots(clusterSlots);
      this.emit('topologyUpdated', { slotsCount: this.slots.size });

      this.logger.info('Cluster topology refreshed', { slotsCount: this.slots.size });
    } catch (error) {
      this.logger.error('Failed to refresh cluster topology', { error }, this.asError(error));
      this.emit('topologyRefreshError', error);
    }
  }

  /**
   * Execute command on appropriate cluster node
   */
  async executeCommand(
    command: string,
    args: Array<string | number>,
    key?: string
  ): Promise<unknown> {
    const maxRetries = this.config.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const node = key ? this.getNodeForKey(key) : this.getRandomNode();
        if (!node) {
          throw new Error(NO_AVAILABLE_CLUSTER_NODE_ERROR);
        }

        const client = await this.getOrCreateClient(node);
        return await client.sendCommand([command, ...args.map((value) => String(value))]);
      } catch (error) {
        lastError = this.asError(error);

        // Check if it's a MOVED or ASK error (cluster redirection)
        if (this.isRedirectionError(error)) {
          await this.refreshTopology();
          continue; // Retry with updated topology
        }

        this.logger.warn('Cluster command failed', { attempt, error, command });
      }
    }

    throw lastError ?? new Error('Cluster command failed after retries');
  }

  /**
   * Close all cluster connections
   */
  async close(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    for (const client of this.nodes.values()) {
      await client.quit();
    }

    this.nodes.clear();
    this.slots.clear();
  }

  /**
   * Get cluster statistics
   */
  getStats(): {
    totalSlots: number;
    nodesCount: number;
    topologyAge: number;
    } {
    return {
      totalSlots: this.slots.size,
      nodesCount: this.nodes.size,
      topologyAge: this.lastRefreshTimestamp ? Date.now() - this.lastRefreshTimestamp : 0,
    };
  }

  private calculateSlot(key: string): number {
    // CRC16-CCITT algorithm for Redis slot calculation
    const crc16 = this.crc16(key);
    return crc16 % 16384; // Redis has 16384 slots
  }

  private xor16(left: number, right: number): number {
    let result = 0;
    let bitValue = 1;
    let leftRemaining = left;
    let rightRemaining = right;

    for (let index = 0; index < 16; index++) {
      const leftBit = leftRemaining % 2;
      const rightBit = rightRemaining % 2;
      if (leftBit !== rightBit) {
        result += bitValue;
      }
      leftRemaining = Math.floor(leftRemaining / 2);
      rightRemaining = Math.floor(rightRemaining / 2);
      bitValue *= 2;
    }

    return result;
  }

  private crc16(data: string): number {
    const bytes = Buffer.from(data, 'utf8');
    let crc = 0;

    for (const byte of bytes) {
      crc = this.xor16(crc, byte * 256);
      for (let index = 0; index < 8; index++) {
        const isHighBitSet = crc >= 0x8000;
        const shifted = (crc * 2) % 0x10000;
        crc = isHighBitSet ? this.xor16(shifted, 0x1021) : shifted;
      }
    }

    return crc;
  }

  private findSlotRange(slot: number): SlotRange | undefined {
    for (const range of this.slots.values()) {
      if (slot >= range.start && slot <= range.end) {
        return range;
      }
    }
    return undefined;
  }

  private getRandomNode(): ClusterNode {
    const nodes = Array.from(this.slots.values()).map((range) => range.master);
    const candidates = nodes.length > 0 ? nodes : this.config.nodes;
    if (candidates.length === 0) {
      throw new Error(NO_AVAILABLE_CLUSTER_NODE_ERROR);
    }
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    if (!selected) {
      throw new Error(NO_AVAILABLE_CLUSTER_NODE_ERROR);
    }
    return selected;
  }

  private async getOrCreateClient(node: ClusterNode): Promise<RedisClientType> {
    const nodeKey = `${node.host}:${node.port}`;

    if (!this.nodes.has(nodeKey)) {
      const client = await this.createClient(node);
      this.nodes.set(nodeKey, client);
    }

    const client = this.nodes.get(nodeKey);
    if (!client) {
      throw new Error(`Failed to create redis client for ${nodeKey}`);
    }
    return client;
  }

  private async createClient(node: ClusterNode): Promise<RedisClientType> {
    const Redis = await import('redis');
    const client = Redis.createClient({
      socket: { host: node.host, port: node.port },
      ...(this.config.password ? { password: this.config.password } : {}),
    }) as RedisClientType;

    await client.connect();
    return client;
  }

  private updateSlots(clusterSlots: unknown): void {
    this.slots.clear();

    if (!Array.isArray(clusterSlots)) {
      this.lastRefreshTimestamp = Date.now();
      return;
    }

    for (const slotInfo of clusterSlots) {
      if (!Array.isArray(slotInfo)) {
        continue;
      }
      const [start, end, master, ...replicas] = slotInfo as unknown[];
      if (typeof start !== 'number' || typeof end !== 'number') {
        continue;
      }
      if (!Array.isArray(master) || typeof master[0] !== 'string' || typeof master[1] !== 'number') {
        continue;
      }

      const slotRange: SlotRange = {
        start: start,
        end: end,
        master: { host: master[0], port: master[1] },
        replicas: replicas
          .filter(
            (replica): replica is [string, number] =>
              Array.isArray(replica) &&
              typeof replica[0] === 'string' &&
              typeof replica[1] === 'number'
          )
          .map((replica) => ({ host: replica[0], port: replica[1] })),
      };

      // Store by start slot for easy lookup
      this.slots.set(start, slotRange);
    }

    this.lastRefreshTimestamp = Date.now();
  }

  private isRedirectionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : '';
    return message.includes('MOVED') || message.includes('ASK');
  }

  private asError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(typeof error === 'string' ? error : 'Unknown error');
  }

  private startTopologyRefresh(): void {
    const interval = this.config.clusterRefreshIntervalMs ?? 30000; // 30 seconds default
    this.refreshTimer = setInterval(() => {
      void this.refreshTopology();
    }, interval);
  }
}

/**
 * Cluster-aware Redis adapter
 * Routes requests to appropriate cluster nodes
 */
export class ClusterRedisAdapter {
  private readonly keyManager: { buildKey: (key: string) => string } | undefined;

  constructor(
    private readonly clusterManager: RedisClusterManager,
    keyManager: unknown,
    private readonly defaultTTL: number
  ) {
    this.keyManager = this.asKeyManagerLike(keyManager);
  }

  private asKeyManagerLike(value: unknown): { buildKey: (key: string) => string } | undefined {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }

    if (!('buildKey' in value)) {
      return undefined;
    }

    const buildKey = (value as Record<string, unknown>)['buildKey'];
    return typeof buildKey === 'function'
      ? (value as { buildKey: (key: string) => string })
      : undefined;
  }

  private buildKey(key: string): string {
    return this.keyManager?.buildKey(key) ?? key;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key);
    const result = await this.clusterManager.executeCommand('GET', [fullKey], fullKey);
    if (typeof result !== 'string') {
      return null;
    }

    return JSON.parse(result) as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key);
    const serializedValue = JSON.stringify(value);
    const ttl = options?.ttl ?? this.defaultTTL;

    if (ttl > 0) {
      await this.clusterManager.executeCommand('SETEX', [fullKey, ttl, serializedValue], fullKey);
    } else {
      await this.clusterManager.executeCommand('SET', [fullKey, serializedValue], fullKey);
    }
  }

  async delete(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const result = await this.clusterManager.executeCommand('DEL', [fullKey], fullKey);
    if (typeof result === 'number') {
      return result > 0;
    }

    if (typeof result === 'string') {
      return Number(result) > 0;
    }

    return false;
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const result = await this.clusterManager.executeCommand('EXISTS', [fullKey], fullKey);
    if (typeof result === 'number') {
      return result === 1;
    }
    if (typeof result === 'string') {
      return result === '1';
    }
    return false;
  }

  clear(): Promise<void> {
    // Note: FLUSHDB/FLUSHALL not supported in cluster mode
    // This would need to be implemented differently
    return Promise.reject(new Error('Clear operation not supported in cluster mode'));
  }

  getKeys(_pattern?: string): Promise<string[]> {
    // SCAN is not efficient in cluster mode
    // This would need a more sophisticated implementation
    return Promise.reject(new Error('Get keys operation not supported in cluster mode'));
  }

  async connect(): Promise<void> {
    await this.clusterManager.refreshTopology();
  }

  async disconnect(): Promise<void> {
    await this.clusterManager.close();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.clusterManager.executeCommand('PING', []);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create cluster manager
 */
export function createRedisClusterManager(config: ClusterConfig): RedisClusterManager {
  return new RedisClusterManager(config);
}

/**
 * Factory function to create cluster adapter
 */
export function createClusterRedisAdapter(
  clusterManager: RedisClusterManager,
  keyManager: unknown,
  defaultTTL: number
): ClusterRedisAdapter {
  return new ClusterRedisAdapter(clusterManager, keyManager, defaultTTL);
}
