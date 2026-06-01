// Module Federation async boundary — REQUIRED, do not inline. This app is an MF
// remote whose react/react-dom are shared singletons, so the top-level chunk must
// not statically import React; it defers to ./bootstrap so the MF runtime can
// populate the shared scope first. Inlining bootstrap here trips runtime-006.
// https://module-federation.io/guide/troubleshooting/runtime#runtime-006
import('./bootstrap');
