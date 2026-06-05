import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import { baseExtends, browserLanguageOptions, prettier } from '../../eslint.config.base.js';

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '@mf-types']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...baseExtends, reactRefresh.configs.vite],
    languageOptions: browserLanguageOptions(import.meta.dirname),
  },
  prettier,
]);
