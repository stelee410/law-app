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
scp docker/prod.env.example ecs-user@8.210.32.131:/opt/law-app/prod.env.example
ssh ecs-user@8.210.32.131
```

首次部署前，必须在 ECS 上手动创建一次 `/opt/law-app/.env`：

```bash
cd /opt/law-app
cp prod.env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -base64 32
nano .env
```

至少替换 `JWT_SECRET_KEY` 和 `POSTGRES_PASSWORD`，不能保留 `replace-with...` 占位值。`deploy.sh` 每次会同步新的 `prod.env.example`，但不会覆盖已有 `.env`；`.env` 创建并配置好以后，后续部署不需要重复手动创建。

### 3. 生产 `.env` 填写清单

`docker/prod.env.example` 要复制成 ECS 上的 `/opt/law-app/.env` 后再改。当前部署目标是 `8.210.32.131`，先按单入口运行：公网访问 `http://8.210.32.131/`，nginx 反代 `/api/` 到 API 容器。

必须改掉的值：

| 变量 | 是否必须修改 | 建议填写 | 说明 |
| --- | --- | --- | --- |
| `JWT_SECRET_KEY` | 必须 | 一段足够长的随机密钥 | 用于签发登录 token，不能使用 `replace-with-a-long-random-secret`。 |
| `POSTGRES_PASSWORD` | 必须 | PostgreSQL 强密码 | API 和 PostgreSQL 容器共用这个密码。首次初始化数据卷后不要随便改，否则已有数据库用户密码不会自动同步。 |

管理员初始化按需启用：

