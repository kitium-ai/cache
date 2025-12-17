/**
 * Distributed Tracing Integration
 * OpenTelemetry-based tracing for cache operations
 * Provides observability into cache performance and behavior
 */

import { context, metrics, trace, Span, SpanStatusCode, Tracer } from '@opentelemetry/api';
import type { Counter, Histogram } from '@opentelemetry/api';

export interface TracingConfig {
  /** Service name for traces */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Whether tracing is enabled */
  enabled: boolean;
  /** Sample rate (0.0 to 1.0) */
  sampleRate?: number;
  /** Custom tracer instance */
  tracer?: Tracer;
}

export interface CacheSpanTags {
  operation: string;
  key?: string;
  keys?: string[];
  hit?: boolean;
  ttl?: number;
  size?: number;
  strategy?: string;
  error?: string;
}

/**
 * Distributed tracing manager for cache operations
 * Integrates with OpenTelemetry to provide observability
 */
export class CacheTracingManager {
  private readonly tracer: Tracer | undefined;
  private readonly enabled: boolean;

  // Metrics
  private readonly operationCounter: Counter | undefined;
  private readonly operationDuration: Histogram | undefined;
  private readonly cacheHitsCounter: Counter | undefined;
  private readonly cacheMissesCounter: Counter | undefined;

  constructor(config: TracingConfig) {
    this.enabled = config.enabled;

    if (this.enabled) {
      this.tracer =
        config.tracer || trace.getTracer(config.serviceName, config.serviceVersion || '1.0.0');
      const meter = metrics.getMeter(config.serviceName, config.serviceVersion || '1.0.0');

      this.operationCounter = meter.createCounter('cache_operations_total', {
        description: 'Total number of cache operations',
      });

      this.operationDuration = meter.createHistogram('cache_operation_duration_ms', {
        description: 'Duration of cache operations in milliseconds',
      });

      this.cacheHitsCounter = meter.createCounter('cache_hits_total', {
        description: 'Total number of cache hits',
      });

      this.cacheMissesCounter = meter.createCounter('cache_misses_total', {
        description: 'Total number of cache misses',
      });
    }
  }

  /**
   * Create a span for a cache operation
   */
  startSpan(operation: string, tags?: Partial<CacheSpanTags>): Span | undefined {
    if (!this.enabled || !this.tracer) return undefined;

    const span = this.tracer.startSpan(`cache.${operation}`, {
      attributes: {
        'cache.operation': operation,
        ...this.convertTagsToAttributes(tags),
      },
    });

    return span;
  }

