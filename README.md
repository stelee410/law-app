# law-app

Mobile H5 legal case workflow scaffold.

The app is split into:

- `apps/api`: Python FastAPI backend with a minimal case workflow API and LangGraph assessment boundary.
- `apps/web`: React H5 frontend using the media-sense style stack: Vite, TanStack Router/Query, ky, Zustand, i18n, Tailwind, PWA, Vitest.

Backend code is split by boundary:

- `app/auth`: mock OTP login and bearer-token user lookup.
- `app/cases`: case list/detail/create and service-plan selection.
- `app/evidence`: upload handling.
- `app/events`: SSE case event streaming.
- `app/workflows`: LangGraph case assessment flow with deterministic fallback.

## MVP Infrastructure

The demo MVP supports two backend storage modes:

- `STORAGE_BACKEND=memory`: fastest local mode; data is lost after restart.
- `STORAGE_BACKEND=postgres`: demo mode; users, sessions, cases, evidence metadata, assessments, plans, and events are persisted in Postgres.

Evidence file bytes are stored under `UPLOAD_DIR` and only metadata is stored in Postgres. LLM assessment is optional: when `OPENAI_API_BASE`, `OPENAI_API_KEY`, and `DEFAULT_LLM_MODEL` are configured, the workflow tries the OpenAI-compatible `/chat/completions` endpoint. If the call fails, the deterministic assessment is used so the case flow still completes.

Copy the example env and fill secrets locally:

```bash
cp .env.example .env
```

Do not commit `.env` or real keys.

## Local Development

Install frontend dependencies:

```bash
pnpm --dir apps/web install
```

Install backend dependencies:

```bash
uv sync --directory apps/api --project .
```

Run both apps:

```bash
pnpm dev
```

API defaults to `http://localhost:4000`; web defaults to `http://localhost:5173`.

For VM-backed demo mode, set at least:

```bash
STORAGE_BACKEND=postgres
POSTGRES_HOST=192.168.200.131
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PORT=5432
POSTGRES_PASSWORD=change-me
OPENAI_API_BASE=http://10.0.23.119:8180/v1
OPENAI_API_KEY=sk-placeholder
DEFAULT_LLM_MODEL=Qwen3-Coder-Next-REAM-AWQ-4bit
```

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

Backend-only:

```bash
uv run --directory apps/api --project . pytest
uv run --directory apps/api --project . uvicorn app.main:app --reload --host 0.0.0.0 --port 4000
```

## Docker

```bash
docker compose up --build
```

Open `http://localhost:8080`.

The containerized web server proxies `/api/*` to the API service. Set `STORAGE_BACKEND=postgres` in `.env` when you want the compose stack to use the VM Postgres instead of memory mode.

## Demo Flow

Use the H5 app to verify the MVP:

1. Request the mock OTP and log in.
2. Create a debt recovery case.
3. Upload at least one evidence file.
4. Run AI assessment.
5. Select a service plan.
6. Open case detail or messages to confirm progress events.
