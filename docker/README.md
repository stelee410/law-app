# 生产部署手册（Docker · nginx · ECS）

本手册参考 `D:\linkyun-concept\docker\README.md` 的部署形态：构建 VM 负责 build，镜像通过 SSH 直传到 ECS，ECS 只运行 image-only compose，不在服务器上编译。

当前前后端域名尚未确认，因此生产骨架先使用同源入口：

```text
用户
  -> 未来域名或 ECS IP:80
  -> law-app-web nginx
       /            -> H5 静态文件
       /api/        -> http://api:4000
  -> law-app-api FastAPI
  -> law-app-postgres PostgreSQL
```

域名确定后再收窄 `ALLOWED_ORIGINS`、调整 nginx `server_name`，必要时再拆分前后端域名。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `Dockerfile` | 多阶段构建：`api` target 构建 FastAPI 镜像；`web-build` target 构建 Vite 静态文件；`web` target 使用 `nginx:1.27-alpine` 运行前端。 |
| `nginx.conf` | SPA fallback、`/api/` 反代、`index.html` 不缓存、`sw.js` / `registerSW.js` no-cache、hash 资源强缓存、安全头、gzip、隐藏文件 deny、`.well-known` 放行。 |
| `docker-compose.yml` | 本地/调试用，含 `build:`。 |
| `docker-compose.infra.yml` | 本地/调试 PostgreSQL。 |
| `docker-compose.prod.yml` | 生产 API + Web，只有 `image:`，不在 ECS 上 build。 |
| `docker-compose.infra.prod.yml` | 生产 PostgreSQL，默认不暴露公网 5432。 |
| `prod.env.example` | 生产 `.env` 模板，只包含占位符。 |
| `deploy.sh` | 构建 VM 一键部署脚本：build -> smoke -> save/load 直传 -> compose up -> 健康检查。 |

## 一、一次性准备

### 1. 构建 VM

构建 VM 需要 Docker + Docker Compose 插件，并能 SSH 访问 ECS。

```bash
git clone <law-app-repo-ssh-url>
cd law-app
```

无需在 VM 上安装 Node。前端 build 在 Docker 镜像内部完成。若 VM 安装了 `pnpm` 和 `uv`，`deploy.sh` 会额外执行 host 质量门；没有则自动跳过。

### 2. ECS

ECS 需要：

- Docker + Docker Compose 插件。
- 安全组放行公网入口端口，默认是 80。
- 构建 VM 免密 SSH 登录，例如当前目标：

```bash
ssh ecs-user@8.210.32.131
```

创建远端目录和生产环境文件：

```bash
ssh ecs-user@8.210.32.131 'mkdir -p /opt/law-app'
scp docker/prod.env.example ecs-user@8.210.32.131:/opt/law-app/.env
ssh ecs-user@8.210.32.131 'nano /opt/law-app/.env'
```

必须替换：

- `JWT_SECRET_KEY`
- `POSTGRES_PASSWORD`
- `ADMIN_PHONE` / `ADMIN_NAME`，如果需要启动时 bootstrap 初始管理员

域名未定时可暂保留：

```env
ALLOWED_ORIGINS=["*"]
VITE_API_BASE_URL=/api/v1
WEB_PORT=80
```

域名确定后再改为真实来源，例如：

```env
ALLOWED_ORIGINS=["https://h5.example.com","https://api.example.com"]
```

## 二、日常部署

在构建 VM 上：

```bash
cd ~/law-app
git pull
./docker/deploy.sh
```

脚本默认部署到 `ecs-user@8.210.32.131:/opt/law-app`。可覆盖：

```bash
SERVER=ecs-user@1.2.3.4 REMOTE_DIR=/srv/law-app ./docker/deploy.sh
```

跳过 host 质量门：

```bash
SKIP_CHECKS=1 ./docker/deploy.sh
```

脚本流程：

```text
local/VM checks
  -> docker build law-app-api:<sha>, law-app-web:<sha>
  -> local web smoke test
  -> docker save | gzip | ssh docker load
  -> scp prod compose files
  -> remote postgres compose up
  -> remote app compose up
  -> curl / and /api/v1/health
```

