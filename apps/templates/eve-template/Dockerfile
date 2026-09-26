FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /app

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ pkg-config liblzma-dev \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
# pnpm applies the dependency patches listed in pnpm-workspace.yaml during install.
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
# Canonical origin for link previews (metadataBase in app/layout.tsx). Next.js
# inlines NEXT_PUBLIC_* at build time, so it is a build argument, not runtime env.
ARG NEXT_PUBLIC_SITE_URL=https://aegentica.se
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The runner copies /app whole, so drop the build cache and dev dependencies here
# (dev packages that production packages name as optional peers, such as
# drizzle-kit for better-auth, stay).
RUN pnpm build:eve && pnpm build && rm -rf .next/cache && CI=true pnpm prune --prod

# liblzma5, which node-liblzma links against at runtime, is part of Debian's base
# system (dpkg depends on it), so the runner needs no extra packages.
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
# The code stays root-owned and read-only. What the servers write (the volume
# at .eve/.workflow-data, eve's sandbox cache, Next.js's cache) belongs to the
# image's unprivileged node user (uid 1000), which scripts/start-self-hosted.mjs
# switches to after re-owning an existing volume. The agent's sandbox sessions
# live on the volume, so their files survive a new container.
RUN mkdir -p .eve/.workflow-data/sandbox-sessions .eve/sandbox-cache/just-bash .next/cache \
  && rm -rf .eve/sandbox-cache/just-bash/sessions \
  && ln -s /app/.eve/.workflow-data/sandbox-sessions .eve/sandbox-cache/just-bash/sessions \
  && chown -R node:node .eve .next/cache \
  && chmod -R go-rwx .eve .next/cache
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+((process.env.PORT||'').trim()||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-self-hosted.mjs"]
