import { beforeEach, describe, expect, it } from "vitest";

import { CacheKeyManager } from "../CacheKeyManager";
import type { CacheKeyConfig } from "../types";

const defaultConfig: CacheKeyConfig = {
  prefix: "app",
  separator: ":",
  namespace: "cache",
};

const createKeyManager = (): CacheKeyManager => new CacheKeyManager(defaultConfig);

describe("CacheKeyManager.buildKey", () => {
  let keyManager: CacheKeyManager;

  beforeEach(() => {
    keyManager = createKeyManager();
  });

  it("builds a key with prefix and namespace", () => {
    const key = keyManager.buildKey("user", "123");
    expect(key).toBe("app:cache:user:123");
  });

  it("handles a single part", () => {
    const key = keyManager.buildKey("user");
    expect(key).toBe("app:cache:user");
  });

  it("handles multiple parts", () => {
    const key = keyManager.buildKey("user", "123", "profile");
    expect(key).toBe("app:cache:user:123:profile");
  });
});

describe("CacheKeyManager.buildNamespacedKey", () => {
  it("builds a key with a custom namespace", () => {
    const keyManager = createKeyManager();
    const key = keyManager.buildNamespacedKey("session", "token", "abc123");
    expect(key).toBe("app:session:token:abc123");
  });
});

describe("CacheKeyManager.extractNamespace", () => {
  it("extracts namespace from key", () => {
    const keyManager = createKeyManager();
    const ns = keyManager.extractNamespace("app:cache:user:123");
    expect(ns).toBe("cache");
  });
});

describe("CacheKeyManager.extractParts", () => {
  it("extracts parts from key", () => {
    const keyManager = createKeyManager();
    const parts = keyManager.extractParts("app:cache:user:123:profile");
    expect(parts).toEqual(["user", "123", "profile"]);
  });
});

describe("CacheKeyManager.buildPattern", () => {
  let keyManager: CacheKeyManager;

  beforeEach(() => {
    keyManager = createKeyManager();
  });

  it("builds a pattern for key matching", () => {
    const pattern = keyManager.buildPattern("user", "*");
    expect(pattern).toBe("app:cache:user:**");
  });

  it("builds a namespace-wide pattern", () => {
    const pattern = keyManager.buildPattern("*");
    expect(pattern).toBe("app:cache:**");
  });
});

describe("CacheKeyManager tag management", () => {
  let keyManager: CacheKeyManager;

  beforeEach(() => {
    keyManager = createKeyManager();
  });

  it("registers keys with tags", () => {
    keyManager.registerKeyWithTags("user:123", ["users", "active"]);
    keyManager.registerKeyWithTags("user:456", ["users", "inactive"]);

    const keys = keyManager.getKeysByTag("users");
    expect(keys).toContain("user:123");
    expect(keys).toContain("user:456");
  });

  it("gets keys by single tag", () => {
    keyManager.registerKeyWithTags("key1", ["tag1"]);
    keyManager.registerKeyWithTags("key2", ["tag1"]);

    const keys = keyManager.getKeysByTag("tag1");
    expect(keys).toHaveLength(2);
  });

  it("gets keys by multiple tags", () => {
    keyManager.registerKeyWithTags("key1", ["tag1", "tag2"]);
    keyManager.registerKeyWithTags("key2", ["tag2", "tag3"]);

    const keys = keyManager.getKeysByTags(["tag1", "tag3"]);
    expect(keys).toHaveLength(2);
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
  });

  it("unregisters keys from tags", () => {
    keyManager.registerKeyWithTags("key1", ["tag1", "tag2"]);
    keyManager.unregisterKey("key1");

    expect(keyManager.getKeysByTag("tag1")).toHaveLength(0);
    expect(keyManager.getKeysByTag("tag2")).toHaveLength(0);
  });

  it("clears all tags", () => {
    keyManager.registerKeyWithTags("key1", ["tag1"]);
    keyManager.registerKeyWithTags("key2", ["tag2"]);

    keyManager.clearTags();

    const stats = keyManager.getKeyStats();
    expect(stats.totalKeys).toBe(0);
    expect(stats.totalTags).toBe(0);
  });
});

describe("CacheKeyManager.isValidKey", () => {
  let keyManager: CacheKeyManager;

  beforeEach(() => {
    keyManager = createKeyManager();
  });

  it("validates valid keys", () => {
    expect(keyManager.isValidKey("user:123")).toBe(true);
    expect(keyManager.isValidKey("cache:key")).toBe(true);
  });

  it("rejects null bytes", () => {
    expect(keyManager.isValidKey("key\0value")).toBe(false);
  });

  it("rejects non-string keys", () => {
    expect(keyManager.isValidKey(null as unknown as string)).toBe(false);
    expect(keyManager.isValidKey(undefined as unknown as string)).toBe(false);
    expect(keyManager.isValidKey(123 as unknown as string)).toBe(false);
  });

  it("rejects empty keys", () => {
    expect(keyManager.isValidKey("")).toBe(false);
  });
});

describe("CacheKeyManager.hashKey", () => {
  let keyManager: CacheKeyManager;

  beforeEach(() => {
    keyManager = createKeyManager();
  });

  it("hashes keys consistently", () => {
    const hash1 = keyManager.hashKey("user:123");
    const hash2 = keyManager.hashKey("user:123");
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different keys", () => {
    const hash1 = keyManager.hashKey("user:123");
    const hash2 = keyManager.hashKey("user:456");
    expect(hash1).not.toBe(hash2);
  });

  it("returns positive hash values", () => {
    const hash = keyManager.hashKey("any-key");
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});

describe("CacheKeyManager.getKeyStats", () => {
  it("tracks key statistics", () => {
    const keyManager = createKeyManager();
    keyManager.registerKeyWithTags("key1", ["tag1", "tag2"]);
    keyManager.registerKeyWithTags("key2", ["tag1"]);
    keyManager.registerKeyWithTags("key3", ["tag3"]);

    const stats = keyManager.getKeyStats();
    expect(stats.totalTags).toBe(3);
    expect(stats.keysPerTag["tag1"]).toBe(2);
    expect(stats.keysPerTag["tag2"]).toBe(1);
    expect(stats.keysPerTag["tag3"]).toBe(1);
  });
});

describe("CacheKeyManager configuration", () => {
  it("updates prefix", () => {
    const keyManager = createKeyManager();
    keyManager.setPrefix("newprefix");
    expect(keyManager.getPrefix()).toBe("newprefix");
    expect(keyManager.buildKey("test")).toContain("newprefix");
  });

  it("updates namespace", () => {
    const keyManager = createKeyManager();
    keyManager.setNamespace("newsession");
    expect(keyManager.getNamespace()).toBe("newsession");
    expect(keyManager.buildKey("test")).toContain("newsession");
  });
});

describe("CacheKeyManager edge cases", () => {
  it("handles keys without prefix", () => {
    const keyManager = new CacheKeyManager({ namespace: "cache" });
    const key = keyManager.buildKey("test");
    expect(key).toBe("cache:test");
  });

  it("handles custom separators", () => {
    const keyManager = new CacheKeyManager({
      prefix: "app",
      separator: "/",
      namespace: "cache",
    });
    const key = keyManager.buildKey("user", "123");
    expect(key).toBe("app/cache/user/123");
  });
});
