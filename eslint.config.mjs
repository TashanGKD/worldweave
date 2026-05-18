import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-unsafe-optional-chaining': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    '.cache/**',
    'logs/**',
    'output/**',
    'next-env.d.ts',
    '*.tsbuildinfo',
    'graphify-out/**',
    '%SystemDrive%/**',
    '${APPDATA}/**',
    '.hermes-venv/**',
    '.playwright-cli/**',
    '.tools/**',
    '.venv-zvec/**',
    'research/external-repos/**',
    'zvec/**',
  ]),
]);

export default eslintConfig;
