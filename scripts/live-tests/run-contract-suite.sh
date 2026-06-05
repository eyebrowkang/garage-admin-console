#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=3002}"
: "${DATA_DIR:=/tmp/s3-browser-data}"

mkdir -p "$DATA_DIR"

node s3-browser/api/dist/index.js &
bff_pid=$!

cleanup() {
  kill "$bff_pid" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if ! kill -0 "$bff_pid" 2>/dev/null; then
    echo "S3 Browser BFF exited before becoming healthy." >&2
    wait "$bff_pid" || true
    exit 1
  fi

  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null; then
    pnpm -F @garage/bucket-api-contract-tests test:run
    exit 0
  fi

  sleep 1
done

echo "S3 Browser BFF did not become healthy on port ${PORT} in time." >&2
exit 1
