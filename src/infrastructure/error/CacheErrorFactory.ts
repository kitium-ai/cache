/**
 * Cache Error Factory
 * Centralizes error creation, wrapping, and logging for cache operations
 * Eliminates DRY violation of repeated error handling blocks
 */

import { toKitiumError, type KitiumError } from '@kitiumai/error';
import type { IAdvancedLogger } from '@kitiumai/logger';

export interface CacheErrorContext {
  operation: string;
  key?: string | undefined;
  message: string;
  code: string;
  severity?: 'error';
  retryable?: boolean;
}

/**
 * Factory for creating consistent, properly-logged cache errors
 * Handles error wrapping, logging, and stats tracking in one place
 */
export class CacheErrorFactory {
  constructor(private readonly logger: IAdvancedLogger | ReturnType<any>) {}

  /**
   * Create and log a cache error
   */
  createError(context: CacheErrorContext): KitiumError {
    const kitiumError = toKitiumError(new Error(context.message), {
      code: context.code,
      message: context.message,
      severity: 'error',
      kind: 'dependency',
      retryable: context.retryable ?? true,
      source: '@kitiumai/cache',
    });

    this.logger.error(
      `${context.operation} failed`,
      kitiumError
    );

    return kitiumError;
  }

  /**
   * Wrap an existing error with cache-specific context and logging
   */
  wrapError(cause: unknown, context: CacheErrorContext): KitiumError {
    const kitiumError = toKitiumError(cause, {
      code: context.code,
      message: context.message,
      severity: 'error',
      kind: 'dependency',
      retryable: context.retryable ?? true,
      source: '@kitiumai/cache',
    });

    this.logger.error(
      `${context.operation} failed`,
      kitiumError
    );

    return kitiumError;
  }

  /**
   * Execute an async operation with consistent error handling
   * Automatically wraps errors with context-specific information
   */
  async execute<T>(
    context: Omit<CacheErrorContext, 'message'>,
    fn: () => Promise<T>,
    message?: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw this.wrapError(error, {
        ...context,
        message: message ?? context.operation,
      });
    }
  }

  /**
   * Create a connection-related error
   */
  connectionFailed(operation: 'connect' | 'disconnect' = 'connect', cause?: unknown): KitiumError {
    const codeMap = {
      connect: 'cache/redis_connection_failed',
      disconnect: 'cache/redis_disconnect_failed',
    };

    const messageMap = {
      connect: 'Failed to connect to Redis',
      disconnect: 'Failed to disconnect from Redis',
    };

    return this.wrapError(cause ?? new Error(messageMap[operation]), {
      operation,
      code: codeMap[operation],
      message: messageMap[operation],
      retryable: operation === 'connect',
    });
  }

  /**
   * Create a cache operation error (get, set, delete, etc)
   */
  operationFailed(
    operation: string,
    key?: string,
    cause?: unknown
  ): KitiumError {
    return this.wrapError(cause ?? new Error(`${operation} failed`), {
      operation,
      key,
      code: `cache/${operation}_failed`,
      message: `Failed to ${operation}${key ? ` key ${key}` : ''}`,
    });
  }

  /**
   * Create a timeout error
   */
  commandTimeout(cause?: unknown): KitiumError {
    return this.wrapError(cause ?? new Error('Redis command timed out'), {
      operation: 'command_timeout',
      code: 'cache/command_timeout',
      message: 'Redis command timed out',
      retryable: true,
    });
  }

  /**
   * Create a validation error
   */
  validationFailed(message: string, cause?: unknown): KitiumError {
    return this.wrapError(cause ?? new Error(message), {
      operation: 'validation',
      code: 'cache/validation_failed',
      message,
      severity: 'error',
      retryable: false,
    });
  }

  /**
   * Create a retry exhaustion error
   */
  retryExhausted(cause?: unknown): KitiumError {
    return this.wrapError(cause ?? new Error('Retries exhausted'), {
      operation: 'retry',
      code: 'cache/retry_exhausted',
      message: 'Redis operation failed after retries',
      retryable: false,
    });
  }
}
