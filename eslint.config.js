import { baseConfig, securityConfig, typeScriptConfig } from '@kitiumai/lint/eslint';

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '.husky/', '**/*.d.ts'],
  },
  ...baseConfig,
  ...typeScriptConfig,
  securityConfig,
  {
    name: 'cache/overrides',
    rules: {
      'security/detect-object-injection': 'off',
      'no-restricted-imports': 'off'
    },
  },
];
