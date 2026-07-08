FROM python:3.13-slim AS api
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv
COPY apps/api/pyproject.toml apps/api/uv.lock* ./
RUN uv sync --frozen --no-dev || uv sync --no-dev
COPY apps/api/app app
EXPOSE 4000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000"]

FROM node:22-alpine AS web-build
WORKDIR /app
RUN corepack enable
COPY apps/web/package.json apps/web/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY apps/web ./
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
COPY apps/web/server.mjs ./server.mjs
COPY --from=web-build /app/dist ./dist
EXPOSE 8080
CMD ["node", "server.mjs"]
