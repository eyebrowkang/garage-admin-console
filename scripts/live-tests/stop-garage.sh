#!/usr/bin/env bash
set -euo pipefail

container_name="${GARAGE_CONTAINER_NAME:-garage-${GITHUB_JOB:-live-tests}}"

docker rm -f "$container_name" >/dev/null 2>&1 || true
