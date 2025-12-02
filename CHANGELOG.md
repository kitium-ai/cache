# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-21

### Added

#### Core Features

- **Redis Abstraction Layer** - Complete Redis client wrapper with type-safe operations
  - `RedisAdapter`: Main Redis backend implementation
  - Connection management and lifecycle handling
  - Automatic serialization/deserialization of values
  - Health checks and monitoring capabilities

- **Connection Pooling** - Enterprise-grade connection pool management
  - `RedisConnectionPool`: Configurable connection pool with min/max limits
  - Automatic connection validation and health checks
  - Wait queue for connection acquisition with timeout support
  - Idle connection timeout and cleanup
  - Pool statistics tracking
  - Automatic reconnection and recovery

- **Cache Key Management** - Hierarchical key organization system
  - `CacheKeyManager`: Advanced key generation and validation
  - Namespaced key building with custom separators
  - Pattern-based key matching (wildcard support)
  - Tag-based key grouping for bulk operations
  - Consistent key hashing for data distribution
  - Key validation with security checks (null bytes, length limits)
  - Key statistics and metadata tracking

- **Cache Manager** - Main public API
  - `CacheManager`: Unified interface for all cache operations
  - Type-safe get, set, delete, and clear operations
  - getOrSet pattern for lazy evaluation and computed values
  - Bulk operations: deleteMultiple, warmup
  - Cache statistics (hits, misses, evictions, hit rate)
  - Event-driven invalidation with listeners
  - Health checks and connection management

- **TTL Configuration** - Flexible time-to-live management
  - Configurable default, minimum, and maximum TTL bounds
  - Per-operation TTL override support
  - Automatic TTL validation and bounds enforcement
  - Prevents invalid TTL values from being stored

- **Cache Invalidation Strategies** - Multiple invalidation approaches
  - **Pattern-Based**: Wildcard matching (e.g., `user:*`)
  - **Tag-Based**: Bulk invalidation by tags (supports multiple tags)
  - **Manual**: Direct key deletion (single or bulk)
  - **Event-Driven**: Listener-based invalidation notifications
  - **TTL-Based**: Automatic expiration via Redis TTL

#### Type Safety

- Complete TypeScript implementation with strict mode
- Comprehensive type definitions and interfaces:
  - `InvalidationStrategy`: Enum for invalidation types
  - `TTLConfig`: TTL configuration interface
  - `CacheKeyConfig`: Key management configuration
  - `ConnectionPoolConfig`: Connection pool settings
  - `RedisConfig`: Redis connection configuration
  - `CacheOptions`: Per-operation cache options
  - `CacheStats`: Statistics interface
  - `InvalidationEvent`: Event structure
  - `ICacheAdapter`: Cache backend interface
  - `ICacheManager`: Cache manager interface
- Full type exports for library users

#### Testing & Quality Assurance

- Comprehensive unit test suites
  - `CacheKeyManager.test.ts`: 100+ test cases covering:
    - Key building and extraction
    - Tag management and registration
    - Key validation and hashing
    - Statistics tracking
    - Configuration updates
    - Edge cases and error conditions
  - `CacheManager.test.ts`: 50+ test cases covering:
    - Key management
    - TTL configuration and bounds
    - Cache operations (get, set, delete, clear)
    - Bulk operations
    - Invalidation strategies
    - Event listeners
    - Health checks and statistics
- Jest configuration with coverage thresholds
- ESLint configuration for code quality
- TypeScript strict mode enforcement

#### Documentation

- **README.md** - Comprehensive documentation including:
  - Feature overview with emoji highlights
  - Installation instructions
  - Quick start guide with complete example
  - Core concepts explanation
  - Complete API reference
  - Advanced usage patterns
  - Code examples for all features
  - Best practices guide
  - Security considerations
  - Performance optimization tips
  - Contributing guidelines

#### Examples

- **basic-usage.ts** - Demonstrates fundamental operations:
  - Cache initialization and connection
  - Set and get operations
  - Key existence checks
  - Custom TTL settings
  - getOrSet pattern (cached and fresh computation)
  - Deletion operations
  - Statistics retrieval
  - Health checks

- **invalidation-strategies.ts** - Complete invalidation demonstrations:
  - Pattern-based invalidation with wildcards
  - Tag-based invalidation (single and bulk)
  - Manual key deletion (single and bulk)
  - Event-driven invalidation with listeners
  - Complex hierarchical pattern invalidation
  - Complete cache clearing
  - Key querying and filtering

#### Configuration Files

- **package.json** - Complete package metadata with:
  - Package name: `@kitiumai/cache`
  - All required npm fields
  - Build, test, lint, and clean scripts
  - Dependencies: `redis`, `node-cache`
  - Dev dependencies for TypeScript, testing, linting
  - Node.js engine requirement (v16.0.0+)
  - Keywords for npm discoverability

- **tsconfig.json** - TypeScript compilation settings:
  - ES2020 target with CommonJS modules
  - Strict type checking enabled
  - Source maps and declaration maps
  - Type declaration generation
  - Module resolution configuration
  - All strict flags enabled

- **jest.config.js** - Testing framework configuration:
  - TypeScript support via ts-jest
  - Node.js test environment
  - Coverage thresholds (70% minimum)
  - Test file patterns

- **.eslintrc.json** - Code quality rules:
  - TypeScript parser configuration
  - ESLint recommended rules
  - TypeScript specific rules
  - Console and process exit restrictions
  - Unused variable warnings

#### Project Setup

- Git repository initialization on branch `claude/create-cache-package-01XkCxaMB2oKFmpuBxL39bMe`
- .gitignore configuration for common files
- MIT License
- Initial commit with complete package implementation

### Changed

#### Repository Structure (v1.0.0-restructure)

- **Flattened package structure**: Moved all package content from `packages/cache/` to repository root
- **Simplified directory layout**: Removed monorepo nesting for single-package use
- **Direct root access**: Source, tests, examples, and config files now at root level
- Maintained all functionality and documentation

### Security

- Key validation prevents null byte injection
- Maximum key length validation (512KB limit)
- Input sanitization for cache keys
- Type-safe operations prevent data corruption
- Connection authentication support via Redis password
- Comprehensive error handling without data leaks
- No secrets stored in code or defaults

### Performance

- Connection pooling reduces Redis connection overhead
- Batch operations for efficient bulk updates
- Pattern-based invalidation for selective cache clearing
- Event-driven architecture for non-blocking listeners
- Efficient tag-based key tracking
- Automatic connection health validation
- Memory-efficient data structures

### Developer Experience

- Fully documented API with examples
- Type definitions for IDE autocomplete
- Error messages with context and guidance
- Flexible configuration with sensible defaults
- Easy integration with existing TypeScript projects
- Comprehensive example code for all features
- Well-organized source code with clear separation of concerns

---

## Version Numbering

- **1.0.0**: Initial stable release with complete feature set
- Semantic versioning for future releases

## Contributing

Please read [README.md](./README.md) for contribution guidelines and development setup.

## License

MIT - See LICENSE file for details

[1.0.0]: https://github.com/kitium-ai/cache/releases/tag/v1.0.0
