import { defineConfig, globalIgnores } from 'eslint/config';
import { baseExtends, browserLanguageOptions, prettier } from '../../eslint.config.base.js';

// react-refresh is intentionally NOT applied here. It is a host-HMR concern
// (admin is the Vite host); the S3 Browser remote's Module Federation entries
// (export-app / export-file-browser) and its context provider legitimately
// co-locate non-component exports, which the rule would flag. The shared core
// (js + tseslint + react-hooks) still keeps both apps aligned.
export default defineConfig([
  globalIgnores(['dist', 'node_modules', '@mf-types']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: baseExtends,
    languageOptions: browserLanguageOptions(import.meta.dirname),
  },
  prettier,
]);
