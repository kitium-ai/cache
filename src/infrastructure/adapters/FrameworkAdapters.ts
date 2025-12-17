/**
 * Framework Adapters
 * Integration adapters for popular Node.js frameworks
 * Provides seamless cache integration with Express, Fastify, NestJS, etc.
 */

import { CacheManager } from '../../CacheManager';

type CachedHttpResponse = {
  statusCode: number;
  headers: Record<string, unknown>;
  body: unknown;
};

// Express.js Adapter
export interface ExpressCacheConfig {
  cacheManager: CacheManager;
  defaultTTL?: number;
  cacheableStatusCodes?: number[];
  cacheableMethods?: string[];
  skipCacheHeader?: string;
  cacheControlHeader?: string;
}

export function createExpressCacheMiddleware(config: ExpressCacheConfig) {
  const {
    cacheManager,
    defaultTTL = 300,
    cacheableStatusCodes = [200, 201, 202],
    cacheableMethods = ['GET'],
    skipCacheHeader = 'x-skip-cache',
    cacheControlHeader = 'Cache-Control',
  } = config;

  return async (req: any, res: any, next: any) => {
    // Skip caching for non-cacheable methods
    if (!cacheableMethods.includes(req.method)) {
      return next();
    }

    // Skip if client requests no caching
    if (req.headers[skipCacheHeader]) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Try to get from cache
	      const cachedResponse = await cacheManager.get<CachedHttpResponse>(cacheKey);
	      if (cachedResponse) {
	        const { statusCode, headers, body } = cachedResponse;
	        res.status(statusCode).set(headers).send(body);
        return;
      }

      // Intercept response
      const originalSend = res.send;
      const originalStatus = res.status;
      let responseBody: any;
      let statusCode = 200;

      res.status = function (code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      res.send = function (body: any) {
        responseBody = body;

        // Cache successful responses
        if (cacheableStatusCodes.includes(statusCode)) {
          const responseData = {
            statusCode,
            headers: res.getHeaders(),
            body: responseBody,
          };

          // Check Cache-Control header
          const cacheControl = req.headers[cacheControlHeader];
          let ttl = defaultTTL;

          if (cacheControl) {
            const maxAge = parseCacheControl(cacheControl);
            if (maxAge !== null) {
              ttl = Math.min(ttl, maxAge);
            }
          }

	          cacheManager.set(cacheKey, responseData, { ttl }).catch((error: unknown) => {
	            console.warn('Failed to cache response:', error);
	          });
	        }

        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      // On cache error, continue without caching
      next();
    }
  };
}

// Fastify Adapter
export interface FastifyCacheConfig {
  cacheManager: CacheManager;
  defaultTTL?: number;
  cacheableStatusCodes?: number[];
  cacheableMethods?: string[];
  skipCacheHeader?: string;
}

export function createFastifyCachePlugin(config: FastifyCacheConfig) {
  const {
    cacheManager,
    defaultTTL = 300,
    cacheableStatusCodes = [200, 201, 202],
    cacheableMethods = ['GET'],
    skipCacheHeader = 'x-skip-cache',
  } = config;

	  return async function (fastify: any, options: any) {
	    void options;
	    fastify.addHook('preHandler', async (request: any, reply: any) => {
      if (!cacheableMethods.includes(request.method)) {
        return;
      }

      if (request.headers[skipCacheHeader]) {
        return;
      }

      const cacheKey = generateCacheKey(request);

      try {
	        const cachedResponse = await cacheManager.get<CachedHttpResponse>(cacheKey);
	        if (cachedResponse) {
	          const { statusCode, headers, body } = cachedResponse;
	          reply.code(statusCode).headers(headers).send(body);
          return reply;
        }
      } catch (error) {
        // Continue without caching on error
      }
    });

    fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
      if (!cacheableMethods.includes(request.method)) {
        return payload;
      }

      if (request.headers[skipCacheHeader]) {
        return payload;
      }

      const statusCode = reply.statusCode;
      if (!cacheableStatusCodes.includes(statusCode)) {
        return payload;
      }

      const cacheKey = generateCacheKey(request);
      const responseData = {
        statusCode,
        headers: reply.getHeaders(),
        body: payload,
      };

      try {
        await cacheManager.set(cacheKey, responseData, { ttl: defaultTTL });
      } catch (error) {
        // Log but don't fail the response
        console.warn('Failed to cache response:', error);
      }

      return payload;
    });
  };
}

// NestJS Adapter
export interface NestJSCacheConfig {
  cacheManager: CacheManager;
  defaultTTL?: number;
  cacheableStatusCodes?: number[];
}

export function createNestJSCacheInterceptor(config: NestJSCacheConfig) {
  const { cacheManager, defaultTTL = 300, cacheableStatusCodes = [200, 201, 202] } = config;

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    void target;

    descriptor.value = async function (...args: any[]) {
      const request = args[0]; // Assuming first arg is request
      const cacheKey = `${propertyKey}:${generateCacheKey(request)}`;

      try {
        const cachedResponse = await cacheManager.get(cacheKey);
        if (cachedResponse) {
          return cachedResponse;
        }
      } catch (error) {
        // Continue without caching
      }

      const result = await originalMethod.apply(this, args);

      // Cache successful responses
      if (result && typeof result === 'object' && 'status' in result) {
        const statusCode = result.status || 200;
        if (cacheableStatusCodes.includes(statusCode)) {
          try {
            await cacheManager.set(cacheKey, result, { ttl: defaultTTL });
          } catch (error) {
            console.warn('Failed to cache response:', error);
          }
        }
      }

      return result;
    };

    return descriptor;
  };
}

