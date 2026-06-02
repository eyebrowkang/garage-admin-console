# Contributing to Garage Admin Console

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 11+ (the repo pins `pnpm@11.3.0`)

### Setup

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

pnpm install
pnpm approve-builds    # if prompted for native builds

cp garage-admin-console/api/.env.example garage-admin-console/api/.env
# Optionally also configure the S3 Browser BFF:
cp s3-browser/api/.env.example s3-browser/api/.env

pnpm -C garage-admin-console/api db:push    # initialize Admin database
pnpm dev                                    # start Admin api :3001 + web :5173
```

The repo is a pnpm workspace with two products (`garage-admin-console/`, `s3-browser/`) plus shared packages under `packages/`. See [docs/architecture.md](./docs/architecture.md) for full architecture details.

To work on the S3 Browser side in parallel:

```bash
# Second terminal
pnpm -C s3-browser/api dev    # BFF on :3002
pnpm -C s3-browser/web dev    # web on :5174 — exposes the Module Federation manifest
```

## Development Workflow

**Never commit directly to `main`.** All changes — features, fixes, docs — must go through a feature branch and pull request.

1. Fork the repository and create a feature branch from `main`.
2. Make your changes.
3. Run the checks:

```bash
pnpm lint                                              # Admin lint
pnpm -C garage-admin-console/api typecheck             # Admin api types
pnpm -C garage-admin-console/web build                 # Admin web types (compiled)
pnpm test                                              # Admin vitest

# If you touched any Bucket Backend API surface (admin or s3-browser):
pnpm -C s3-browser/api typecheck
pnpm -C packages/bucket-api-contract-tests test:run    # env-gated; see suite README

# If you touched s3-browser/web:
pnpm -C s3-browser/web build
```

4. Commit using [conventional commit](#commit-messages) format.
5. Open a pull request against `main`.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and is **required** for [Release Please](https://github.com/googleapis/release-please) to automatically generate changelogs and create release PRs. Non-conventional commits will be ignored by Release Please.

Each commit message (and PR title for squash merges) should have the format:

```
<type>: <description>
```

Types:

| Type | Purpose |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks (dependencies, CI, build) |

For changes that span both products, scoping helps readers:

```
feat: add bucket quota editing
fix(s3-browser): correct upload progress percentage
docs: update Docker deployment instructions
refactor(packages/ui): extract Skeleton primitive
```

## Versioning

This project's **major version tracks the upstream [Garage Admin API](https://garagehq.deuxfleurs.fr/) version**. For example, when the project targets Garage Admin API v2, the major version is `2.x.x`. A major version bump only happens when migrating to a new Garage API version — it does **not** follow traditional semver where any breaking change triggers a major bump.

Within a major version, minor and patch bumps follow the usual conventions:

- `fix:` commits → **patch** bump (e.g. `2.0.0` → `2.0.1`)
- `feat:` / significant `refactor:` commits → **minor** bump (e.g. `2.0.1` → `2.1.0`)

When evolving the shared surfaces (`FileBrowserProps` and the Bucket Backend API), pick a `feat:` for additive changes and treat any rename/removal as a breaking change so downstream embedders can pin against a known minor.

## Code Style

- **Prettier**: 100-char width, single quotes, trailing commas, semicolons, 2-space indent
- **ESLint 9**: flat config with TypeScript rules
- **TypeScript**: strict mode in every package

```bash
pnpm format      # auto-format
pnpm lint:fix    # auto-fix lint issues
```

## Pull Requests

- Keep PRs focused — one feature or fix per PR.
- Include a clear description of what changed and why.
- Link related issues (`Fixes #123`).
- Ensure CI checks pass before requesting review.
- If you touched a contract (`FileBrowserProps`, Bucket Backend API), call it out in the PR body — it triggers cross-app coordination.

## Reporting Issues

Use the [issue templates](https://github.com/eyebrowkang/garage-admin-console/issues/new/choose) on GitHub. Please include:

- Steps to reproduce (for bugs)
- Garage Admin Console version and Garage cluster version
- Whether you're running standalone or with the embedded S3 Browser
- Deployment method (Docker, from source, etc.)

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](./LICENSE) license.
