# Single-service image: builds shared + web + api, the api serves the web SPA
# (same-origin) and the socket, and runs migrations before starting.
FROM node:22-slim

# git is pulled in by some postinstall steps; ca-certs for TLS to Postgres
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY . .

# Build order matters: shared (dist) → web (consumes shared, same-origin API) → api
RUN pnpm install --frozen-lockfile \
  && pnpm --filter shared build \
  && VITE_API_URL="" pnpm --filter web build \
  && pnpm --filter api build

ENV NODE_ENV=production
# Railway provides PORT; the api reads process.env.PORT. Migrate then start.
CMD ["sh", "-c", "pnpm --filter api db:migrate && node apps/api/dist/main.js"]
