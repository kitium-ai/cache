/**
 * Cache Key Manager
 * Handles cache key generation, validation, and management
 */

import { isString } from '@kitiumai/utils-ts';
import { CacheKeyConfig } from './types';

export class CacheKeyManager {
  private prefix: string;
  private separator: string;
  private namespace: string;
  private tagMap: Map<string, Set<string>>;

  constructor(config: CacheKeyConfig = {}) {
    this.prefix = config.prefix || '';
    this.separator = config.separator || ':';
    this.namespace = config.namespace || 'cache';
    this.tagMap = new Map();
  }

  /**
   * Build a full cache key from parts
   */
  buildKey(...parts: string[]): string {
    const allParts = [];

    if (this.prefix) {
      allParts.push(this.prefix);
    }

    allParts.push(this.namespace);
    allParts.push(...parts);

    return allParts.join(this.separator);
  }

  /**
   * Build a namespaced key
   */
  buildNamespacedKey(ns: string, ...parts: string[]): string {
    const allParts = [];

    if (this.prefix) {
      allParts.push(this.prefix);
    }

    allParts.push(ns);
    allParts.push(...parts);

    return allParts.join(this.separator);
  }

  /**
   * Extract namespace from key
   */
  extractNamespace(key: string): string {
    const parts = key.split(this.separator);
    const startIdx = this.prefix ? 1 : 0;
    return parts[startIdx] || this.namespace;
  }

  /**
   * Extract parts from a key
   */
  extractParts(key: string): string[] {
    const parts = key.split(this.separator);
    let startIdx = 0;

    if (this.prefix && parts[0] === this.prefix) {
      startIdx = 1;
    }

    if (parts[startIdx] === this.namespace) {
      startIdx++;
    }

    return parts.slice(startIdx);
  }

  /**
   * Create a pattern for key matching
   */
  buildPattern(...parts: string[]): string {
    const allParts = [];

    if (this.prefix) {
      allParts.push(this.prefix);
    }

    allParts.push(this.namespace);
    allParts.push(...parts);

    return allParts.join(this.separator) + '*';
  }

  /**
   * Create a pattern for specific namespace
   */
  buildNamespacePattern(ns: string): string {
    const allParts = [];

    if (this.prefix) {
      allParts.push(this.prefix);
    }

    allParts.push(ns);

    return allParts.join(this.separator) + '*';
  }

  /**
   * Register a key with tags for bulk invalidation
   */
  registerKeyWithTags(key: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.tagMap.has(tag)) {
        this.tagMap.set(tag, new Set());
      }
      this.tagMap.get(tag)!.add(key);
    }
  }

  /**
   * Get all keys associated with a tag
   */
  getKeysByTag(tag: string): string[] {
    return Array.from(this.tagMap.get(tag) || new Set());
  }

  /**
   * Get all keys for multiple tags
   */
  getKeysByTags(tags: string[]): string[] {
    const keySet = new Set<string>();

    for (const tag of tags) {
      const keys = this.tagMap.get(tag);
      if (keys) {
        keys.forEach((key) => keySet.add(key));
      }
    }

    return Array.from(keySet);
  }

  /**
   * Remove a key from all tag mappings
   */
  unregisterKey(key: string): void {
    for (const tagKeys of this.tagMap.values()) {
      tagKeys.delete(key);
    }
  }

  /**
   * Clear all tag mappings
   */
  clearTags(): void {
    this.tagMap.clear();
  }

  /**
   * Validate a key format
   */
  isValidKey(key: string): boolean {
    if (!isString(key) || key.length === 0) {
      return false;
    }
    // Keys should not contain null bytes
    if (key.includes('\0')) {
      return false;
    }
    // Max key length is reasonable
    if (key.length > 512 * 1024) {
      return false;
    }
    return true;
  }

  /**
   * Hash a key using simple algorithm for consistent distribution
   */
  hashKey(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get key statistics
   */
  getKeyStats(): { totalKeys: number; totalTags: number; keysPerTag: Record<string, number> } {
    const keysPerTag: Record<string, number> = {};
    let totalKeys = 0;

    for (const [tag, keys] of this.tagMap.entries()) {
      keysPerTag[tag] = keys.size;
      totalKeys += keys.size;
    }

    return {
      totalKeys,
      totalTags: this.tagMap.size,
      keysPerTag,
    };
  }

  /**
   * Set prefix
   */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  /**
   * Get current prefix
   */
  getPrefix(): string {
    return this.prefix;
  }

  /**
   * Set namespace
   */
  setNamespace(namespace: string): void {
    this.namespace = namespace;
  }

  /**
   * Get current namespace
   */
  getNamespace(): string {
    return this.namespace;
  }
}
