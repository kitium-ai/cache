---
'@kitiumai/cache': major
---

- Multi-tier caching with in-memory hot cache, negative caching, and request coalescing to prevent stampedes.- Resilience features including configurable retry/backoff, Redis command timeouts, and SCAN-based pattern lookups to protect production Redis clusters.- Optional compression and AES-GCM encryption for cached payloads with configurable keys.- Observability hooks to emit command metrics, errors, and persisted cache statistics.- Tag reconciliation on connect to reduce drift between Redis tag sets and in-memory metadata.- Expanded documentation with resilient setup examples and configuration references.
