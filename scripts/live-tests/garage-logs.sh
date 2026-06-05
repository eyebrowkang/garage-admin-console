#!/usr/bin/env bash
set -euo pipefail

container_name="${GARAGE_CONTAINER_NAME:-garage-${GITHUB_JOB:-live-tests}}"

if ! docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Garage container '$container_name' does not exist; no logs to show."
  exit 0
fi

docker logs "$container_name" 2>&1 | tail -100