  /**
   * End a span with optional error
   */
  endSpan(span: Span | undefined, error?: Error): void {
    if (!span) return;

    if (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
  }

  /**
   * Wrap a cache operation with tracing
   */
  async traceOperation<T>(
    operation: string,
    fn: (span?: Span) => Promise<T>,
    tags?: Partial<CacheSpanTags>
  ): Promise<T> {
    const span = this.startSpan(operation, tags);
    const startTime = Date.now();

    try {
      const result = await fn(span);

      // Record metrics
      this.recordMetrics(operation, Date.now() - startTime, tags);

      this.endSpan(span);
      return result;
    } catch (error) {
      // Record error metrics
      this.recordMetrics(operation, Date.now() - startTime, {
        ...tags,
        error: (error as Error).message,
      });

      this.endSpan(span, error as Error);
      throw error;
    }
  }

  /**
   * Add tags to an existing span
   */
  addTags(span: Span | undefined, tags: Partial<CacheSpanTags>): void {
    if (!span) return;

    span.setAttributes(this.convertTagsToAttributes(tags));
  }

  /**
   * Create a child span
   */
  createChildSpan(
    parentSpan: Span | undefined,
    operation: string,
    tags?: Partial<CacheSpanTags>
  ): Span | undefined {
    if (!this.enabled || !this.tracer || !parentSpan) return undefined;

    const parentContext = trace.setSpan(context.active(), parentSpan);
    const span = this.tracer.startSpan(
      `cache.${operation}`,
      {
        attributes: {
          'cache.operation': operation,
          ...this.convertTagsToAttributes(tags),
        },
      },
      parentContext
    );

    return span;
  }

  /**
   * Record cache hit
   */
  recordHit(operation: string = 'get'): void {
    if (!this.enabled) return;

    this.cacheHitsCounter?.add(1, {
      operation,
    });
  }

  /**
   * Record cache miss
   */
  recordMiss(operation: string = 'get'): void {
    if (!this.enabled) return;

    this.cacheMissesCounter?.add(1, {
      operation,
    });
  }

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private recordMetrics(operation: string, duration: number, tags?: Partial<CacheSpanTags>): void {
    if (!this.enabled) return;

    // Operation counter
    this.operationCounter?.add(1, {
      operation,
      hit: tags?.hit?.toString(),
      error: tags?.error ? 'true' : 'false',
    });

    // Operation duration
    this.operationDuration?.record(duration, {
      operation,
      hit: tags?.hit?.toString(),
    });
  }

  private convertTagsToAttributes(
    tags?: Partial<CacheSpanTags>
  ): Record<string, string | number | boolean> {
    if (!tags) return {};

    const attributes: Record<string, string | number | boolean> = {};

    if (tags.operation) attributes['cache.operation'] = tags.operation;
    if (tags.key) attributes['cache.key'] = tags.key;
    if (tags.keys) attributes['cache.keys'] = tags.keys.join(',');
    if (tags.hit !== undefined) attributes['cache.hit'] = tags.hit;
    if (tags.ttl) attributes['cache.ttl'] = tags.ttl;
    if (tags.size) attributes['cache.size'] = tags.size;
    if (tags.strategy) attributes['cache.strategy'] = tags.strategy;
    if (tags.error) attributes['cache.error'] = tags.error;

    return attributes;
  }
}

/**
 * Tracing-enabled cache operation wrapper
 */
export class TracedCacheOperation {
  constructor(private tracing: CacheTracingManager) {}

  /**
   * Wrap get operation
   */
  async get<T>(
    key: string,
    operation: () => Promise<T | null>,
    tags?: Partial<CacheSpanTags>
  ): Promise<T | null> {
    return this.tracing.traceOperation(
      'get',
      async (span) => {
        const result = await operation();
        this.tracing.addTags(span, {
          ...tags,
          key,
          hit: result !== null,
        });

        if (result !== null) {
          this.tracing.recordHit('get');
        } else {
          this.tracing.recordMiss('get');
        }

        return result;
      },
      { ...tags, key }
    );
  }

  /**
   * Wrap set operation
   */
  async set<T>(
    key: string,
    value: T,
    operation: () => Promise<void>,
    tags?: Partial<CacheSpanTags>
  ): Promise<void> {
    return this.tracing.traceOperation(
      'set',
      async (span) => {
        this.tracing.addTags(span, {
          ...tags,
          key,
          size: this.estimateSize(value),
        });
        return operation();
      },
      { ...tags, key }
    );
  }

  /**
   * Wrap delete operation
   */
  async delete(
    key: string,
    operation: () => Promise<boolean>,
    tags?: Partial<CacheSpanTags>
  ): Promise<boolean> {
    return this.tracing.traceOperation(
      'delete',
      async (span) => {
        this.tracing.addTags(span, { ...tags, key });
        return operation();
      },
      { ...tags, key }
    );
  }

  private estimateSize(value: any): number {
    try {
      // Rough estimation based on JSON string length
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
}

/**
 * Factory function to create tracing manager
 */
export function createCacheTracingManager(config: TracingConfig): CacheTracingManager {
  return new CacheTracingManager(config);
}

/**
 * Factory function to create traced operations
 */
export function createTracedCacheOperation(tracing: CacheTracingManager): TracedCacheOperation {
  return new TracedCacheOperation(tracing);
}
