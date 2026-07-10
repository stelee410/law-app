# law-app

移动端 H5 法律案件闭环工作台：**验证码/密码登录** → **创建案件** → **上传证据材料** →
**AI 辅助评估** → **选择服务方案** → **查看案件进度事件**。项目当前定位是演示级 MVP，
重点验证法律案件从录入到方案选择的主流程；复杂律师协同、支付、独立任务队列和对象存储尚未接入。

## 技术栈

- **后端**：FastAPI + uvicorn，按 `auth`、`cases`、`evidence`、`events`、`workflows` 分边界组织。
- **工作流**：LangGraph 只用于案件评估边界；登录、案件 CRUD、上传和方案选择保持普通 service 代码。
- **存储**：`memory` 与 `postgres` 两种模式。`memory` 适合快速联调；`postgres` 适合演示持久化。
- **AI 评估**：确定性评估内置可用；配置 OpenAI-compatible `/chat/completions` 后会尝试 LLM 增强，失败自动回退。
- **观测**：Langfuse 为可选配置；未配置不影响主流程。
- **前端**：React 19 + Vite + TanStack Router/Query + ky + Zustand + i18next + TailwindCSS + PWA。
- **依赖管理**：后端 `uv`，前端 `pnpm`，根目录脚本串联两端。
- **容器**：`docker/Dockerfile` 多阶段构建 API 与 Web；`docker/docker-compose.yml` 启动应用，
  `docker/docker-compose.infra.yml` 启动从 0 到 1 部署需要的 PostgreSQL。

## 目录结构

```
apps/api/app/
  main.py              # FastAPI 应用装配、CORS、store 初始化
  core/
    config.py          # pydantic-settings: env、Postgres、LLM、Langfuse
    database.py        # psycopg 连接池
    schema.py          # MVP Postgres schema 初始化
  auth/                # mock OTP、密码登录、JWT 用户查找
  cases/               # 案件创建、列表、详情、方案选择
  evidence/            # 上传校验、文件落盘、证据元数据
  events/              # 案件事件与 SSE 输出
  workflows/           # LangGraph 案件评估与 LLM 可选增强
  api/v1/routes.py     # /api/v1 路由入口
apps/api/tests/        # pytest API 与基础设施测试

apps/web/src/
  routes/              # H5 页面路由：首页、创建、证据、评估、方案、详情、我的
  hooks/               # TanStack Query 封装与案件事件订阅
  lib/                 # API client、类型、格式化、view model
  state/               # Zustand 登录态
  components/          # H5 业务组件

docker/
  Dockerfile                 # API / Web 多阶段镜像
  docker-compose.yml         # API + Web compose
  docker-compose.infra.yml   # PostgreSQL 基础设施 compose
apps/api/.env.example  # 后端本地与 compose 配置样例
apps/web/.env.example  # 前端构建配置样例
package.json           # 根开发、测试、构建脚本
```

## 环境要求

- **Python 3.13+**：后端 `apps/api/pyproject.toml` 要求 `>=3.13`。
- **uv**：用于同步和运行后端依赖。
- **Node.js 20+**：前端可运行；Docker 构建使用 Node 22。
- **pnpm 9.15.4**：仓库 `packageManager` 指定版本。
- **Docker / Docker Compose**：用于容器化启动 API 与 Web。
- **PostgreSQL 可选**：本地可连接已有数据库；服务器从 0 到 1 部署可用 `docker/docker-compose.infra.yml` 启动 PostgreSQL。

---

## 本地开发

> 本地推荐先用 `memory` 跑通主流程，再按需切换到外部 Postgres 做持久化演示。

### 第一步：安装依赖

```bash
# 必须在仓库根目录执行；会安装根脚本依赖与 apps/web workspace 依赖
pnpm install

# 后端 Python 依赖；会使用 apps/api/pyproject.toml，并创建/同步 apps/api/.venv
uv sync --directory apps/api --project .
```

不要在根目录裸跑 `uv sync`。根目录不是 Python 后端项目，后端唯一 Python 项目在 `apps/api`。
也不要在 `apps/web` 单独维护另一套 pnpm workspace；根目录 `pnpm install` 会按
`pnpm-workspace.yaml` 安装 `apps/web` 依赖。如果当前 shell 已经在子目录，先回到根目录，
或显式执行 `pnpm --dir D:\law-app install`。

