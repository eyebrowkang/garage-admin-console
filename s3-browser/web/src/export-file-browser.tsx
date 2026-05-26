/**
 * Module Federation entry: bare <FileBrowser/> component.
 *
 * This is THE primary embedded surface. Hosts dynamically import
 * `s3Browser/FileBrowser`, get back a plain React component, and render it
 * with their own QueryClient / router / shell — no Bridge needed.
 */
export { FileBrowser as default } from './features/file-browser/FileBrowser';
export type { FileBrowserProps, FileBrowserViewMode } from './features/file-browser/FileBrowser';
