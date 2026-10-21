import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['dist/**', 'supabase/functions/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, __APP_VERSION__: 'readonly', __WHATS_NEW__: 'readonly' }, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-undef': 'error',
      /* Zugriff vor der Deklaration im selben Gültigkeitsbereich (z. B. in Hook-Abhängigkeiten) */
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^React$' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-cond-assign': 'off',
    },
  },
  { files: ['src/server/deno-entry.js'], languageOptions: { globals: { Deno: 'readonly' } } },
  { files: ['src/sw.template.js'], languageOptions: { globals: { __SHELL__: 'readonly' } } },
  { files: ['build.mjs', 'tests/**/*.{js,mjs}', '*.config.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } } },
];