### 依赖目录边界

| 路径 | 是否保留 | 说明 |
| --- | --- | --- |
| `node_modules` | 是 | 根 `package.json` 的脚本依赖和 pnpm workspace 入口，例如 `concurrently` |
| `apps/web/node_modules` | 是 | pnpm 为前端 package 创建的依赖链接目录 |
| `apps/api/.venv` | 是 | 后端 Python/FastAPI 的真实虚拟环境 |
| `.venv` | 否 | 根目录不是 Python project，不应保留根虚拟环境 |
| `pyproject.toml` / `uv.lock`（根目录） | 否 | 根目录不维护 Python 依赖；后端依赖文件在 `apps/api/` |

### 第二步：准备配置

```bash
cp apps/api/.env.example apps/api/.env

# 可选：需要覆盖前端 API base 时再创建
cp apps/web/.env.example apps/web/.env
```

后端本地命令通过 `uv run --directory apps/api --project . ...` 运行时，工作目录是 `apps/api`，
所以后端实际读取 `apps/api/.env`。Docker Compose 命令也会显式使用
`--env-file apps/api/.env`，与本地后端共用同一份后端配置。
前端本地通常使用 Vite proxy，不需要 `.env`；只有需要覆盖 `VITE_API_BASE_URL` 时才创建
`apps/web/.env`。

最小本地联调用内存模式即可：

```bash
STORAGE_BACKEND=memory
SMS_ENABLED=true
SMS_PROVIDER=mock
MOCK_OTP_CODE=123456
VITE_API_BASE_URL=/api/v1
```

本地 `mock` provider 会在响应中返回测试验证码。联调真实手机短信时改用阿里云 provider；
签名和模板必须先在阿里云短信服务控制台审核通过，AccessKey 必须通过环境变量注入，不能提交到仓库：

```bash
SMS_ENABLED=true
SMS_PROVIDER=aliyun
SMS_CODE_TTL=5m
SMS_CODE_LENGTH=6
SMS_SEND_COOLDOWN=60s
SMS_MAX_ATTEMPTS=5
ALIYUN_SMS_ACCESS_KEY_ID=<RAM AccessKey ID>
ALIYUN_SMS_ACCESS_KEY_SECRET=<RAM AccessKey Secret>
ALIYUN_SMS_REGION_ID=cn-hangzhou
ALIYUN_SMS_ENDPOINT=https://dysmsapi.aliyuncs.com
ALIYUN_SMS_SIGN_NAME=<审核通过的短信签名>
ALIYUN_SMS_TEMPLATE_REGISTER=<注册验证码模板 CODE>
ALIYUN_SMS_TEMPLATE_LOGIN=<登录验证码模板 CODE>
ALIYUN_SMS_TEMPLATE_CODE_PARAM=code
ALIYUN_SMS_REQUEST_TIMEOUT=5s
```

真实短信模式使用阿里云 `SendSms` RPC HTTPS 接口，验证码不会返回给前端；发送失败只记录错误码和 request id，
不会记录 AccessKey Secret 或验证码。

需要持久化演示时切到外部 Postgres：

```bash
STORAGE_BACKEND=postgres
POSTGRES_HOST=192.168.200.131
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PORT=5432
POSTGRES_PASSWORD=change-me
```

LLM 与 Langfuse 都是可选项。未配置 LLM 时，评估会使用内置确定性结果；LLM 请求失败时也会自动回退，
不会阻断案件流程。

```bash
OPENAI_API_BASE=http://10.0.23.119:8180/v1
OPENAI_API_KEY=sk-placeholder
DEFAULT_LLM_MODEL=Qwen3-Coder-Next-REAM-AWQ-4bit

LANGFUSE_PUBLIC_KEY=pk-lf-placeholder
LANGFUSE_SECRET_KEY=sk-lf-placeholder
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 第三步：启动开发服务

一条命令同时启动 API 和 Web：

```bash
pnpm dev
```

默认端口：

- API：`http://localhost:4000`
- Web：`http://localhost:5173`
- 健康检查：`http://localhost:4000/api/v1/health`

