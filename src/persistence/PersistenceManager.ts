/**
 * Persistence & Backup Manager
 * Handles cache persistence, snapshots, and recovery
 * Supports point-in-time recovery and backup strategies
 */

import { EventEmitter } from 'node:events';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

import { getLogger } from '@kitiumai/logger';

import type { CacheManager } from '../CacheManager';

export type BackupConfig = {
  /** Backup directory */
  directory: string;
  /** Maximum number of backups to keep */
  maxBackups: number;
  /** Compression enabled */
  compression: boolean;
  /** Backup schedule (cron expression) */
  schedule?: string;
  /** Include metadata */
  includeMetadata: boolean;
}

export type BackupMetadata = {
  id: string;
  timestamp: number;
  version: string;
  totalKeys: number;
  totalSizeBytes: number;
  compression: boolean;
  checksum: string;
  duration: number;
}

export type RestoreOptions = {
  /** Validate checksum after restore */
  validateChecksum: boolean;
  /** Overwrite existing keys */
  overwrite: boolean;
  /** Dry run mode */
  dryRun: boolean;
  /** Progress callback */
  onProgress?: (progress: { current: number; total: number; key: string }) => void;
}

/**
 * Persistence manager for cache backup and restore
 */
export class PersistenceManager extends EventEmitter {
  private readonly logger = getLogger().child({ component: 'persistence' });
  private backupTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly cacheManager: CacheManager,
    private readonly config: BackupConfig
  ) {
    super();
    void this.ensureBackupDirectory();
  }

  /**
   * Create a backup of current cache state
   */
  async createBackup(name?: string): Promise<BackupMetadata> {
    const startTime = Date.now();
    const backupId = name ?? `backup_${Date.now()}`;
    const { backupPath, metaPath } = this.getBackupPaths(backupId);

    this.logger.info('Starting cache backup', { backupId });

    try {
      const [stats, keys] = await Promise.all([this.cacheManager.getStats(), this.getAllKeys()]);
      const metadata = this.buildBackupMetadata({
        backupId,
        timestamp: Date.now(),
        totalKeys: keys.length,
        totalSizeBytes: stats.sizeBytes,
      });

      const { dataStream, done } = this.createBackupDataStream(backupPath);
      await this.writeBackupData(dataStream, metadata, keys);
      dataStream.end();
      await done;

      return await this.finalizeBackup({ backupPath, metaPath, metadata, startTime });
    } catch (error) {
      this.logger.error('Backup failed', { backupId, error }, this.toError(error));
      throw error;
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId: string, options: Partial<RestoreOptions> = {}): Promise<void> {
    const resolvedOptions = this.normalizeRestoreOptions(options);

    const { backupPath, metaPath } = this.getBackupPaths(backupId);

    this.logger.info('Starting cache restore', { backupId, options: resolvedOptions });

    try {
      const metadata = await this.loadBackupMetadata(metaPath);
      await this.validateBackupChecksum(backupId, backupPath, metadata, resolvedOptions);

      const dataStream = this.createRestoreReadStream(backupPath, metadata);
      const { restoredKeys } = await this.restoreFromStream(dataStream, metadata, resolvedOptions);

      this.emit('restoreCompleted', { backupId, restoredKeys });
      this.logger.info('Restore completed', { backupId, restoredKeys });
    } catch (error) {
      this.logger.error('Restore failed', { backupId, error }, this.toError(error));
      throw error;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    const files = await fs.readdir(this.config.directory);
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      if (file.endsWith('.meta.json')) {
        try {
          const metaPath = path.join(this.config.directory, file);
          const content = await fs.readFile(metaPath, 'utf8');
          const metadata = JSON.parse(content);
          backups.push(metadata);
        } catch (error) {
          this.logger.warn('Failed to read backup metadata', { file, error });
        }
      }
    }

    return backups.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    const backupPath = path.join(this.config.directory, `${backupId}.cache`);
    const metaPath = path.join(this.config.directory, `${backupId}.meta.json`);

    try {
      await fs.unlink(backupPath);
    } catch (error) {
      this.logger.warn('Failed to delete backup file', { backupId, error });
    }

    try {
      await fs.unlink(metaPath);
    } catch (error) {
      this.logger.warn('Failed to delete backup metadata', { backupId, error });
    }

    this.emit('backupDeleted', { backupId });
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    totalSizeBytes: number;
    oldestBackup?: number;
    newestBackup?: number;
  }> {
    const backups = await this.listBackups();
    let totalSizeBytes = 0;

    for (const backup of backups) {
      totalSizeBytes += backup.totalSizeBytes;
    }

    const result: {
      totalBackups: number;
      totalSizeBytes: number;
      oldestBackup?: number;
      newestBackup?: number;
    } = {
      totalBackups: backups.length,
      totalSizeBytes,
    };

    const oldestBackup = backups.length > 0 ? backups[backups.length - 1] : undefined;
    const newestBackup = backups.length > 0 ? backups[0] : undefined;
    if (oldestBackup) {
      result.oldestBackup = oldestBackup.timestamp;
    }
    if (newestBackup) {
      result.newestBackup = newestBackup.timestamp;
    }

    return result;
  }

  /**
   * Schedule automatic backups
   */
  scheduleBackups(cronExpression: string): void {
    // In a real implementation, this would use node-cron or similar
    // For now, just set up a simple interval
    const intervalMs = this.parseCronToInterval(cronExpression);

    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }

    this.backupTimer = setInterval(() => {
      void (async () => {
        try {
          await this.createBackup();
        } catch (error) {
          this.logger.error('Scheduled backup failed', { error }, this.toError(error));
        }
      })();
    }, intervalMs);
  }

  /**
   * Stop automatic backups
   */
  stopScheduledBackups(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = undefined;
    }
  }

  private toError(error: unknown): Error | undefined {
    return error instanceof Error ? error : undefined;
  }

  private getAllKeys(): Promise<string[]> {
    // This is a simplified implementation
    // In a real Redis setup, you might use SCAN
    return Promise.resolve([]);
  }

  private buildBackupMetadata(input: {
    backupId: string;
    timestamp: number;
    totalKeys: number;
    totalSizeBytes: number;
  }): BackupMetadata {
    return {
      id: input.backupId,
      timestamp: input.timestamp,
      version: '1.0.0',
      totalKeys: input.totalKeys,
      totalSizeBytes: input.totalSizeBytes,
      compression: this.config.compression,
      checksum: '',
      duration: 0,
    };
  }

  private async finalizeBackup(input: {
    backupPath: string;
    metaPath: string;
    metadata: BackupMetadata;
    startTime: number;
  }): Promise<BackupMetadata> {
    input.metadata.checksum = await this.calculateChecksum(input.backupPath);
    input.metadata.duration = Date.now() - input.startTime;

    if (this.config.includeMetadata) {
      await fs.writeFile(input.metaPath, JSON.stringify(input.metadata, null, 2));
    }

    await this.cleanupOldBackups();

    this.emit('backupCompleted', input.metadata);
    this.logger.info('Backup completed', { backupId: input.metadata.id, duration: input.metadata.duration });

    return input.metadata;
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async cleanupOldBackups(): Promise<void> {
    const backups = await this.listBackups();

    if (backups.length > this.config.maxBackups) {
      const toDelete = backups.slice(this.config.maxBackups);
      for (const backup of toDelete) {
        await this.deleteBackup(backup.id);
      }
    }
  }

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.directory, { recursive: true });
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (errorCode !== 'EEXIST') {
        throw error;
      }
    }
  }

  private getBackupPaths(backupId: string): { backupPath: string; metaPath: string } {
    return {
      backupPath: path.join(this.config.directory, `${backupId}.cache`),
      metaPath: path.join(this.config.directory, `${backupId}.meta.json`),
    };
  }

  private createBackupDataStream(backupPath: string): {
    dataStream: NodeJS.WritableStream;
    done: Promise<void>;
  } {
    const writeStream = createWriteStream(backupPath);
    if (!this.config.compression) {
      return { dataStream: writeStream, done: finished(writeStream) };
    }

    const gzipStream = createGzip();
    gzipStream.pipe(writeStream);
    return { dataStream: gzipStream, done: finished(writeStream) };
  }

  private async writeBackupData(
    stream: NodeJS.WritableStream,
    metadata: BackupMetadata,
    keys: string[],
  ): Promise<void> {
    if (this.config.includeMetadata) {
      stream.write(`${JSON.stringify(metadata)}\n`);
    }

    let processedKeys = 0;
    for (const key of keys) {
      const value = await this.safeGetCacheValue(key);
      if (value !== null) {
        stream.write(`${JSON.stringify({ key, value })}\n`);
      }

      processedKeys += 1;
      if (processedKeys % 100 === 0) {
        this.emit('backupProgress', { backupId: metadata.id, processed: processedKeys, total: keys.length });
      }
    }
  }

  private async safeGetCacheValue(key: string): Promise<unknown | null> {
    try {
      return await this.cacheManager.get(key);
    } catch (error) {
      this.logger.warn('Failed to backup key', { key, error });
      return null;
    }
  }

  private normalizeRestoreOptions(options: Partial<RestoreOptions>): RestoreOptions {
    return {
      validateChecksum: true,
      overwrite: true,
      dryRun: false,
      ...options,
    };
  }

  private async loadBackupMetadata(metaPath: string): Promise<BackupMetadata | undefined> {
    try {
      const metaContent = await fs.readFile(metaPath, 'utf8');
      return JSON.parse(metaContent) as BackupMetadata;
    } catch {
      return undefined;
    }
  }

  private async validateBackupChecksum(
    backupId: string,
    backupPath: string,
    metadata: BackupMetadata | undefined,
    options: RestoreOptions,
  ): Promise<void> {
    if (!options.validateChecksum || !metadata?.checksum) {
      return;
    }

    const actualChecksum = await this.calculateChecksum(backupPath);
    if (actualChecksum !== metadata.checksum) {
      throw new Error(`Checksum validation failed for backup ${backupId}`);
    }
  }

  private createRestoreReadStream(
    backupPath: string,
    metadata: BackupMetadata | undefined,
  ): NodeJS.ReadableStream {
    const readStream = createReadStream(backupPath);
    if (metadata?.compression) {
      return readStream.pipe(createGunzip());
    }
    return readStream;
  }

  private async restoreFromStream(
    stream: NodeJS.ReadableStream,
    metadata: BackupMetadata | undefined,
    options: RestoreOptions,
  ): Promise<{ restoredKeys: number }> {
    let restoredKeys = 0;
    for await (const line of this.readLines(stream)) {
      const entry = this.parseBackupLine(line);
      if (!entry) {
        continue;
      }
      if (entry.kind === 'metadata') {
        continue;
      }

      const didRestore = await this.restoreEntry(entry.key, entry.value, options);
      if (didRestore) {
        restoredKeys += 1;
      }

      options.onProgress?.({
        current: restoredKeys,
        total: metadata?.totalKeys ?? 0,
        key: entry.key,
      });
    }

    return { restoredKeys };
  }

  private async *readLines(stream: NodeJS.ReadableStream): AsyncGenerator<string> {
    let buffer = '';
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          yield trimmed;
        }
      }
    }
  }

  private parseBackupLine(
    line: string,
  ): { kind: 'metadata' } | { kind: 'entry'; key: string; value: unknown } | null {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const record = parsed as Record<string, unknown>;
      if (typeof record['id'] === 'string' && typeof record['timestamp'] === 'number') {
        return { kind: 'metadata' };
      }

      if (typeof record['key'] === 'string') {
        return { kind: 'entry', key: record['key'], value: record['value'] };
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to parse backup entry', { line, error });
      return null;
    }
  }

  private async restoreEntry(
    key: string,
    value: unknown,
    options: RestoreOptions,
  ): Promise<boolean> {
    if (options.dryRun) {
      this.logger.debug('Would restore key', { key });
      return true;
    }

    if (!options.overwrite) {
      const hasKey = await this.cacheManager.exists(key);
      if (hasKey) {
        return false;
      }
    }

    await this.cacheManager.set(key, value);
    return true;
  }

  private parseCronToInterval(cronExpression: string): number {
    // Very simplified cron parsing - just support basic intervals
    // In production, use a proper cron parser
    const parts = cronExpression.split(' ');
    if (parts.length >= 1) {
      const minute = parts[0];
      if (!minute) {
        return 60 * 60 * 1000;
      }
      if (minute === '*' || minute === '*/1') {
        return 60 * 1000; // 1 minute
      }
      if (minute.startsWith('*/')) {
        const interval = parseInt(minute.substring(2), 10);
        return interval * 60 * 1000;
      }
    }
    return 60 * 60 * 1000; // Default 1 hour
  }
}

