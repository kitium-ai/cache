import { baseConfig, securityConfig, typeScriptConfig } from '@kitiumai/lint/eslint';

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '.husky/', '**/*.d.ts'],
  },
  ...baseConfig,
  ...typeScriptConfig,
  securityConfig,
  {
    name: 'cache/boundaries-settings',
    settings: {
      'boundaries/alias': null,
    },
  },
  {
    name: 'cache/overrides',
    rules: {
      'security/detect-object-injection': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    name: 'cache/fs-path-overrides',
    files: ['src/persistence/**/*.{ts,tsx}'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
];