也可以分开启动，方便分别看日志。后端主命令直接使用 `uv` + `uvicorn`，明确指向
`apps/api` 这个 Python 项目：

```bash
# 终端 1：Python/FastAPI API
uv run --directory apps/api --project . uvicorn app.main:app --reload --host 0.0.0.0 --port 4000

# 终端 2：前端 Vite
pnpm dev:web
```

`pnpm dev:api` 只是根目录便捷别名，等价于上面的 `uv run ... uvicorn ...` 命令；
它服务于根目录全栈脚本，不是另一套后端。

如果你已经用 IDE、`uvicorn` 或其他方式启动了 Python 后端，并且它正在监听 `4000` 端口，
就不要再运行 `pnpm dev:api`，否则会端口冲突；此时只需要运行 `pnpm dev:web`。

Vite 开发服务器会把 `/api` 代理到 `http://localhost:4000`，浏览器访问 Web 即可走完整 H5 流程。

### 本地验证流程

1. 打开 `http://localhost:5173`。
2. 输入手机号，请求 mock 验证码，或使用注册/入驻时设置的密码登录。
3. 使用 `MOCK_OTP_CODE` 登录时默认验证码是 `123456`。
4. 创建案件。
5. 上传至少一份证据材料。
6. 运行 AI 评估。
7. 选择服务方案。
8. 打开案件详情，确认进度事件和案件状态更新。

---

## Docker Compose 部署

> Docker 文件统一放在 `docker/` 下。`docker/docker-compose.infra.yml` 只负责 PostgreSQL；
> `docker/docker-compose.yml` 只负责 API + Web。两者通过同一个 `law-app-net` 网络通信。

### A. 服务器从 0 到 1 部署

```bash
# 1) 启动 PostgreSQL 基础设施
docker compose --env-file apps/api/.env -f docker/docker-compose.infra.yml up -d

# 2) 构建并启动 API + Web
docker compose --env-file apps/api/.env -f docker/docker-compose.yml up -d --build
```

根脚本：

```bash
pnpm docker:infra:up
pnpm docker:up
```

`pnpm docker:up` 会以前台日志模式启动 app compose；需要后台运行时直接使用上面的
`docker compose --env-file apps/api/.env -f docker/docker-compose.yml up -d --build`。

app compose 默认使用：

```bash
STORAGE_BACKEND=postgres
POSTGRES_HOST=postgres
POSTGRES_DB=law_app
POSTGRES_USER=law_app
POSTGRES_PASSWORD=law_app
```

这里的 `postgres` 是 infra compose 里的服务名，不是宿主机地址。两个 compose 文件都加入
`law-app-net` 网络后，API 容器可以通过这个服务名连接数据库。

如果服务器上已有 `apps/api/.env`，确认里面没有把 `POSTGRES_HOST` 覆盖成外部开发库地址；
从 0 到 1 部署时应保持 `POSTGRES_HOST=postgres`，或直接不设置该项使用 compose 默认值。

默认端口：

- PostgreSQL：`localhost:5432`
- API 容器端口映射：`http://localhost:4000`
- Web 容器端口映射：`http://localhost:8080`
- Web 访问入口：`http://localhost:8080`

Web 容器内的 nginx 会把 `/api/*` 代理到 compose 网络内的 `http://api:4000`。
因此浏览器访问 `http://localhost:8080` 时，不需要额外配置前端 API 地址。

### B. 本地已有外部 PostgreSQL

如果本地已经有 PostgreSQL，不需要启动 infra。直接在 `apps/api/.env` 覆盖数据库地址：

```bash
STORAGE_BACKEND=postgres
POSTGRES_HOST=<your-postgres-host>
POSTGRES_DB=<your-db>
POSTGRES_USER=<your-user>
POSTGRES_PORT=5432
POSTGRES_PASSWORD=<your-password>
```

然后只启动 app compose：

```bash
docker compose --env-file apps/api/.env -f docker/docker-compose.yml up -d --build
```

注意：容器内的 `localhost` 指的是 API 容器自身，不是宿主机。Docker Desktop 场景可考虑
`host.docker.internal`，或使用一台容器可访问的数据库主机 IP。

### 停止服务

