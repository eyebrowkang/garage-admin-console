import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { BffFlavor, ContractTestConfig } from './env.js';

/**
 * A thin axios wrapper aimed at the Bucket Backend API. Caller supplies
 * baseUrl + jwt up front; per-call shape mirrors the routes both BFFs
 * implement.
 *
 * The path template is flavor-driven so the same suite can exercise both
 * `s3-browser/api` (connections) and `garage-admin-console/api` (clusters).
 */
export class BucketApiClient {
  private constructor(
    private readonly bff: AxiosInstance,
    public readonly ownerId: string,
    public readonly bucket: string,
    private readonly flavor: BffFlavor,
  ) {}

  static async create(cfg: ContractTestConfig): Promise<BucketApiClient> {
    // 1. Log in to the BFF.
    const loginRes = await axios.post(`${cfg.bffUrl}/auth/login`, {
      password: cfg.bffPassword,
    });
    const token = loginRes.data.token as string;

    const extraHeaders: Record<string, string> = {};
    if (cfg.accessKeyId) {
      extraHeaders['X-Garage-Access-Key-Id'] = cfg.accessKeyId;
    }
    const bff = axios.create({
      baseURL: cfg.bffUrl,
      headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    });

    // 2. Resolve or create a bucket-owning row.
    let ownerId = cfg.ownerId;
    if (!ownerId) {
      if (cfg.flavor !== 'connections') {
        throw new Error('Cluster-flavor BFFs cannot auto-create owners; supply TEST_CLUSTER_ID');
      }
      if (!cfg.s3) throw new Error('TEST_S3_* env required when TEST_CONNECTION_ID is unset');
      const res = await bff.post('/connections', {
        name: `contract-test-${Date.now()}`,
        endpoint: cfg.s3.endpoint,
        region: cfg.s3.region,
        forcePathStyle: cfg.s3.forcePathStyle,
        accessKeyId: cfg.s3.accessKeyId,
        secretAccessKey: cfg.s3.secretAccessKey,
      });
      ownerId = res.data.id as string;
    }

    return new BucketApiClient(bff, ownerId, cfg.bucket, cfg.flavor);
  }

  /** Tear down any owner row we created on demand. */
  async dispose({ ownedOwner }: { ownedOwner: boolean }): Promise<void> {
    if (ownedOwner && this.flavor === 'connections') {
      await this.bff.delete(`/connections/${this.ownerId}`);
    }
  }

  private path(suffix: string): string {
    const base =
      this.flavor === 'clusters'
        ? `/clusters/${this.ownerId}/buckets/${this.bucket}`
        : `/connections/${this.ownerId}/buckets/${this.bucket}`;
    return `${base}${suffix}`;
  }

  async list(
    params: {
      prefix?: string;
      delimiter?: string;
      continuationToken?: string;
      maxKeys?: number;
    } = {},
  ): Promise<{
    objects: {
      key: string;
      size: number;
      etag: string;
      lastModified: string | null;
      storageClass: string | null;
    }[];
    prefixes: string[];
    nextContinuationToken?: string;
  }> {
    const res = await this.bff.get(this.path('/list'), { params });
    return res.data;
  }

  async object(key: string) {
    const res = await this.bff.get(this.path('/object'), { params: { key } });
    return res.data;
  }

  async presign(body: {
    key: string;
    operation: 'getObject' | 'putObject';
    expiresIn?: number;
    responseContentDisposition?: string;
  }) {
    const res = await this.bff.post(this.path('/presign'), body);
    return res.data as { url: string; expiresAt: string };
  }

  async multipartCreate(body: { key: string; contentType?: string }) {
    const res = await this.bff.post(this.path('/multipart/create'), body);
    return res.data as { uploadId: string; key: string; partSize: number; maxParts: number };
  }

  async multipartSign(body: {
    key: string;
    uploadId: string;
    partNumbers: number[];
    expiresIn?: number;
  }) {
    const res = await this.bff.post(this.path('/multipart/sign'), body);
    return res.data as { urls: { partNumber: number; url: string }[]; expiresAt: string };
  }

  async multipartComplete(body: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }) {
    const res = await this.bff.post(this.path('/multipart/complete'), body);
    return res.data as { key: string; etag: string; location: string | null };
  }

  async multipartAbort(body: { key: string; uploadId: string }) {
    const res = await this.bff.post(this.path('/multipart/abort'), body);
    return res.data as { ok: true };
  }

  async upload(
    files: { name: string; body: string | Buffer; contentType?: string }[],
    prefix?: string,
  ) {
    const form = new FormData();
    if (prefix) form.append('prefix', prefix);
    for (const f of files) {
      form.append('file', f.body, {
        filename: f.name,
        contentType: f.contentType ?? 'application/octet-stream',
      });
    }
    const res = await this.bff.post(this.path('/upload'), form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return res.data as { uploaded: { key: string; etag: string; size: number }[] };
  }

  async deleteObjects(keys: string[]) {
    const res = await this.bff.delete(this.path('/objects'), { data: { keys } });
    return res.data as { deleted: string[]; errors: { key: string; message: string }[] };
  }

  async copy(src: string, dst: string) {
    const res = await this.bff.post(this.path('/copy'), { src, dst });
    return res.data as { etag: string };
  }
}