健康检查失败会退出并保留旧镜像，不自动清理。

Windows 拉取后脚本可能带 CRLF，在构建 VM 上执行：

```bash
sed -i 's/\r$//' docker/deploy.sh && chmod +x docker/deploy.sh
```

## 三、先验证，再上传

只 build 和本地冒烟，不上传：

```bash
BUILD_ONLY=1 ./docker/deploy.sh
```

默认本地冒烟端口是 18080，可覆盖：

```bash
SMOKE_PORT=19080 BUILD_ONLY=1 ./docker/deploy.sh
```

## 四、生产 compose 预演

在有 Docker 的机器上，用生产 compose 验证 image-only 形态：

```bash
cp docker/prod.env.example .env
# 编辑 .env 中的 secret 和 postgres 密码
docker compose --env-file .env -f docker/docker-compose.infra.prod.yml up -d
LAW_APP_TAG=latest WEB_PORT=18080 docker compose --env-file .env -f docker/docker-compose.prod.yml up -d
curl -I http://localhost:18080/
curl http://localhost:18080/api/v1/health
docker compose --env-file .env -f docker/docker-compose.prod.yml down --remove-orphans
docker compose --env-file .env -f docker/docker-compose.infra.prod.yml down
rm .env
```

## 五、回滚

每次部署会保留 `latest` 和 git 短 SHA 两个 tag。查看远端镜像：

```bash
ssh ecs-user@8.210.32.131 'docker images | grep law-app'
```

回滚：

```bash
ssh ecs-user@8.210.32.131 \
  'cd /opt/law-app && LAW_APP_TAG=<old-git-short-sha> docker compose --env-file .env -f docker-compose.yml up -d'
```

## 六、上线后验证

```bash
ssh ecs-user@8.210.32.131 'docker ps'
ssh ecs-user@8.210.32.131 'curl -I http://localhost/'
ssh ecs-user@8.210.32.131 'curl http://localhost/api/v1/health'
ssh ecs-user@8.210.32.131 'docker logs --tail 50 law-app-web'
ssh ecs-user@8.210.32.131 'docker logs --tail 50 law-app-api'
```

期望：

- `/` 返回 200，响应头由 nginx 返回。
- `/api/v1/health` 返回 `ok: true`。
- API health 中 `storage` 为 `postgres`。

## 七、PWA / 缓存注意事项

`sw.js` 和 `registerSW.js` 是固定路径，不能用 hash 文件名解决版本问题。nginx 必须返回：

```text
Cache-Control: no-cache, must-revalidate
```

若未来接入 Cloudflare 或其他 CDN，部署后旧用户仍看到旧版时，优先检查：

```bash
curl -sI https://<domain>/sw.js | grep -iE 'cache-control|cf-cache-status|age'
curl -sI "https://<domain>/sw.js?cb=$(date +%s)" | grep -iE 'cache-control|cf-cache-status'
```

如果无 cache-buster 是旧 `HIT`，但 cache-buster 是新内容，清 CDN 的 `/sw.js`、`/registerSW.js`、`/index.html`。

## 八、排障

| 现象 | 处理 |
| --- | --- |
| SSH 失败 | 确认构建 VM 能用同一用户免密登录 ECS；当前 Windows 环境没有默认私钥时，Codex 无法直接登录。 |
| 远端缺 `.env` | 用 `docker/prod.env.example` 派生 `/opt/law-app/.env`，替换 secret 后再部署。 |
| `docker build` 失败 | 先看 `pnpm-lock.yaml` / `uv.lock` 是否与依赖声明一致。 |
| Web 200 但 API 502 | 查 `docker logs law-app-api` 和 `docker logs law-app-web`，确认 API health、Postgres 密码和网络。 |
| Postgres 不健康 | 查 `docker logs law-app-postgres`，确认 `POSTGRES_PASSWORD`、磁盘空间和数据卷权限。 |
| 80 被占用 | `ssh ecs-user@8.210.32.131 'docker ps; ss -tlnp | grep :80'`，停掉占用服务或改 `WEB_PORT`。 |
