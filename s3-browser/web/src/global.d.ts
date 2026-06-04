// Ambient types for side-effect CSS imports and asset imports.
declare module '*.css';
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
declare module '*.gif';

// Build-time env vars exposed by Rsbuild (PUBLIC_ prefix).
interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL?: string;
  /** Rsbuild standard flags. */
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
