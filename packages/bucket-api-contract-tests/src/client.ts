import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { ContractTestConfig } from './env.js';

/**
 * A thin axios wrapper aimed at the Bucket Backend API. Caller supplies
 * baseUrl + jwt up front; per-call shape mirrors the §2.4 contract.
 */
export class BucketApiClient {
  private constructor(
    private readonly bff: AxiosInstance,
    public readonly connectionId: string,
    public readonly bucket: string,
  ) {}

  static async create(cfg: ContractTestConfig): Promise<BucketApiClient> {
    // 1. Log in to the BFF.
    const loginRes = await axios.post(`${cfg.bffUrl}/auth/login`, {
      password: cfg.bffPassword,
    });
    const token = loginRes.data.token as string;

    const bff = axios.create({
      baseURL: cfg.bffUrl,
      headers: { Authorization: `Bearer ${token}` },
    });

    // 2. Resolve or create a connection.
    let connectionId = cfg.connectionId;
    if (!connectionId) {
      if (!cfg.s3) throw new Error('TEST_S3_* env required when TEST_CONNECTION_ID is unset');
      const res = await bff.post('/connections', {
        name: `contract-test-${Date.now()}`,
        endpoint: cfg.s3.endpoint,
        region: cfg.s3.region,
        forcePathStyle: cfg.s3.forcePathStyle,
        accessKeyId: cfg.s3.accessKeyId,
        secretAccessKey: cfg.s3.secretAccessKey,
      });
      connectionId = res.data.id as string;
    }

    return new BucketApiClient(bff, connectionId, cfg.bucket);
  }

  /** Tear down any connection we created on demand. */
  async dispose({ ownedConnection }: { ownedConnection: boolean }): Promise<void> {
    if (ownedConnection) {
      await this.bff.delete(`/connections/${this.connectionId}`);
    }
  }

  private path(suffix: string): string {
    return `/connections/${this.connectionId}/buckets/${this.bucket}${suffix}`;
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

  async presign(body: { key: string; operation: 'getObject' | 'putObject'; expiresIn?: number }) {
    const res = await this.bff.post(this.path('/presign'), body);
    return res.data as { url: string; expiresAt: string };
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
