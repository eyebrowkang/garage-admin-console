# Contributing to Garage Admin Console

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 10+

### Setup

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

pnpm install
pnpm approve-builds    # if prompted for native builds

cp api/.env.example api/.env
# Edit api/.env with your settings

pnpm -C api db:push    # initialize database
pnpm dev               # start development servers
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

See [DEVELOPMENT.md](./DEVELOPMENT.md) for full architecture details and advanced topics.

## Development Workflow

1. Fork the repository and create a feature branch from `main`.
2. Make your changes.
3. Run the checks:

```bash
pnpm lint
pnpm -C api typecheck
pnpm -C web build
pnpm test
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

Examples:

```
feat: add bucket quota editing
fix: correct JWT expiry check on proxy routes
docs: update Docker deployment instructions
```

## Code Style

- **Prettier**: 100-char width, single quotes, trailing commas, semicolons, 2-space indent
- **ESLint 9**: flat config with TypeScript rules
- **TypeScript**: strict mode in both packages

```bash
pnpm format      # auto-format
pnpm lint:fix    # auto-fix lint issues
```

## Pull Requests

- Keep PRs focused — one feature or fix per PR.
- Include a clear description of what changed and why.
- Link related issues (`Fixes #123`).
- Ensure CI checks pass before requesting review.

## Reporting Issues

Use the [issue templates](https://github.com/eyebrowkang/garage-admin-console/issues/new/choose) on GitHub. Please include:

- Steps to reproduce (for bugs)
- Garage Admin Console version and Garage cluster version
- Deployment method (Docker, from source, etc.)

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](./LICENSE) license.
