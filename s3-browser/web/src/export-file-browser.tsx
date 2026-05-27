/**
 * Module Federation entry: bare <FileBrowser/> component.
 *
 * This is THE primary embedded surface. Hosts dynamically import
 * `s3Browser/FileBrowser`, get back a plain React component, and render it
 * with their own QueryClient / router / shell — no Bridge needed.
 *
 * Side-effect imports `./embeddable.css` so the federated chunk ships its
 * own Tailwind utility set. Without this, the host's Tailwind pass doesn't
 * see classes used only inside FileBrowser (e.g. `grid-cols-[34px_minmax(
 * 220px,2.4fr)_...]`, `bg-primary/8`), and the layout collapses.
 */
import './embeddable.css';

export { FileBrowser as default } from './features/file-browser/FileBrowser';
export type { FileBrowserProps, FileBrowserViewMode } from './features/file-browser/FileBrowser';