```bash
# 停止 API + Web
docker compose --env-file apps/api/.env -f docker/docker-compose.yml down --remove-orphans

# 停止 PostgreSQL，保留数据卷
docker compose --env-file apps/api/.env -f docker/docker-compose.infra.yml down
```

等价根脚本：

```bash
pnpm docker:down
pnpm docker:infra:down
```

### Compose 存储与上传目录

app compose 默认使用 Postgres 持久化。上传文件字节会通过 volume 写入仓库根目录 `uploads/`：

```yaml
volumes:
  - ../uploads:/app/uploads
```

这个 `../uploads` 是相对于 `docker/docker-compose.yml` 文件所在的 `docker/` 目录计算的，
实际落点是 `D:\law-app\uploads`。

### Compose 健康检查

API 服务健康检查使用：

```bash
curl http://localhost:4000/api/v1/health
```

正常会返回类似：

```json
{
  "ok": true,
  "service": "law-app",
  "storage": "postgres",
  "llmConfigured": false,
  "langfuseConfigured": false
}
```

---

## 生产部署骨架

生产部署说明见 `docker/README.md`。当前生产骨架参考 `D:\linkyun-concept\docker\README.md`：

- 构建 VM 执行 Docker build。
- `law-app-web` 使用 nginx 作为生产入口，服务 H5 静态文件并把 `/api/` 反代到 FastAPI。
- `law-app-api` 与 `law-app-web` 通过 `docker save | gzip | ssh docker load` 直传 ECS，不依赖镜像仓库。
- ECS 使用 image-only 的 `docker/docker-compose.prod.yml` 和 `docker/docker-compose.infra.prod.yml`。
- 前后端域名尚未确定，`server_name`、`ALLOWED_ORIGINS` 和 API base 先保留为后续可替换配置。

---

## 配置说明

| 配置项 | 说明 |
| --- | --- |
| `APP_ENV` / `PROJECT_NAME` / `VERSION` | 应用基础信息，health 会返回 service 名称 |
| `API_V1_STR` | API 前缀，默认 `/api/v1` |
| `ALLOWED_ORIGINS` | CORS 来源，开发默认包含 Vite 与 compose Web 端口 |
| `STORAGE_BACKEND` | `memory` 或 `postgres` |
| `UPLOAD_DIR` | 证据文件字节保存目录 |
| `MOCK_OTP_CODE` | 本地 mock 登录验证码 |
| `OTP_EXPIRE_MINUTES` | 验证码有效期 |
| `SMS_ENABLED` / `SMS_PROVIDER` / `SMS_CODE_TTL` / `SMS_CODE_LENGTH` / `SMS_SEND_COOLDOWN` / `SMS_MAX_ATTEMPTS` | 短信开关、provider、验证码有效期/长度、发送冷却和最大校验次数 |
| `ALIYUN_SMS_*` | 阿里云短信 AccessKey、区域、endpoint、签名、登录/注册模板及超时配置 |
| `TOKEN_EXPIRE_DAYS` / `JWT_ACCESS_TOKEN_EXPIRE_DAYS` | 登录 token 有效期，后者设置后会覆盖前者 |
| `JWT_SECRET_KEY` / `JWT_ALGORITHM` | JWT 配置；生产环境必须替换默认 secret |
| `ADMIN_PHONE` / `ADMIN_NAME` / `ADMIN_PASSWORD` | 可选 admin 初始化配置；设置 `ADMIN_PASSWORD` 后 admin 可使用密码登录 |
| `POSTGRES_*` / `DATABASE_URL` | Postgres 连接配置；`DATABASE_URL` 存在时优先使用 |
| `OPENAI_API_BASE` / `OPENAI_API_KEY` / `DEFAULT_LLM_MODEL` | OpenAI-compatible LLM 配置 |
| `DEFAULT_LLM_TEMPERATURE` | LLM 评估温度 |
| `LANGFUSE_*` | Langfuse 可选观测配置 |
| `LOG_LEVEL` / `LOG_FORMAT` | 后端日志配置 |
| `VITE_API_BASE_URL` | 前端构建期 API base，compose 默认 `/api/v1` |

---

