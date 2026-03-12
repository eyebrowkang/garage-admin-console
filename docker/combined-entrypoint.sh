#!/bin/sh

set -eu

admin_port="${PORT:-3001}"
s3_browser_port="${S3_BROWSER_PORT:-3002}"
shared_data_dir="${DATA_DIR:-/data}"
admin_data_dir="${ADMIN_DATA_DIR:-$shared_data_dir}"
s3_browser_data_dir="${S3_BROWSER_DATA_DIR:-$shared_data_dir}"
admin_static_dir="${STATIC_DIR:-/app/static}"
s3_browser_static_dir="${S3_BROWSER_STATIC_DIR:-/app/static/s3-browser}"
s3_browser_api_url="${S3_BROWSER_API_URL:-http://127.0.0.1:$s3_browser_port}"
s3_browser_admin_password="${S3_BROWSER_ADMIN_PASSWORD:-${ADMIN_PASSWORD}}"

export S3_BROWSER_API_URL="$s3_browser_api_url"
export S3_BROWSER_ADMIN_PASSWORD="$s3_browser_admin_password"

cleanup() {
  if [ "${admin_pid:-}" ]; then
    kill -TERM "$admin_pid" 2>/dev/null || true
  fi

  if [ "${s3_browser_pid:-}" ]; then
    kill -TERM "$s3_browser_pid" 2>/dev/null || true
  fi
}

trap cleanup INT TERM

(
  export PORT="$s3_browser_port"
  export DATA_DIR="$s3_browser_data_dir"
  unset STATIC_DIR
  unset S3_BROWSER_STATIC_DIR
  exec node /app/s3-browser-api/dist/index.js
) &
s3_browser_pid=$!

(
  export PORT="$admin_port"
  export DATA_DIR="$admin_data_dir"
  export STATIC_DIR="$admin_static_dir"
  export S3_BROWSER_STATIC_DIR="$s3_browser_static_dir"
  exec node /app/admin/dist/index.js
) &
admin_pid=$!

exit_status=0

while kill -0 "$admin_pid" 2>/dev/null && kill -0 "$s3_browser_pid" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "$admin_pid" 2>/dev/null; then
  wait "$admin_pid" || exit_status=$?
fi

if ! kill -0 "$s3_browser_pid" 2>/dev/null; then
  wait "$s3_browser_pid" || exit_status=$?
fi

cleanup

wait "$admin_pid" 2>/dev/null || true
wait "$s3_browser_pid" 2>/dev/null || true

exit "$exit_status"
