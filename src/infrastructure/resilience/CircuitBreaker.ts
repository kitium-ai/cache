/**
 * Circuit Breaker Pattern Implementation
 * Provides resilience against cascading failures
 * Inspired by Netflix Hystrix and resilience4j
 */

import { getLogger } from '@kitiumai/logger';
import { EventEmitter } from 'node:events';

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
  /** Timeout in milliseconds for half-open state */
  timeoutMs: number;
  /** Window size for tracking failures */
  monitoringPeriodMs: number;
  /** Expected exception types to count as failures */
  expectedExceptions?: string[];
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  timeouts: number;
  rejections: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

/**
 * Circuit Breaker implementation
 * Prevents cascading failures by failing fast when backend is unhealthy
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private timeouts: number = 0;
  private rejections: number = 0;
  private lastFailureTime: number | undefined;
  private lastSuccessTime: number | undefined;
  private halfOpenTimeout: NodeJS.Timeout | undefined;

  private logger = getLogger().child({ component: 'circuit-breaker' });

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {
    super();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      this.rejections++;
      this.emit('rejected', { name: this.name, state: this.state });
      throw new CircuitBreakerError(`Circuit breaker '${this.name}' is OPEN`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const metrics: CircuitBreakerMetrics = {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      timeouts: this.timeouts,
      rejections: this.rejections,
    };

    if (this.lastFailureTime !== undefined) {
      metrics.lastFailureTime = this.lastFailureTime;
    }
    if (this.lastSuccessTime !== undefined) {
      metrics.lastSuccessTime = this.lastSuccessTime;
    }

    return metrics;
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Manually close the circuit
   */
  close(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.resetMetrics();
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.clearHalfOpenTimeout();
    this.state = CircuitState.CLOSED;
    this.resetMetrics();
    this.emit('reset', { name: this.name });
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.resetMetrics();
      }
    }

    this.emit('success', { name: this.name, successes: this.successes });
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    // Check if this is an expected exception
    const isExpectedException = this.isExpectedException(error);

    if (isExpectedException && this.state === CircuitState.CLOSED) {
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state immediately opens the circuit
      this.transitionTo(CircuitState.OPEN);
    }

    this.emit('failure', {
      name: this.name,
      error: error.message,
      failures: this.failures,
      isExpected: isExpectedException,
    });
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    this.logger.info('Circuit breaker state transition', {
      name: this.name,
      from: oldState,
      to: newState,
    });

    this.emit('stateChange', {
      name: this.name,
      from: oldState,
      to: newState,
    });

    if (newState === CircuitState.OPEN) {
      this.scheduleHalfOpenTimeout();
    } else if (newState === CircuitState.CLOSED) {
      this.clearHalfOpenTimeout();
    }
  }

  private scheduleHalfOpenTimeout(): void {
    this.clearHalfOpenTimeout();
    this.halfOpenTimeout = setTimeout(() => {
      this.transitionTo(CircuitState.HALF_OPEN);
      this.successes = 0; // Reset success counter for half-open testing
    }, this.config.timeoutMs);
  }

  private clearHalfOpenTimeout(): void {
    if (this.halfOpenTimeout) {
      clearTimeout(this.halfOpenTimeout);
      this.halfOpenTimeout = undefined;
    }
  }

  private resetMetrics(): void {
    this.failures = 0;
    this.successes = 0;
    this.timeouts = 0;
    this.rejections = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }

  private isExpectedException(error: Error): boolean {
    if (!this.config.expectedExceptions) return true;

    const errorName = error.constructor.name;
    return this.config.expectedExceptions.includes(errorName);
  }
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry extends EventEmitter {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Create or get a circuit breaker
   */
  getOrCreate(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);

      // Forward events from individual breakers
      breaker.on('stateChange', (event) => this.emit('stateChange', event));
      breaker.on('success', (event) => this.emit('success', event));
      breaker.on('failure', (event) => this.emit('failure', event));
      breaker.on('rejected', (event) => this.emit('rejected', event));
      breaker.on('reset', (event) => this.emit('reset', event));
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get circuit breaker by name
   */
  getBreaker(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get registry metrics
   */
  getRegistryMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }
}

/**
 * Cache-specific circuit breaker with Redis-aware configuration
 */
export class CacheCircuitBreaker extends CircuitBreaker {
  constructor(name: string, customConfig?: Partial<CircuitBreakerConfig>) {
    const defaultConfig: CircuitBreakerConfig = {
      failureThreshold: 5, // Open after 5 failures
      successThreshold: 3, // Close after 3 successes in half-open
      timeoutMs: 60000, // 1 minute timeout
      monitoringPeriodMs: 60000, // 1 minute monitoring window
      expectedExceptions: ['RedisConnectionError', 'TimeoutError', 'CircuitBreakerError'],
      ...customConfig,
    };

    super(name, defaultConfig);
  }
}

/**
 * Factory functions
 */
export function createCircuitBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(name, config);
}

export function createCacheCircuitBreaker(
  name: string,
  customConfig?: Partial<CircuitBreakerConfig>
): CacheCircuitBreaker {
  return new CacheCircuitBreaker(name, customConfig);
}

export function createCircuitBreakerRegistry(): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry();
}
