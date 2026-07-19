ARG NODE_BASE_IMAGE=node:22-slim

FROM ${NODE_BASE_IMAGE} AS builder

ARG NPM_REGISTRY=https://registry.npmjs.org

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack enable \
    && corepack prepare pnpm@9.0.0 --activate \
    && pnpm install --frozen-lockfile --registry="${NPM_REGISTRY}"

COPY . .
RUN pnpm build

FROM ${NODE_BASE_IMAGE} AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5000
ENV HOST=0.0.0.0
ENV WORLD_HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/research ./research
COPY --from=builder /app/.cache/asean-training ./.seed-cache/asean-training
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p .cache

EXPOSE 5000

CMD ["sh", "-lc", "if [ -d /app/.seed-cache ]; then mkdir -p /app/.cache && cp -an /app/.seed-cache/. /app/.cache/; fi; exec node scripts/world-start.mjs"]
