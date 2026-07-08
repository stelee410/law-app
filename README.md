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
