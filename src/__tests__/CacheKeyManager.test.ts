import { describe, it, expect, beforeEach } from 'vitest';
import { CacheKeyManager } from '../CacheKeyManager';
import { CacheKeyConfig } from '../types';

describe('CacheKeyManager', () => {
  let keyManager: CacheKeyManager;

  beforeEach(() => {
    const config: CacheKeyConfig = {
      prefix: 'app',
      separator: ':',
      namespace: 'cache',
    };
    keyManager = new CacheKeyManager(config);
  });

  describe('buildKey', () => {
    it('should build a key with prefix and namespace', () => {
      const key = keyManager.buildKey('user', '123');
      expect(key).toBe('app:cache:user:123');
    });

    it('should handle single part', () => {
      const key = keyManager.buildKey('user');
      expect(key).toBe('app:cache:user');
    });

    it('should handle multiple parts', () => {
      const key = keyManager.buildKey('user', '123', 'profile');
      expect(key).toBe('app:cache:user:123:profile');
    });
  });

  describe('buildNamespacedKey', () => {
    it('should build a key with custom namespace', () => {
      const key = keyManager.buildNamespacedKey('session', 'token', 'abc123');
      expect(key).toBe('app:session:token:abc123');
    });
  });

  describe('extractNamespace', () => {
    it('should extract namespace from key', () => {
      const key = 'app:cache:user:123';
      const ns = keyManager.extractNamespace(key);
      expect(ns).toBe('cache');
    });
  });

  describe('extractParts', () => {
    it('should extract parts from key', () => {
      const key = 'app:cache:user:123:profile';
      const parts = keyManager.extractParts(key);
      expect(parts).toEqual(['user', '123', 'profile']);
    });
  });

  describe('buildPattern', () => {
    it('should build a pattern for key matching', () => {
      const pattern = keyManager.buildPattern('user', '*');
      expect(pattern).toBe('app:cache:user:**');
    });

    it('should build a namespace-wide pattern', () => {
      const pattern = keyManager.buildPattern('*');
      expect(pattern).toBe('app:cache:**');
    });
  });

  describe('Tag Management', () => {
    it('should register keys with tags', () => {
      keyManager.registerKeyWithTags('user:123', ['users', 'active']);
      keyManager.registerKeyWithTags('user:456', ['users', 'inactive']);

      const keys = keyManager.getKeysByTag('users');
      expect(keys).toContain('user:123');
      expect(keys).toContain('user:456');
    });

    it('should get keys by single tag', () => {
      keyManager.registerKeyWithTags('key1', ['tag1']);
      keyManager.registerKeyWithTags('key2', ['tag1']);

      const keys = keyManager.getKeysByTag('tag1');
      expect(keys.length).toBe(2);
    });

    it('should get keys by multiple tags', () => {
      keyManager.registerKeyWithTags('key1', ['tag1', 'tag2']);
      keyManager.registerKeyWithTags('key2', ['tag2', 'tag3']);

      const keys = keyManager.getKeysByTags(['tag1', 'tag3']);
      expect(keys.length).toBe(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should unregister keys from tags', () => {
      keyManager.registerKeyWithTags('key1', ['tag1', 'tag2']);
      keyManager.unregisterKey('key1');

      const keys1 = keyManager.getKeysByTag('tag1');
      const keys2 = keyManager.getKeysByTag('tag2');

      expect(keys1).toHaveLength(0);
      expect(keys2).toHaveLength(0);
    });

    it('should clear all tags', () => {
      keyManager.registerKeyWithTags('key1', ['tag1']);
      keyManager.registerKeyWithTags('key2', ['tag2']);

      keyManager.clearTags();

      const stats = keyManager.getKeyStats();
      expect(stats.totalKeys).toBe(0);
      expect(stats.totalTags).toBe(0);
    });
  });

  describe('Key Validation', () => {
    it('should validate valid keys', () => {
      expect(keyManager.isValidKey('user:123')).toBe(true);
      expect(keyManager.isValidKey('cache:key')).toBe(true);
    });

    it('should reject null bytes', () => {
      expect(keyManager.isValidKey('key\0value')).toBe(false);
    });

    it('should reject non-string keys', () => {
      expect(keyManager.isValidKey(null as any)).toBe(false);
      expect(keyManager.isValidKey(undefined as any)).toBe(false);
      expect(keyManager.isValidKey(123 as any)).toBe(false);
    });

    it('should reject empty keys', () => {
      expect(keyManager.isValidKey('')).toBe(false);
    });
  });

  describe('Key Hashing', () => {
    it('should hash keys consistently', () => {
      const hash1 = keyManager.hashKey('user:123');
      const hash2 = keyManager.hashKey('user:123');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different keys', () => {
      const hash1 = keyManager.hashKey('user:123');
      const hash2 = keyManager.hashKey('user:456');
      expect(hash1).not.toBe(hash2);
    });

    it('should return positive hash values', () => {
      const hash = keyManager.hashKey('any-key');
      expect(hash).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    it('should track key statistics', () => {
      keyManager.registerKeyWithTags('key1', ['tag1', 'tag2']);
      keyManager.registerKeyWithTags('key2', ['tag1']);
      keyManager.registerKeyWithTags('key3', ['tag3']);

      const stats = keyManager.getKeyStats();

      expect(stats.totalTags).toBe(3);
      expect(stats.keysPerTag['tag1']).toBe(2);
      expect(stats.keysPerTag['tag2']).toBe(1);
      expect(stats.keysPerTag['tag3']).toBe(1);
    });
  });

  describe('Configuration', () => {
    it('should update prefix', () => {
      keyManager.setPrefix('newprefix');
      expect(keyManager.getPrefix()).toBe('newprefix');

      const key = keyManager.buildKey('test');
      expect(key).toContain('newprefix');
    });

    it('should update namespace', () => {
      keyManager.setNamespace('newsession');
      expect(keyManager.getNamespace()).toBe('newsession');

      const key = keyManager.buildKey('test');
      expect(key).toContain('newsession');
    });
  });

  describe('Edge Cases', () => {
    it('should handle keys without prefix', () => {
      const manager = new CacheKeyManager({ namespace: 'cache' });
      const key = manager.buildKey('test');
      expect(key).toBe('cache:test');
    });

    it('should handle custom separators', () => {
      const manager = new CacheKeyManager({
        prefix: 'app',
        separator: '/',
        namespace: 'cache',
      });
      const key = manager.buildKey('user', '123');
      expect(key).toBe('app/cache/user/123');
    });
  });
});
