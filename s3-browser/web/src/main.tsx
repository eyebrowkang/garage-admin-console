// Module Federation async boundary — REQUIRED, do not inline. This app is an MF
// remote whose react/react-dom are shared singletons, so the top-level chunk must
// not statically import React; it defers to ./bootstrap so the MF runtime can
// populate the shared scope first. Inlining bootstrap here trips runtime-006.
// https://module-federation.io/guide/troubleshooting/runtime#runtime-006
void (async () => {
  // Dev-only: when ?mock=1 is set, install the API mock BEFORE bootstrap (and
  // thus lib/api's axios client) is imported, so the client inherits it. The
  // `if (import.meta.env.DEV)` is a literal false in prod, so this — and the
  // dynamic imports below it — are dropped from the production bundle.
  if (import.meta.env.DEV) {
    const { maybeInstallMockApi } = await import('./dev/devMock');
    await maybeInstallMockApi();
  }
  await import('./bootstrap');
})();

// PWA service worker — standalone app only. This entry is never the module MF
// exposes, so embedding the FileBrowser into the Admin host never registers a
// second SW. Prod only, so the dev server's HMR isn't shadowed by a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