## API 与业务流

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/v1/health` | GET | 健康检查，返回存储、LLM、Langfuse 状态 |
| `/api/v1/auth/request-code` | POST | 按 `login` / `register` 用途发送手机验证码 |
| `/api/v1/auth/login` | POST | 使用手机号和验证码登录 |
| `/api/v1/auth/login/password` | POST | 使用手机号和密码登录；密码仅服务端 Argon2id 哈希保存 |
| `/api/v1/me` | GET | 获取当前用户 |
| `/api/v1/cases` | GET | 当前用户案件列表 |
| `/api/v1/cases` | POST | 创建案件 |
| `/api/v1/cases/{case_id}` | GET | 案件详情 |
| `/api/v1/cases/{case_id}/evidence/{category_id}` | POST | 上传证据文件 |
| `/api/v1/cases/{case_id}/evaluate` | POST | 启动 AI 案件评估 |
| `/api/v1/cases/{case_id}/events` | GET | SSE 输出案件事件 |
| `/api/v1/cases/{case_id}/plan` | POST | 选择服务方案 |

业务主流程：

```text
请求验证码或输入密码 → 登录 → 创建案件 → 上传证据 → AI 评估 → 选择服务方案 → 查看案件详情/事件
```

---

## 验证

全量验证：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

后端单独验证：

```bash
pnpm test:api
uv run --directory apps/api --project . pytest
uv run --directory apps/api --project . uvicorn app.main:app --reload --host 0.0.0.0 --port 4000
```

前端单独验证：

```bash
pnpm test:web
pnpm typecheck
pnpm lint
pnpm build
pnpm --dir apps/web preview
```

文档或配置变更后，至少确认：

```bash
git diff --check
```

---

## 排障

| 现象 | 处理 |
| --- | --- |
| `http://localhost:5173` 打不开 | 确认 `pnpm dev:web` 或 `pnpm dev` 正在运行，且 5173 端口未被占用 |
| API health 不通 | 确认 Python/FastAPI API 正在 `4000` 端口运行；推荐直接用 `uv run --directory apps/api --project . uvicorn app.main:app --reload --host 0.0.0.0 --port 4000`，`pnpm dev:api` 只是等价别名 |
| 前端请求 API 失败 | 开发模式检查 Vite `/api` proxy；compose 模式检查 nginx `/api/` 反代和 `api` 服务健康状态 |
| 验证码发送失败 | 本地检查 `SMS_PROVIDER=mock`；阿里云模式检查 `SMS_ENABLED`、RAM AccessKey、已审核签名和对应登录/注册模板 CODE |
| compose 下 API 连不上数据库 | 服务器从 0 到 1 部署先确认 `docker compose --env-file apps/api/.env -f docker/docker-compose.infra.yml up -d` 已启动；再确认 app 与 infra 都在 `law-app-net` 网络 |
| 本地外部 Postgres 连接失败 | 不要使用 `POSTGRES_HOST=postgres`；在 `apps/api/.env` 把 `POSTGRES_HOST` 改成 API 容器可访问的外部数据库地址 |
| 上传失败或文件找不到 | 检查 `UPLOAD_DIR` 是否可写；compose 下检查根目录 `uploads/` volume |
| LLM 没有生效 | health 的 `llmConfigured` 应为 `true`；确认 `OPENAI_API_BASE`、`OPENAI_API_KEY`、`DEFAULT_LLM_MODEL` 都已设置 |
| LLM 调用失败但评估仍完成 | 这是预期行为；系统会回退到确定性评估，避免阻断演示流程 |
| Docker Web 页面能开但 API 502 | 检查 `api` 服务健康状态和 nginx `/api/` 反代配置 |

---

## 状态

- 已具备：H5 验证码/密码登录、案件创建、案件列表/详情、证据上传、AI 评估、方案选择、案件事件流。
- 已具备：`memory` 快速联调模式与 `postgres` 持久化模式。
- 已具备：上传文件落盘，数据库只存元数据和路径。
- 已具备：OpenAI-compatible LLM 可选增强与失败回退。
- 已具备：Docker Compose 启动 PostgreSQL infra，以及 API + Web。
- 未包含：独立 worker、Redis、MinIO、Temporal/Celery 编排、支付、正式短信、律师后台、生产级权限体系。
- 生产前必须处理：替换 `JWT_SECRET_KEY`、配置 HTTPS 和真实域名、接入正式验证码/认证或登录限流、启用持久化数据库、补齐备份与日志策略。