/**
 * Chaos Engineering Tools
 * Simulate failures and performance degradation for testing
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
}

export type ChaosEvent = {
  type: 'latency_injected' | 'failure_injected' | 'corruption_applied' | 'partition_simulated';
  timestamp: number;
  operation: string;
  details: Record<string, unknown>;
}

/**
 * Chaos engineering orchestrator for cache testing
 */
export class ChaosOrchestrator extends EventEmitter {
  private readonly logger = getLogger().child({ component: 'chaos' });
  private readonly activePartitions = new Map<string, number>();

  constructor(private config: ChaosConfig) {
    super();
  }

  /**
   * Apply chaos to a cache operation
   */
  async applyChaos<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    // Check for network partition
    if (this.shouldInjectChaos(this.config.networkPartition?.probability)) {
      this.simulateNetworkPartition(operation);
      throw new Error(`Network partition simulated for ${operation}`);
    }

    // Inject latency
    if (this.shouldInjectChaos(this.config.latencyInjection?.probability)) {
      await this.injectLatency(operation);
    }

    // Inject failure
    if (this.shouldInjectChaos(this.config.failureProbability)) {
      this.emitChaosEvent('failure_injected', operation, context);
      throw new Error(`Chaos failure injected for ${operation}`);
    }

    // Execute operation with potential data corruption
    const result = await fn();

