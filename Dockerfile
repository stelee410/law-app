FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM deps AS build
COPY . .
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --omit=dev -w apps/api
COPY --from=build /app/apps/api/dist apps/api/dist
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "apps/api"]

FROM base AS web
ENV NODE_ENV=production
COPY apps/web/server.mjs apps/web/server.mjs
COPY --from=build /app/apps/web/dist apps/web/dist
EXPOSE 8080
CMD ["node", "apps/web/server.mjs"]
