#!/usr/bin/env bash
set -euo pipefail

mode="${1:-layout-only}"
case "$mode" in
  layout-only | bucket-api)
    ;;
  *)
    echo "Usage: $0 [layout-only|bucket-api]" >&2
    exit 2
    ;;
esac

: "${GARAGE_IMAGE:?GARAGE_IMAGE is required}"
: "${RPC_SECRET:?RPC_SECRET is required}"
: "${TEST_S3_REGION:?TEST_S3_REGION is required}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN is required}"

container_name="${GARAGE_CONTAINER_NAME:-garage-${GITHUB_JOB:-live-tests}}"
config_path="${GARAGE_CONFIG_PATH:-/tmp/${container_name}.toml}"

cat > "$config_path" <<EOF
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_secret = "${RPC_SECRET}"
[s3_api]
s3_region = "${TEST_S3_REGION}"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.local"
[admin]
api_bind_addr = "[::]:3903"
admin_token = "${ADMIN_TOKEN}"
EOF

docker rm -f "$container_name" >/dev/null 2>&1 || true
docker create --name "$container_name" --network host "$GARAGE_IMAGE" >/dev/null
docker cp "$config_path" "$container_name:/etc/garage.toml"
docker start "$container_name"

g() {
  docker exec "$container_name" /garage -c /etc/garage.toml "$@"
}

for _ in $(seq 1 30); do
  if g status >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! g status >/dev/null 2>&1; then
  echo "Garage did not become ready in time." >&2
  docker logs "$container_name" >&2 || true
  exit 1
fi

node_id="$(g status | awk 'NR>2 && $1 ~ /^[0-9a-f]/ {print $1; exit}')"
if [[ -z "$node_id" ]]; then
  echo "Could not read Garage node id from status output." >&2
  g status >&2 || true
  exit 1
fi

echo "Garage node: $node_id"
g layout assign -z dc1 -c 1G "$node_id"
g layout apply --version 1

if [[ "$mode" != "bucket-api" ]]; then
  exit 0
fi

: "${TEST_S3_BUCKET:?TEST_S3_BUCKET is required for bucket-api provisioning}"

g bucket create "$TEST_S3_BUCKET"
key_out="$(g key create ci-key)"
access_key="$(printf '%s\n' "$key_out" | grep -iE 'Key ID' | grep -oE 'GK[0-9a-f]+' | head -1)"
secret_key="$(printf '%s\n' "$key_out" | grep -iE 'Secret key' | awk '{print $NF}' | head -1)"

if [[ -z "$access_key" || -z "$secret_key" ]]; then
  echo "Could not parse Garage key output." >&2
  printf '%s\n' "$key_out" >&2
  exit 1
fi

g bucket allow --read --write --owner "$TEST_S3_BUCKET" --key ci-key

echo "::add-mask::$access_key"
echo "::add-mask::$secret_key"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "access_key=$access_key"
    echo "secret_key=$secret_key"
  } >> "$GITHUB_OUTPUT"
else
  printf 'TEST_S3_ACCESS_KEY=%s\n' "$access_key"
  printf 'TEST_S3_SECRET_KEY=%s\n' "$secret_key"
fi