    if (
      this.config.dataCorruption &&
      this.shouldInjectChaos(this.config.dataCorruption.probability)
    ) {
      const corruptedResult = this.corruptData(result, this.config.dataCorruption.corruptionType);
      this.emitChaosEvent('corruption_applied', operation, {
        ...context,
        originalType: typeof result,
        corruptionType: this.config.dataCorruption.corruptionType,
      });
      return corruptedResult;
    }

    return result;
  }

  /**
   * Enable chaos mode
   */
  enable(): void {
    this.config.enabled = true;
    this.logger.warn('Chaos engineering enabled');
  }

  /**
   * Disable chaos mode
   */
  disable(): void {
    this.config.enabled = false;
    this.activePartitions.clear();
    this.logger.info('Chaos engineering disabled');
  }

  /**
   * Update chaos configuration
   */
  updateConfig(newConfig: Partial<ChaosConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Chaos configuration updated', { config: this.config });
  }

  /**
   * Get current chaos statistics
   */
  getChaosStats(): {
    enabled: boolean;
    activePartitions: number;
    config: ChaosConfig;
    } {
    return {
      enabled: this.config.enabled,
      activePartitions: this.activePartitions.size,
      config: this.config,
    };
  }

  private shouldInjectChaos(probability?: number): boolean {
    if (probability === undefined || probability <= 0) {
      return false;
    }
    return Math.random() < probability;
  }

  private async injectLatency(operation: string): Promise<void> {
    const latency = this.config.latencyInjection;
    if (!latency) {
      return;
    }
    const delay = Math.random() * (latency.maxMs - latency.minMs) + latency.minMs;

    this.emitChaosEvent('latency_injected', operation, { delayMs: delay });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delay);
    });
  }

  private simulateNetworkPartition(operation: string): void {
    const partition = this.config.networkPartition;
    if (!partition) {
      return;
    }
    const partitionId = `${operation}_${Date.now()}`;

    this.activePartitions.set(partitionId, Date.now() + partition.durationMs);
    this.emitChaosEvent('partition_simulated', operation, {
      durationMs: partition.durationMs,
      partitionId,
    });

    // Clean up expired partitions
    const now = Date.now();
    for (const [id, expiry] of this.activePartitions) {
      if (now > expiry) {
        this.activePartitions.delete(id);
      }
    }
  }

  private corruptData<T>(data: T, corruptionType: string): T {
    switch (corruptionType) {
      case 'flip_bits':
        return this.flipBits(data);
      case 'truncate':
        return this.truncateData(data);
      case 'garbage':
        return this.injectGarbage(data);
      default:
        return data;
    }
  }

  private xorNumber(left: number, right: number): number {
    let result = 0;
    let bitValue = 1;
    let leftRemaining = Math.trunc(left);
    let rightRemaining = Math.trunc(right);

    for (let index = 0; index < 32; index++) {
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

  private flipBits<T>(data: T): T {
    if (typeof data === 'string') {
      const chars = data.split('');
      const randomIndex = Math.floor(Math.random() * chars.length);
      const currentCharCode = chars[randomIndex]?.charCodeAt(0);
      if (currentCharCode !== undefined) {
        const toggledCharCode =
          currentCharCode % 2 === 0 ? currentCharCode + 1 : currentCharCode - 1;
        chars[randomIndex] = String.fromCharCode(toggledCharCode);
      }
      return chars.join('') as unknown as T;
    }
    if (typeof data === 'number') {
      const mask = Math.floor(Math.random() * 256);
      return this.xorNumber(data, mask) as T;
    }
    return data;
  }

  private truncateData<T>(data: T): T {
    if (typeof data === 'string' && data.length > 1) {
      return data.substring(0, Math.floor(data.length / 2)) as T;
    }
    if (Array.isArray(data) && data.length > 1) {
      return data.slice(0, Math.floor(data.length / 2)) as T;
    }
    return data;
  }

  private injectGarbage<T>(data: T): T {
    if (typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>;
      return {
        ...record,
        chaosCorrupted: true,
        chaosGarbage: Math.random().toString(36),
      } as T;
    }
    return data;
  }

  private emitChaosEvent(
    type: ChaosEvent['type'],
    operation: string,
    details?: Record<string, unknown>
  ): void {
    const event: ChaosEvent = {
      type,
      timestamp: Date.now(),
      operation,
      details: details ?? {},
    };

    this.emit('chaosEvent', event);
    this.logger.debug('Chaos event emitted', event);
  }
}

/**
 * Factory functions
 */
export function createPersistenceManager(
  cacheManager: CacheManager,
  config: BackupConfig
): PersistenceManager {
  return new PersistenceManager(cacheManager, config);
}

export function createChaosOrchestrator(config: ChaosConfig): ChaosOrchestrator {
  return new ChaosOrchestrator(config);
}
