/**
 * Advanced Performance Profiling
 * Comprehensive metrics collection and analysis
 * Provides insights into cache performance and optimization opportunities
 */

import { EventEmitter } from 'node:events';

export interface PerformanceProfile {
  id: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  key?: string;
  hit?: boolean;
  sizeBytes?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceMetrics {
  operation: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  errorCount: number;
  hitRate?: number;
  throughput: number; // operations per second
}

export interface CachePerformanceReport {
  summary: {
    totalOperations: number;
    totalDuration: number;
    avgOperationTime: number;
    overallHitRate: number;
    errorRate: number;
    timeRange: { start: number; end: number };
  };
  operations: PerformanceMetrics[];
  recommendations: string[];
  bottlenecks: string[];
}

export interface ProfilingConfig {
  /** Enable performance profiling */
  enabled: boolean;
  /** Sample rate (0.0 to 1.0) */
  sampleRate?: number;
  /** Maximum profiles to keep in memory */
  maxProfiles?: number;
  /** Metrics aggregation interval */
  aggregationIntervalMs?: number;
  /** Enable detailed memory profiling */
  enableMemoryProfiling?: boolean;
  /** Enable bottleneck detection */
  enableBottleneckDetection?: boolean;
}

/**
 * Advanced performance profiler for cache operations
 * Collects detailed metrics and provides optimization insights
 */
export class CachePerformanceProfiler extends EventEmitter {
  private profiles: PerformanceProfile[] = [];
  private metrics = new Map<string, PerformanceMetrics>();
  private aggregationTimer?: NodeJS.Timeout;

  constructor(private config: ProfilingConfig) {
    super();

    if (config.enabled) {
      this.startAggregation();
    }
  }

  /**
   * Start profiling an operation
   */
  startOperation(operation: string, key?: string, metadata?: Record<string, any>): string {
    if (!this.config.enabled) return '';

    const profileId = this.generateProfileId();
    const profile: PerformanceProfile = {
      id: profileId,
      operation,
      startTime: Date.now(),
    };

    if (key !== undefined) {
      profile.key = key;
    }
    if (metadata !== undefined) {
      profile.metadata = metadata;
    }

    this.profiles.push(profile);
    this.maintainProfileLimit();

    return profileId;
  }

  /**
   * End profiling an operation
   */
  endOperation(profileId: string, hit?: boolean, sizeBytes?: number, error?: Error): void {
    if (!this.config.enabled || !profileId) return;

    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) return;

    profile.endTime = Date.now();
    profile.duration = profile.endTime - profile.startTime;
    if (hit !== undefined) {
      profile.hit = hit;
    }
    if (sizeBytes !== undefined) {
      profile.sizeBytes = sizeBytes;
    }

    if (error) {
      profile.error = error.message;
    }

    this.emit('operationCompleted', profile);
  }

  /**
   * Record a completed operation directly
   */
  recordOperation(
    operation: string,
    duration: number,
    hit?: boolean,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enabled) return;

    const profile: PerformanceProfile = {
      id: this.generateProfileId(),
      operation,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      duration,
    };

    if (hit !== undefined) {
      profile.hit = hit;
    }
    if (error) {
      profile.error = error.message;
    }
    if (metadata !== undefined) {
      profile.metadata = metadata;
    }

    this.profiles.push(profile);
    this.maintainProfileLimit();

