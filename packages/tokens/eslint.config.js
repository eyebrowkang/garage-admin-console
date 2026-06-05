import { defineConfig, globalIgnores } from 'eslint/config';
import { baseExtends, browserLanguageOptions, prettier } from '../../eslint.config.base.js';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: baseExtends,
    languageOptions: browserLanguageOptions(import.meta.dirname),
  },
  prettier,
]);
