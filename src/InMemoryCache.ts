import { MemoryCacheConfig } from './types';
import type { IEvictionStrategy } from './core/strategies/IEvictionStrategy';
import { LRUEvictionStrategy } from './core/strategies/LRUEvictionStrategy';

interface MemoryEntry<T> {
  value: T | null;
  expiresAt: number;
  size: number;
  isNegative: boolean;
}

export class InMemoryCache {
  private cache = new Map<string, MemoryEntry<unknown>>();
  private config: MemoryCacheConfig;
  private evictionStrategy: IEvictionStrategy<string, MemoryEntry<unknown>>;

  constructor(
    config: MemoryCacheConfig,
    evictionStrategy?: IEvictionStrategy<string, MemoryEntry<unknown>>
  ) {
    this.config = config;
    // Default to LRU if no strategy provided
    this.evictionStrategy =
      evictionStrategy ?? new LRUEvictionStrategy<string, MemoryEntry<unknown>>();
  }

  get<T>(key: string): T | null | undefined {
    if (!this.config.enabled) {
      return undefined;
    }
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Record access for eviction strategy
    this.evictionStrategy.recordAccess(key);
    return entry.value as T | null;
  }

  set<T>(key: string, value: T | null, ttlSeconds?: number, isNegative = false): void {
    if (!this.config.enabled) {
      return;
    }
    const ttl =
      ttlSeconds ??
      (isNegative ? this.config.negativeTtlSeconds : this.config.ttlSeconds) ??
      this.config.ttlSeconds;
    const expiresAt = Date.now() + ttl * 1000;
    const serialized = value === null ? 'null' : JSON.stringify(value);
    const size = serialized ? Buffer.byteLength(serialized) : 0;

    const entry = { value, expiresAt, size, isNegative };
    this.cache.set(key, entry);

    // Record insertion for eviction strategy
    this.evictionStrategy.recordInsertion(key);

    this.evictIfNeeded();
  }

  delete(key: string): void {
    this.cache.delete(key);
    // Remove from eviction strategy tracking if it's an LRU or LFU strategy
    const strategy = this.evictionStrategy as any;
    if (typeof strategy.removeKey === 'function') {
      strategy.removeKey(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.evictionStrategy.reset();
  }

  /**
   * Get the current eviction strategy name
   */
  getEvictionStrategyName(): string {
    return this.evictionStrategy.getName();
  }

  /**
   * Set a new eviction strategy
   */
  setEvictionStrategy(strategy: IEvictionStrategy<string, MemoryEntry<unknown>>): void {
    this.evictionStrategy = strategy;
    this.evictionStrategy.reset();
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.config.maxItems || this.isOverSizeLimit()) {
      const evictionCandidate = this.evictionStrategy.selectEvictionCandidate(this.cache);
      if (!evictionCandidate) {
        break;
      }
      this.cache.delete(evictionCandidate);
      // Remove from strategy tracking
      const strategy = this.evictionStrategy as any;
      if (typeof strategy.removeKey === 'function') {
        strategy.removeKey(evictionCandidate);
      }
    }
  }

  private isOverSizeLimit(): boolean {
    if (!this.config.maxSizeBytes) {
      return false;
    }
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
      if (total > this.config.maxSizeBytes) {
        return true;
      }
    }
    return total > (this.config.maxSizeBytes ?? Number.MAX_SAFE_INTEGER);
  }
}
