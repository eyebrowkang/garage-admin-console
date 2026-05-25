/**
 * Explicit MF runtime bootstrap.
 *
 * `@module-federation/vite` registers shared deps via build-time transforms,
 * but in a Vite-host ⇄ Rsbuild-remote setup the remote's `consume_default_*`
 * wrapper runs BEFORE the host's transformed share-register code has a
 * chance to populate the default share scope. The result is that the remote
 * silently falls back to its bundled vendor React copy, and React 19's
 * two-copies guard throws "Invalid hook call" inside the FileBrowser's
 * first useMemo.
 *
 * Calling `init()` here at the top of the entry — with explicit `lib`
 * references to the host's React + ReactDOM modules — registers the host's
 * copies in the share scope synchronously, BEFORE the remote loads. The
 * remote's consume wrapper then finds them and skips its own bundled copy.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactDomClient from 'react-dom/client';
import { init } from '@module-federation/runtime';

const REACT_VERSION = React.version;

const s3BrowserMfUrl =
  import.meta.env.VITE_S3_BROWSER_MF_URL ?? 'http://localhost:5174/mf-manifest.json';

/**
 * Exported so consumers can call `mfInstance.loadRemote(...)`. The global
 * `loadRemote` helper from `@module-federation/runtime` is ambiguous when
 * multiple MF instances live on the page (the s3Browser remote registers
 * itself as a producer on load, so `__INSTANCES__` ends up with two entries),
 * and the global picks the wrong one. Going through the instance handle
 * avoids that ambiguity.
 */
export const mfInstance = init({
  name: 'garageAdmin',
  remotes: [
    {
      name: 's3Browser',
      alias: 's3Browser',
      entry: s3BrowserMfUrl,
    },
  ],
  shared: {
    react: {
      version: REACT_VERSION,
      // `lib` returns the *already-evaluated* module so the share scope
      // hands the remote the host's exact React instance.
      lib: () => React,
      scope: ['default'],
      shareConfig: {
        singleton: true,
        requiredVersion: `^${REACT_VERSION.split('.')[0]}`,
      },
    },
    'react/jsx-runtime': {
      version: REACT_VERSION,
      lib: () => ReactJsxRuntime,
      scope: ['default'],
      shareConfig: {
        singleton: true,
        requiredVersion: `^${REACT_VERSION.split('.')[0]}`,
      },
    },
    'react-dom': {
      version: REACT_VERSION,
      lib: () => ReactDOM,
      scope: ['default'],
      shareConfig: {
        singleton: true,
        requiredVersion: `^${REACT_VERSION.split('.')[0]}`,
      },
    },
    'react-dom/client': {
      version: REACT_VERSION,
      lib: () => ReactDomClient,
      scope: ['default'],
      shareConfig: {
        singleton: true,
        requiredVersion: `^${REACT_VERSION.split('.')[0]}`,
      },
    },
  },
});
