# law-app

移动端 H5 法律案件闭环工作台：**验证码登录** → **创建案件** → **上传证据材料** →
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
- **容器**：根 `Dockerfile` 多阶段构建 API 与 Web；`docker-compose.yml` 启动 API + 静态 Web 服务。

## 目录结构

```
apps/api/app/
  main.py              # FastAPI 应用装配、CORS、store 初始化
  core/
    config.py          # pydantic-settings: env、Postgres、LLM、Langfuse
    database.py        # psycopg 连接池
    schema.py          # MVP Postgres schema 初始化
  auth/                # mock OTP 登录、token 用户查找
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

Dockerfile             # API / Web 多阶段镜像
docker-compose.yml     # API + Web compose
.env.example           # 本地与 compose 配置样例
package.json           # 根开发、测试、构建脚本
```

## 环境要求

- **Python 3.13+**：后端 `apps/api/pyproject.toml` 要求 `>=3.13`。
- **uv**：用于同步和运行后端依赖。
- **Node.js 20+**：前端可运行；Docker 构建使用 Node 22。
- **pnpm 9.15.4**：仓库 `packageManager` 指定版本。
- **Docker / Docker Compose**：用于容器化启动 API 与 Web。
- **PostgreSQL 可选**：只有 `STORAGE_BACKEND=postgres` 时需要；compose 当前不内置 Postgres 服务。

---

## 本地开发

> 本地推荐先用 `memory` 跑通主流程，再按需切换到外部 Postgres 做持久化演示。

### 第一步：安装依赖

```bash
# 前端 workspace 与根脚本依赖
pnpm install

# 后端 Python 依赖；会使用 apps/api/pyproject.toml，并创建/同步 apps/api/.venv
uv sync --directory apps/api --project .
```

不要在根目录裸跑 `uv sync`。根目录不是 Python 后端项目，后端唯一 Python 项目在 `apps/api`。
也不需要在 `apps/web` 单独维护另一套 pnpm 安装入口；根目录 `pnpm install` 会按
`pnpm-workspace.yaml` 安装 `apps/web` 依赖。

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
cp .env.example .env
```

根目录 `.env` 会被 Docker Compose 自动读取。后端本地命令通过 `uv --directory apps/api` 运行时，
也可以把同一份配置放到 `apps/api/.env`，或在当前 shell 中导出对应环境变量。

最小本地联调用内存模式即可：

```bash
STORAGE_BACKEND=memory
MOCK_OTP_CODE=123456
VITE_API_BASE_URL=/api/v1
```

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
2. 输入手机号，请求 mock 验证码。
3. 使用 `MOCK_OTP_CODE` 登录，默认是 `123456`。
4. 创建案件。
5. 上传至少一份证据材料。
6. 运行 AI 评估。
7. 选择服务方案。
8. 打开案件详情，确认进度事件和案件状态更新。

---

## Docker Compose 部署

> 当前 compose 只包含 `api` 和 `web` 两个服务。Postgres 若启用，需要使用外部数据库，
> 或自行扩展 compose 文件增加数据库服务。

### 一键构建并启动

```bash
docker compose up --build
```

等价根脚本：

```bash
pnpm docker:up
```

默认端口：

- API 容器端口映射：`http://localhost:4000`
- Web 容器端口映射：`http://localhost:8080`
- Web 访问入口：`http://localhost:8080`

Web 容器内的 Node 静态服务器会把 `/api/*` 代理到 compose 网络内的 `http://api:4000`。
因此浏览器访问 `http://localhost:8080` 时，不需要额外配置前端 API 地址。

### 停止服务

```bash
docker compose down --remove-orphans
```

等价根脚本：

```bash
pnpm docker:down
```

### Compose 存储模式

默认 compose 环境变量为：

```bash
STORAGE_BACKEND=memory
UPLOAD_DIR=/app/uploads
```

这适合快速演示，但 API 容器重启后内存数据会丢失。上传文件字节会通过 volume 写入根目录 `uploads/`：

```yaml
volumes:
  - ./uploads:/app/uploads
```

若要使用外部 Postgres，在根目录 `.env` 中设置：

```bash
STORAGE_BACKEND=postgres
POSTGRES_HOST=<host reachable from api container>
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PORT=5432
POSTGRES_PASSWORD=change-me
```

注意：容器内的 `localhost` 指的是 API 容器自身，不是宿主机。Docker Desktop 场景可考虑
`host.docker.internal`，或使用一台容器可访问的数据库主机 IP。

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
  "storage": "memory",
  "llmConfigured": false,
  "langfuseConfigured": false
}
```

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
| `TOKEN_EXPIRE_DAYS` / `JWT_ACCESS_TOKEN_EXPIRE_DAYS` | 登录 token 有效期，后者设置后会覆盖前者 |
| `JWT_SECRET_KEY` / `JWT_ALGORITHM` | JWT 配置；生产环境必须替换默认 secret |
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
| `/api/v1/auth/request-code` | POST | 请求 mock OTP 验证码 |
| `/api/v1/auth/login` | POST | 使用手机号和验证码登录 |
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
请求验证码 → 登录 → 创建案件 → 上传证据 → AI 评估 → 选择服务方案 → 查看案件详情/事件
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
| 前端请求 API 失败 | 开发模式检查 Vite `/api` proxy；compose 模式检查 Web 容器 `API_TARGET=http://api:4000` |
| 登录失败 | 检查 `MOCK_OTP_CODE`，默认验证码是 `123456`，验证码也会在请求返回中给出 |
| compose 下数据重启丢失 | 当前为 `STORAGE_BACKEND=memory`，切换到 `postgres` 并配置外部 Postgres |
| Postgres 连接失败 | 确认 `POSTGRES_HOST` 是 API 进程可访问地址；容器里不要把宿主机误写成 `localhost` |
| 上传失败或文件找不到 | 检查 `UPLOAD_DIR` 是否可写；compose 下检查根目录 `uploads/` volume |
| LLM 没有生效 | health 的 `llmConfigured` 应为 `true`；确认 `OPENAI_API_BASE`、`OPENAI_API_KEY`、`DEFAULT_LLM_MODEL` 都已设置 |
| LLM 调用失败但评估仍完成 | 这是预期行为；系统会回退到确定性评估，避免阻断演示流程 |
| Docker Web 页面能开但 API 502 | 检查 `api` 服务健康状态和 `web` 服务内的 `API_TARGET` |

---

## 状态

- 已具备：H5 登录、案件创建、案件列表/详情、证据上传、AI 评估、方案选择、案件事件流。
- 已具备：`memory` 快速联调模式与 `postgres` 持久化模式。
- 已具备：上传文件落盘，数据库只存元数据和路径。
- 已具备：OpenAI-compatible LLM 可选增强与失败回退。
- 已具备：Docker Compose 启动 API + Web。
- 未包含：独立 worker、Redis、MinIO、Temporal/Celery 编排、支付、正式短信、律师后台、生产级权限体系。
- 生产前必须处理：替换 `JWT_SECRET_KEY`、接入正式验证码/认证、启用持久化数据库、配置 HTTPS 和真实域名、补齐备份与日志策略。
