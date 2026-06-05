import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * Shared eslint flat-config building blocks for the web frontends and
 * @garage/web-shared. Each project composes `baseExtends` (adding its own
 * `tsconfigRootDir` via `browserLanguageOptions`, and — for the apps — a
 * bundler-specific react-refresh preset) plus `prettier`. Centralizing the
 * core here is what stops the per-app eslint configs from drifting.
 *
 * The plugins are declared as devDependencies of the repo root so this file
 * resolves them regardless of which workspace runs eslint.
 */
export const baseExtends = [
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
];

export const prettier = eslintConfigPrettier;

export function browserLanguageOptions(tsconfigRootDir) {
  return {
    ecmaVersion: 2020,
    globals: globals.browser,
    parserOptions: { tsconfigRootDir },
  };
}

/** Node variant for the backend packages (BFF helpers, crypto, bucket-api-server). */
export function nodeLanguageOptions(tsconfigRootDir) {
  return {
    ecmaVersion: 2023,
    globals: globals.node,
    parserOptions: { tsconfigRootDir },
  };
}