    this.emit('operationCompleted', profile);
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics for specific operation
   */
  getOperationMetrics(operation: string): PerformanceMetrics | undefined {
    return this.metrics.get(operation);
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(timeRangeMs?: number): CachePerformanceReport {
    const now = Date.now();
    const timeRange = timeRangeMs || 5 * 60 * 1000; // 5 minutes default
    const startTime = now - timeRange;

    // Filter profiles by time range
    const relevantProfiles = this.profiles.filter(
      (p) => p.startTime >= startTime && p.endTime && p.endTime <= now
    );

    // Calculate summary
    const totalOperations = relevantProfiles.length;
    const totalDuration = relevantProfiles.reduce((sum, p) => sum + (p.duration || 0), 0);
    const errorCount = relevantProfiles.filter((p) => p.error).length;
    const hitCount = relevantProfiles.filter((p) => p.hit === true).length;

    const summary = {
      totalOperations,
      totalDuration,
      avgOperationTime: totalOperations > 0 ? totalDuration / totalOperations : 0,
      overallHitRate: totalOperations > 0 ? hitCount / totalOperations : 0,
      errorRate: totalOperations > 0 ? errorCount / totalOperations : 0,
      timeRange: { start: startTime, end: now },
    };

    // Group by operation
    const operationGroups = new Map<string, PerformanceProfile[]>();
    for (const profile of relevantProfiles) {
      const group = operationGroups.get(profile.operation) || [];
      group.push(profile);
      operationGroups.set(profile.operation, group);
    }

    // Calculate per-operation metrics
    const operations: PerformanceMetrics[] = [];
    for (const [operation, profiles] of operationGroups) {
      operations.push(this.calculateOperationMetrics(operation, profiles));
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(operations, summary);
    const bottlenecks = this.detectBottlenecks(operations);

    return {
      summary,
      operations,
      recommendations,
      bottlenecks,
    };
  }

  /**
   * Reset all profiling data
   */
  reset(): void {
    this.profiles = [];
    this.metrics.clear();
  }

  /**
   * Clean up resources
   */
  close(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
    }
  }

  private generateProfileId(): string {
    return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private maintainProfileLimit(): void {
    const maxProfiles = this.config.maxProfiles || 10000;
    if (this.profiles.length > maxProfiles) {
      this.profiles = this.profiles.slice(-maxProfiles);
    }
  }

  private calculateOperationMetrics(
    operation: string,
    profiles: PerformanceProfile[]
  ): PerformanceMetrics {
    const firstProfile = profiles[0];
    if (!firstProfile) {
      return {
        operation,
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorCount: 0,
        throughput: 0,
      };
    }

    const durations = profiles.map((p) => p.duration || 0).sort((a, b) => a - b);
    const errorCount = profiles.filter((p) => p.error).length;
    const profilesWithHit = profiles.filter((p) => p.hit !== undefined);
    const hitCount = profilesWithHit.filter((p) => p.hit === true).length;
    const totalCount = profiles.length;

    const metrics: PerformanceMetrics = {
      operation,
      count: totalCount,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / totalCount,
      minDuration: durations[0] || 0,
      maxDuration: durations[durations.length - 1] || 0,
      p50Duration: this.calculatePercentile(durations, 50),
      p95Duration: this.calculatePercentile(durations, 95),
      p99Duration: this.calculatePercentile(durations, 99),
      errorCount,
      throughput: totalCount / (Math.max(1, Date.now() - firstProfile.startTime) / 1000), // ops per second
    };

    if (profilesWithHit.length > 0) {
      metrics.hitRate = hitCount / profilesWithHit.length;
    }

    return metrics;
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedArray[lower] ?? 0;
    }

    const weight = index - lower;
    const lowerValue = sortedArray[lower] ?? 0;
    const upperValue = sortedArray[upper] ?? lowerValue;
    return lowerValue * (1 - weight) + upperValue * weight;
  }

  private generateRecommendations(operations: PerformanceMetrics[], summary: any): string[] {
    const recommendations: string[] = [];

    // High latency operations
    const highLatencyOps = operations.filter((op) => op.avgDuration > 100); // 100ms threshold
    if (highLatencyOps.length > 0) {
      recommendations.push(
        `Consider optimizing high-latency operations: ${highLatencyOps.map((op) => op.operation).join(', ')}`
      );
    }

    // Low hit rate
    const lowHitRateOps = operations.filter((op) => op.hitRate && op.hitRate < 0.5);
    if (lowHitRateOps.length > 0) {
      recommendations.push(
        `Improve cache hit rates for: ${lowHitRateOps.map((op) => op.operation).join(', ')}`
      );
    }

    // High error rate
    if (summary.errorRate > 0.05) {
      // 5% threshold
      recommendations.push(
        'High error rate detected. Consider implementing retry logic or circuit breakers.'
      );
    }

    // Memory optimization
    if (this.config.enableMemoryProfiling) {
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed > memoryUsage.heapTotal * 0.8) {
        recommendations.push('High memory usage detected. Consider adjusting cache size limits.');
      }
    }

    return recommendations;
  }

  private detectBottlenecks(operations: PerformanceMetrics[]): string[] {
    const bottlenecks: string[] = [];

    // Slowest operations
    const sortedByLatency = operations.sort((a, b) => b.avgDuration - a.avgDuration);
    const slowest = sortedByLatency[0];
    if (slowest && slowest.avgDuration > 50) {
      // 50ms threshold
      bottlenecks.push(
        `${slowest.operation} is the slowest operation (${slowest.avgDuration.toFixed(2)}ms avg)`
      );
    }

    // High P99 latency
    const highP99Ops = operations.filter((op) => op.p99Duration > 200); // 200ms threshold
    if (highP99Ops.length > 0) {
      bottlenecks.push(`High P99 latency for: ${highP99Ops.map((op) => op.operation).join(', ')}`);
    }

    return bottlenecks;
  }

  private startAggregation(): void {
    const interval = this.config.aggregationIntervalMs || 30000; // 30 seconds default
    this.aggregationTimer = setInterval(() => {
      this.aggregateMetrics();
    }, interval);
  }

  private aggregateMetrics(): void {
    // Group profiles by operation
    const operationGroups = new Map<string, PerformanceProfile[]>();

    for (const profile of this.profiles) {
      const group = operationGroups.get(profile.operation) || [];
      group.push(profile);
      operationGroups.set(profile.operation, group);
    }

    // Update metrics for each operation
    for (const [operation, profiles] of operationGroups) {
      const metrics = this.calculateOperationMetrics(operation, profiles);
      this.metrics.set(operation, metrics);
    }

    this.emit('metricsUpdated', this.getMetrics());
  }
}

/**
 * Factory function to create performance profiler
 */
export function createCachePerformanceProfiler(config: ProfilingConfig): CachePerformanceProfiler {
  return new CachePerformanceProfiler(config);
}

/**
 * Utility function to measure operation performance
 */
export async function measureCacheOperation<T>(
  profiler: CachePerformanceProfiler,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const profileId = profiler.startOperation(operation, undefined, metadata);

  try {
    const result = await fn();
    profiler.endOperation(profileId, true);
    return result;
  } catch (error) {
    profiler.endOperation(profileId, false, undefined, error as Error);
    throw error;
  }
}