// Generic HTTP Adapter
export interface HTTPCacheAdapter {
  get: (url: string, options?: any) => Promise<any>;
  post: (url: string, data?: any, options?: any) => Promise<any>;
  put: (url: string, data?: any, options?: any) => Promise<any>;
  delete: (url: string, options?: any) => Promise<any>;
}

export function createHTTPCacheAdapter(
  cacheManager: CacheManager,
  originalAdapter: HTTPCacheAdapter,
  config: {
    defaultTTL?: number;
    cacheableMethods?: string[];
    cacheableStatusCodes?: number[];
    generateKey?: (method: string, url: string, data?: any) => string;
  } = {}
): HTTPCacheAdapter {
  const {
    defaultTTL = 300,
    cacheableMethods = ['GET'],
    cacheableStatusCodes = [200, 201, 202],
    generateKey = (method, url, data) =>
      `${method}:${url}${data ? `:${JSON.stringify(data)}` : ''}`,
  } = config;

  const wrapMethod = (method: string, originalFn: Function) => {
    return async (url: string, data?: any, options?: any) => {
      if (!cacheableMethods.includes(method)) {
        return originalFn(url, data, options);
      }

      const cacheKey = generateKey(method, url, data);

      try {
        // Try cache for GET requests
        if (method === 'GET') {
          const cached = await cacheManager.get(cacheKey);
          if (cached) {
            return cached;
          }
        }

        // Make request
        const response = await originalFn(url, data, options);

        // Cache successful responses
        if (response && response.status && cacheableStatusCodes.includes(response.status)) {
          await cacheManager.set(cacheKey, response, { ttl: defaultTTL });
        }

        return response;
      } catch (error) {
        throw error;
      }
    };
  };

  return {
    get: wrapMethod('GET', originalAdapter.get),
    post: wrapMethod('POST', originalAdapter.post),
    put: wrapMethod('PUT', originalAdapter.put),
    delete: wrapMethod('DELETE', originalAdapter.delete),
  };
}

// Utility functions
function generateCacheKey(req: any): string {
  // Generate a deterministic cache key from request
  const parts = [
    req.method,
    req.originalUrl || req.url,
    req.headers['accept-language'] || '',
    req.headers['user-agent'] || '',
    // Add query params if present
    req.query ? JSON.stringify(req.query) : '',
  ];

  return parts.join('|');
}

function parseCacheControl(cacheControl: string): number | null {
  const match = cacheControl.match(/max-age=(\d+)/);
  const maxAge = match?.[1];
  return maxAge ? parseInt(maxAge, 10) : null;
}

// Decorators for method-level caching
export function Cacheable(options: {
  key?: string | ((...args: any[]) => string);
  ttl?: number;
  condition?: (...args: any[]) => boolean;
}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheManager = (target as any).cacheManager;

    if (!cacheManager) {
      throw new Error('CacheManager not found. Make sure to inject it as cacheManager property.');
    }

    descriptor.value = async function (...args: any[]) {
      // Check condition
      if (options.condition && !options.condition.apply(this, args)) {
        return originalMethod.apply(this, args);
      }

      // Generate cache key
      let cacheKey: string;
      if (typeof options.key === 'function') {
        cacheKey = options.key.apply(this, args);
      } else if (typeof options.key === 'string') {
        cacheKey = options.key;
      } else {
        cacheKey = `${propertyKey}:${JSON.stringify(args)}`;
      }

      try {
        const cached = await cacheManager.get(cacheKey);
        if (cached !== null) {
          return cached;
        }
      } catch (error) {
        // Continue without caching
      }

      const result = await originalMethod.apply(this, args);

      try {
        await cacheManager.set(cacheKey, result, { ttl: options.ttl });
      } catch (error) {
        // Log but don't fail
        console.warn('Failed to cache method result:', error);
      }

      return result;
    };

    return descriptor;
  };
}

export function CacheEvict(options: {
  key?: string | ((...args: any[]) => string);
  allEntries?: boolean;
  beforeInvocation?: boolean;
}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheManager = (target as any).cacheManager;

    if (!cacheManager) {
      throw new Error('CacheManager not found. Make sure to inject it as cacheManager property.');
    }

    descriptor.value = async function (...args: any[]) {
      const performEviction = async () => {
        try {
          if (options.allEntries) {
            await cacheManager.clear();
          } else if (options.key) {
            const cacheKey =
              typeof options.key === 'function'
                ? options.key.apply(this, args)
                : options.key;
            await cacheManager.delete(cacheKey);
          } else {
            await cacheManager.delete(`${propertyKey}:${JSON.stringify(args)}`);
          }
        } catch (error) {
          console.warn('Failed to evict cache:', error);
        }
      };

      if (options.beforeInvocation) {
        await performEviction();
      }

      const result = await originalMethod.apply(this, args);

      if (!options.beforeInvocation) {
        await performEviction();
      }

      return result;
    };

    return descriptor;
  };
}
