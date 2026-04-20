FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 signup && adduser --system --uid 1001 signup

COPY --from=builder /app/public ./public
COPY --from=builder --chown=signup:signup /app/.next/standalone ./
COPY --from=builder --chown=signup:signup /app/.next/static ./.next/static
COPY --from=builder --chown=signup:signup /app/src ./src
COPY --from=builder --chown=signup:signup /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=signup:signup /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=signup:signup /app/node_modules ./node_modules
COPY --from=builder --chown=signup:signup /app/package.json ./package.json

USER signup
EXPOSE 3000
CMD ["node", "server.js"]
