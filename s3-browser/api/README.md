# @s3-browser/api

S3 Browser BFF.

**Status:** placeholder. Scaffolding only — no implementation in this commit.

When implemented this BFF will mirror `@garage-admin/api`:

- Express 5 + Drizzle (LibSQL/SQLite)
- JWT auth
- AES-256-GCM encrypted S3 connection credentials
- Implements the Bucket Backend API contract (see `designs/mf-integration-plan.md` §2.4)

See `designs/mf-integration-plan.md` for the full architectural contract.
