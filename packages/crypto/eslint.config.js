import { defineConfig, globalIgnores } from 'eslint/config';
import { baseExtends, nodeLanguageOptions, prettier } from '../../eslint.config.base.js';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.ts'],
    extends: baseExtends,
    languageOptions: nodeLanguageOptions(import.meta.dirname),
  },
  prettier,
]);
