#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

SERVER="${SERVER:-ecs-user@8.210.32.131}"
REMOTE_DIR="${REMOTE_DIR:-/opt/law-app}"
API_IMAGE="${API_IMAGE:-law-app-api}"
WEB_IMAGE="${WEB_IMAGE:-law-app-web}"
SKIP_CHECKS="${SKIP_CHECKS:-0}"
BUILD_ONLY="${BUILD_ONLY:-0}"
SMOKE_PORT="${SMOKE_PORT:-18080}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api/v1}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || echo manual)"

echo "==> repo:       $ROOT_DIR"
echo "==> server:     $SERVER"
echo "==> remote dir: $REMOTE_DIR"
echo "==> api image:  $API_IMAGE:$TAG (+ latest)"
echo "==> web image:  $WEB_IMAGE:$TAG (+ latest)"

run_host_checks() {
  echo "==> checking local Docker..."
  docker --version
  docker compose version

  if [ "$BUILD_ONLY" != "1" ]; then
    echo "==> checking remote Docker..."
    ssh "$SERVER" "docker --version && docker compose version"
  fi

  if [ "$SKIP_CHECKS" = "1" ]; then
    echo "==> skipping host quality checks (SKIP_CHECKS=1)"
    return
  fi

  if command -v pnpm >/dev/null 2>&1 && command -v uv >/dev/null 2>&1; then
    echo "==> running host quality checks..."
    pnpm test
    pnpm typecheck
    pnpm lint
    pnpm build
  else
    echo "==> skipping host quality checks (pnpm or uv not found)"
  fi
}

build_images() {
  echo "==> building API image..."
  DOCKER_BUILDKIT=1 docker build \
    --target api \
    -t "$API_IMAGE:$TAG" \
    -t "$API_IMAGE:latest" \
    -f docker/Dockerfile .

  echo "==> building Web image..."
  DOCKER_BUILDKIT=1 docker build \
    --target web \
    --build-arg "VITE_API_BASE_URL=$VITE_API_BASE_URL" \
    -t "$WEB_IMAGE:$TAG" \
    -t "$WEB_IMAGE:latest" \
    -f docker/Dockerfile .
}

smoke_test_web() {
  local name="law-app-web-smoke"
  echo "==> smoke testing web image on :$SMOKE_PORT ..."
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -p "$SMOKE_PORT:80" "$WEB_IMAGE:latest" >/dev/null
  sleep 1
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "http://localhost:$SMOKE_PORT/" || echo 000)"
  echo "==> web smoke HTTP $code"
  docker logs --tail 20 "$name" || true
  docker rm -f "$name" >/dev/null 2>&1 || true
  if [ "$code" != "200" ]; then
    echo "!! web smoke failed, expected 200 and got $code. Images were not uploaded."
    exit 1
  fi
}

push_images() {
  echo "==> pushing images to $SERVER ..."
  docker save \
    "$API_IMAGE:latest" "$API_IMAGE:$TAG" \
    "$WEB_IMAGE:latest" "$WEB_IMAGE:$TAG" \
    | gzip | ssh "$SERVER" docker load
}

sync_remote_files() {
  echo "==> syncing compose files..."
  ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
  scp docker/docker-compose.prod.yml "$SERVER:$REMOTE_DIR/docker-compose.yml"
  scp docker/docker-compose.infra.prod.yml "$SERVER:$REMOTE_DIR/docker-compose.infra.yml"
  scp docker/prod.env.example "$SERVER:$REMOTE_DIR/prod.env.example"
}

start_remote_services() {
  echo "==> starting remote services..."
  ssh "$SERVER" "
    set -eu
    cd '$REMOTE_DIR'
    if [ ! -f .env ]; then
      echo '!! missing remote .env. Copy prod.env.example to .env and replace placeholders.'
      exit 1
    fi
    mkdir -p uploads
    docker compose --env-file .env -f docker-compose.infra.yml up -d
    for i in \$(seq 1 30); do
      status=\$(docker inspect -f '{{.State.Health.Status}}' law-app-postgres 2>/dev/null || echo starting)
      if [ \"\$status\" = healthy ]; then
        break
      fi
      if [ \"\$i\" = 30 ]; then
        echo \"!! postgres health did not become healthy (status=\$status)\"
        exit 1
      fi
      sleep 2
    done
    LAW_APP_TAG=latest docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans
  "
}

remote_health_check() {
  echo "==> remote health check..."
  local web_port
  web_port="$(ssh "$SERVER" "cd '$REMOTE_DIR' && awk -F= '/^WEB_PORT=/{print \$2; exit}' .env 2>/dev/null || true")"
  web_port="${web_port:-80}"

  local web_code
  web_code="$(ssh "$SERVER" "curl -fsS -o /dev/null -w '%{http_code}' --retry 5 --retry-delay 2 --retry-connrefused http://localhost:$web_port/ 2>/dev/null || echo 000")"
  echo "==> web HTTP $web_code"
  if [ "$web_code" != "200" ]; then
    echo "!! web health check failed. Old images were not deleted."
    echo "   rollback: ssh $SERVER \"cd $REMOTE_DIR && LAW_APP_TAG=<old-git-short-sha> docker compose --env-file .env -f docker-compose.yml up -d\""
    exit 1
  fi

  local api_code
  api_code="$(ssh "$SERVER" "curl -fsS -o /dev/null -w '%{http_code}' --retry 5 --retry-delay 2 --retry-connrefused http://localhost:$web_port/api/v1/health 2>/dev/null || echo 000")"
  echo "==> api HTTP $api_code"
  if [ "$api_code" != "200" ]; then
    echo "!! API health check failed. Old images were not deleted."
    echo "   rollback: ssh $SERVER \"cd $REMOTE_DIR && LAW_APP_TAG=<old-git-short-sha> docker compose --env-file .env -f docker-compose.yml up -d\""
    exit 1
  fi
}

run_host_checks
build_images
smoke_test_web

if [ "$BUILD_ONLY" = "1" ]; then
  echo "==> done: images built and web smoke-tested locally; nothing uploaded."
  exit 0
fi

push_images
sync_remote_files
start_remote_services
remote_health_check

echo "==> done: deployed $API_IMAGE:$TAG and $WEB_IMAGE:$TAG to $SERVER"
echo "    old images were kept for rollback."
echo "    rollback: ssh $SERVER \"cd $REMOTE_DIR && LAW_APP_TAG=<old-git-short-sha> docker compose --env-file .env -f docker-compose.yml up -d\""
