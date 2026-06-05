# Documentation

Deep-dive docs for the Garage Admin Console + S3 Browser monorepo. New here?
Start with [architecture.md](./architecture.md). For the top-level project
overview see the [root README](../README.md); for the agent-oriented map see
[AGENTS.md](../AGENTS.md).

| Doc | What's in it |
| --- | --- |
| [architecture.md](./architecture.md) | System design, the two products + two BFFs, repository layout, Module Federation, database schemas |
| [development.md](./development.md) | Local setup, env vars, dev servers, the 4-process embedded-MF workflow, common tasks, DB management, troubleshooting |
| [bucket-api.md](./bucket-api.md) | The shared Bucket Backend API contract both BFFs implement, plus how to run its conformance suite |
| [testing.md](./testing.md) | Test strategy (the pyramid), what's covered where, conventions, offline vs. live, coverage |
| [deployment.md](./deployment.md) | Docker images, production env vars, Docker Compose |

The contribution process — branching, Conventional Commits, versioning, code
style — lives in [CONTRIBUTING.md](../CONTRIBUTING.md).