| 变量 | 是否必须修改 | 建议填写 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_PHONE` | 可选 | 管理员手机号 | 如果要启动时自动创建初始管理员，和 `ADMIN_NAME`、`ADMIN_PASSWORD` 一起填写；不启用就留空。 |
| `ADMIN_NAME` | 可选 | 管理员姓名 | 只在 `ADMIN_PHONE` 同时存在时生效。 |
| `ADMIN_PASSWORD` | 启用管理员时必须 | 管理员强密码 | 启用管理员时必须替换 `replace-with-a-strong-admin-password`；不启用管理员时建议留空。 |

当前 ECS/IP 单入口可以保持默认：

| 变量 | 建议填写 | 说明 |
| --- | --- | --- |
| `APP_ENV` | `production` | 生产环境标识。 |
| `PROJECT_NAME` | `law-app` | health 接口里的服务名。 |
| `VERSION` | `0.1.0` | 当前应用版本号。 |
| `DEBUG` | `false` | 生产保持关闭。 |
| `API_V1_STR` | `/api/v1` | API 路由前缀，nginx 当前也按这个路径转发。 |
| `ALLOWED_ORIGINS` | `["*"]` | 域名未定时可暂时保留；域名确定后再收窄。 |
| `STORAGE_BACKEND` | `postgres` | 生产必须使用 PostgreSQL。 |
| `UPLOAD_DIR` | `/app/uploads` | API 容器内上传目录，不要改成宿主机路径。 |
| `UPLOADS_DIR` | `./uploads` | ECS 上 `/opt/law-app/uploads`，由 compose 挂载到容器内 `/app/uploads`。 |
| `POSTGRES_HOST` | `postgres` | Docker 网络里的 PostgreSQL 服务名，不要写 `localhost`、ECS IP 或公网 IP。 |
| `POSTGRES_DB` | `law_app` | 数据库名。 |
| `POSTGRES_USER` | `law_app` | 数据库用户名。 |
| `POSTGRES_PORT` | `5432` | 容器网络内 PostgreSQL 端口，不是公网映射端口。生产 infra compose 默认不暴露公网 5432。 |
| `POSTGRES_POOL_SIZE` | `5` | API 连接池基础连接数。 |
| `POSTGRES_MAX_OVERFLOW` | `10` | API 连接池额外连接数。 |
| `WEB_PORT` | `80` | ECS 对外 Web 端口；如果 80 被占用再改。 |
| `LAW_APP_TAG` | `latest` | 默认运行最新镜像；回滚时才改成旧的 git 短 SHA。 |
| `VITE_API_BASE_URL` | `/api/v1` | 前端构建期 API 基础路径；当前同源入口保持默认即可。 |
| `LOG_LEVEL` | `INFO` | 生产日志级别。 |
| `LOG_FORMAT` | `console` | 当前容器日志格式。 |

AI 和观测配置可以先留空：

| 变量 | 是否必须修改 | 说明 |
| --- | --- | --- |
| `OPENAI_API_BASE` | 可选 | 接入大模型时填写，例如兼容 OpenAI 的 API base。 |
| `OPENAI_API_KEY` | 可选 | 接入大模型时填写。 |
| `DEFAULT_LLM_MODEL` | 可选 | 接入大模型时填写默认模型名。 |
| `DEFAULT_LLM_TEMPERATURE` | 可保留 `0.7` | 默认生成温度。 |
| `LANGFUSE_PUBLIC_KEY` | 可选 | 接入 Langfuse 时填写。 |
| `LANGFUSE_SECRET_KEY` | 可选 | 接入 Langfuse 时填写。 |
| `LANGFUSE_HOST` | 可选 | 接入 Langfuse 时填写。 |

一般不需要改：

| 变量 | 建议填写 | 说明 |
| --- | --- | --- |
| `MOCK_OTP_CODE` | `123456` | 当前本地 mock OTP 码。对公网开放前应确认是否仍允许固定验证码。 |
| `OTP_EXPIRE_MINUTES` | `5` | 验证码过期时间。 |
| `TOKEN_EXPIRE_DAYS` | `30` | 登录 token 有效期。 |
| `JWT_ALGORITHM` | `HS256` | JWT 算法，和代码默认一致。 |
| `JWT_ACCESS_TOKEN_EXPIRE_DAYS` | `30` | 显式覆盖 token 有效期；和 `TOKEN_EXPIRE_DAYS` 保持一致即可。 |

域名确定后再把 `ALLOWED_ORIGINS` 改为真实来源，例如：

```env
ALLOWED_ORIGINS=["https://h5.example.com","https://api.example.com"]
```

如果未来不再使用 `/api/v1` 作为前端请求路径，除了修改 `.env` 中的 `VITE_API_BASE_URL`，还要在构建 VM 执行部署脚本时同步传入同名构建期变量，例如 `VITE_API_BASE_URL=/new-api ./docker/deploy.sh`。当前同源入口不需要改。

## 二、日常部署

在构建 VM 上：

```bash
cd /usr/local/src/law-app
git pull
./docker/deploy.sh
```

只要 ECS 上已经存在 `/opt/law-app/.env`，后续日常部署都走上面的 VM 命令即可。脚本会自动构建镜像、上传镜像、同步 compose 文件、启动/更新 PostgreSQL、API 和 Web，并执行健康检查；不需要每次手动在 ECS 上运行 `docker compose up`，除非正在排障。

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

## 三、在 VM 先验证，再上传

VM 上可能已经运行其他应用，验证 compose 默认避开常见占用端口：

```env
API_HOST_PORT=14000
WEB_HOST_PORT=18080
POSTGRES_HOST_PORT=15432
POSTGRES_PORT=5432
```

`POSTGRES_HOST_PORT` 是 VM 宿主机映射端口；`POSTGRES_PORT` 是容器网络内 API 连接 PostgreSQL 的端口，通常必须保持 `5432`。不要为了避开宿主机端口冲突去改 `POSTGRES_PORT`。

完整验证 API + Web + PostgreSQL：

```bash
cd /usr/local/src/law-app
docker compose -p law-app-verify --env-file apps/api/.env -f docker/docker-compose.infra.yml up -d
docker compose -p law-app-verify --env-file apps/api/.env -f docker/docker-compose.yml up --build -d
curl -I http://localhost:18080/
curl http://localhost:18080/api/v1/health
docker compose -p law-app-verify --env-file apps/api/.env -f docker/docker-compose.yml down --remove-orphans
docker compose -p law-app-verify --env-file apps/api/.env -f docker/docker-compose.infra.yml down
```

如果这些端口仍然冲突，可只改宿主机映射端口：

```bash
API_HOST_PORT=14001 WEB_HOST_PORT=18081 POSTGRES_HOST_PORT=15433 \
  docker compose -p law-app-verify --env-file apps/api/.env -f docker/docker-compose.infra.yml up -d
API_HOST_PORT=14001 WEB_HOST_PORT=18081 POSTGRES_HOST_PORT=15433 \
  docker compose -p law-app-verify --env-file apps/api/.env -f docker/docker-compose.yml up --build -d
```

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
| 镜像已上传但没有容器 | 如果 `docker images` 能看到 `law-app-api` / `law-app-web`，但 `docker ps -a` 为空，优先检查 `cd /opt/law-app && test -f .env`。缺 `.env` 时 `deploy.sh` 会在远程启动阶段退出，只会留下已上传镜像，不会创建容器。 |
| `docker build` 失败 | 先看 `pnpm-lock.yaml` / `uv.lock` 是否与依赖声明一致。 |
| Web 200 但 API 502 | 查 `docker logs law-app-api` 和 `docker logs law-app-web`，确认 API health、Postgres 密码和网络。 |
| Postgres 不健康 | 查 `docker logs law-app-postgres`，确认 `POSTGRES_PASSWORD`、磁盘空间和数据卷权限。 |
| 80 被占用 | `ssh ecs-user@8.210.32.131 'docker ps; ss -tlnp | grep :80'`，停掉占用服务或改 `WEB_PORT`。 |
