import baseConfig from '@kitiumai/config/eslint.config.base.js';

export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Package-specific overrides if needed
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  {
    files: ['**/RedisAdapter.ts', '**/RedisConnectionPool.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
