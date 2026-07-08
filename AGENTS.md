# Repository Guidelines

## Project Structure & Module Organization
This repository is a full-stack mobile H5 legal case workflow scaffold. The root `package.json` coordinates shared pnpm and uv scripts.

- `apps/api/app`: Python FastAPI backend. Domain boundaries are split into `auth`, `cases`, `evidence`, `events`, `workflows`, `core`, and `api/v1`.
- `apps/api/tests`: pytest API and workflow integration tests.
- `apps/web/src`: Vite React H5 app with `routes`, `hooks`, `lib`, `state`, and global styles.
- `docker/Dockerfile` and `docker/docker-compose.yml`: API and web container builds.
- `docker/docker-compose.infra.yml`: PostgreSQL infrastructure for zero-to-one server deployment.

## Build, Test, and Development Commands
Install dependencies before local work:

- `uv sync --directory apps/api --project .`: sync backend dependencies.
- `pnpm install`: run from the repository root to install root and web workspace dependencies; do not keep a nested `apps/web/pnpm-workspace.yaml`.
- `pnpm dev`: run FastAPI on `:4000` and Vite on `:5173`.
- `pnpm test`: run backend pytest, then web Vitest.
- `pnpm typecheck`: run web TypeScript checks.
- `pnpm build`: build the H5 frontend.
- `pnpm lint`: run web ESLint.
- `docker compose --env-file apps/api/.env -f docker/docker-compose.infra.yml up -d`: start PostgreSQL infrastructure.
- `docker compose --env-file apps/api/.env -f docker/docker-compose.yml up --build`: build and run API plus web containers.

## Coding Style & Naming Conventions
Use Python for the backend and TypeScript for the frontend. Match the existing 2-space indentation style. Backend modules expose small service functions and keep API routing thin. Frontend components use PascalCase, hooks use `use*`, shared client code lives in `apps/web/src/lib`, and route screens live in `apps/web/src/routes`.

## Testing Guidelines
Backend tests use pytest with `fastapi.testclient.TestClient`; add tests under `apps/api/tests` for API contract or workflow behavior changes. Frontend tests use Vitest and React Testing Library; colocate UI tests as `*.test.tsx`. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before handing off.

## Commit & Pull Request Guidelines
The history starts with `Initial law AI app`; keep new commit messages short, imperative, and scoped, such as `Add assessment failure event`. PRs should include a concise summary, verification commands, linked issue or task context, and screenshots for visible H5 UI changes.

## Security & Configuration Tips
Do not commit `.env`, `.env.local`, `uploads`, `coverage`, `dist`, `.venv`, or `node_modules`. Authentication uses mock OTP locally. LangGraph is limited to assessment workflows; login, CRUD, uploads, and plan selection should remain ordinary service code.
