/**
 * Standalone-mode axios instance.
 *
 * Used ONLY by the standalone composition (Login, Connections, BucketList,
 * the modals when invoked from the standalone UI). The embedded
 * <FileBrowser/> builds its OWN axios from props.backend — it never
 * imports this module so it stays self-contained when federated.
 */
import { createApiClient } from '@garage/web-shared';

export const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL || '/api';

const { api, readStoredToken, writeStoredToken } = createApiClient({
  baseURL: API_BASE_URL,
  tokenKey: 's3-browser.jwt',
  // The standalone composition controls its own auth surface (a render flag,
  // not a route guard), so we don't redirect — just drop the dead token.
  onUnauthorized: () => writeStoredToken(null),
});

export { api, readStoredToken, writeStoredToken };

/**
 * Build the per-bucket backend the embedded FileBrowser expects.
 *
 * In standalone mode the FileBrowser receives this object; in embedded
 * mode the Admin Console host constructs its own pointing at the Admin
 * BFF's bucket scope. The FileBrowser stays agnostic either way.
 */
export function buildBucketBackend(connectionId: string, bucket: string) {
  return {
    baseUrl: `${API_BASE_URL}/connections/${connectionId}/buckets/${bucket}`,
    authToken: readStoredToken() ?? '',
  };
}
