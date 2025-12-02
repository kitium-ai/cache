import { MemoryCacheConfig } from './types';

interface MemoryEntry<T> {
  value: T | null;
  expiresAt: number;
  size: number;
  isNegative: boolean;
}

export class InMemoryCache {
  private cache = new Map<string, MemoryEntry<unknown>>();
  private config: MemoryCacheConfig;

  constructor(config: MemoryCacheConfig) {
    this.config = config;
  }

  get<T>(key: string): T | null | undefined {
    if (!this.config.enabled) return undefined;
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Refresh recency
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T | null;
  }

  set<T>(key: string, value: T | null, ttlSeconds?: number, isNegative = false): void {
    if (!this.config.enabled) return;
    const ttl = ttlSeconds ?? (isNegative ? this.config.negativeTtlSeconds : this.config.ttlSeconds) ?? this.config.ttlSeconds;
    const expiresAt = Date.now() + ttl * 1000;
    const serialized = value === null ? 'null' : JSON.stringify(value);
    const size = serialized ? Buffer.byteLength(serialized) : 0;

    this.cache.set(key, { value, expiresAt, size, isNegative });
    this.evictIfNeeded();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.config.maxItems || this.isOverSizeLimit()) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) break;
      this.cache.delete(firstKey);
    }
  }

  private isOverSizeLimit(): boolean {
    if (!this.config.maxSizeBytes) return false;
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
      if (total > this.config.maxSizeBytes) return true;
    }
    return total > (this.config.maxSizeBytes ?? Number.MAX_SAFE_INTEGER);
  }
}

