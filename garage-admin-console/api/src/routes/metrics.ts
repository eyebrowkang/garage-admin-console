import { type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import axios from 'axios';

import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { decrypt } from '../encryption.js';
import { logger } from '../logger.js';

/**
 * Raw Prometheus metrics passthrough — INTENTIONALLY UNAUTHENTICATED.
 *
 * There is no Metrics UI by design (see routes/proxy.ts). This endpoint
 * transparently proxies a cluster's Garage `/metrics` so it can be opened
 * directly in a browser or scraped by Prometheus — neither of which can carry
 * the console's JWT (it lives in localStorage, not a cookie). It is therefore
 * browser-navigable on purpose: the cluster's stored, read-only metric token
 * (falling back to the admin token) is used server-side and the raw text is
 * forwarded as-is.
 *
 * Trade-off, accepted for this internal single-user tool: anyone who can reach
 * the BFF can read a cluster's metrics. Garage's own `/metrics` is likewise
 * optional-auth. If this ever needs locking down, gate it here.
 */
export async function rawMetricsHandler(req: Request, res: Response): Promise<void> {
  const { clusterId } = req.params;
  try {
    const [cluster] = await db
      .select()
      .from(clusters)
      .where(eq(clusters.id, String(clusterId)))
      .limit(1);

    if (!cluster) {
      res.status(404).type('text/plain').send('Cluster not found');
      return;
    }

    const token = cluster.metricToken ? decrypt(cluster.metricToken) : decrypt(cluster.adminToken);
    const baseUrl = cluster.endpoint.replace(/\/+$/, '');

    const response = await axios.get(`${baseUrl}/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
      responseType: 'text',
      validateStatus: () => true, // forward the upstream status transparently
    });

    const contentType =
      (response.headers['content-type'] as string | undefined) ??
      'text/plain; version=0.0.4; charset=utf-8';
    res.status(response.status).type(contentType).send(response.data);
  } catch (error: unknown) {
    // Log only the message — an AxiosError would carry the bearer token.
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: message, clusterId }, 'Metrics passthrough error');
    res.status(502).type('text/plain').send('Bad Gateway');
  }
}
