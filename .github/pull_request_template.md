## Summary

<!-- Brief description of what this PR does. -->

## Changes

<!-- List the key changes. -->

-

## Related issues

<!-- Link to related issues: Fixes #123, Closes #456 -->

## Checklist

- [ ] Code follows the project's style guidelines (`pnpm lint && pnpm format:check`)
- [ ] Types check successfully (`pnpm -C garage-admin-console/api typecheck && pnpm -C garage-admin-console/web build`)
- [ ] Tests pass (`pnpm test`)
- [ ] If `s3-browser/*` changed: `pnpm -C s3-browser/api typecheck && pnpm -C s3-browser/web build`
- [ ] If a Bucket Backend API surface changed: `pnpm -C packages/bucket-api-contract-tests test:run` against the affected BFF(s)
- [ ] Changes are documented (if applicable)
