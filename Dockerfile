FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Modern Docker CLI for `docker ps` via mounted socket (bookworm docker.io is API 1.41; daemon needs ≥1.44)
ARG DOCKER_CLI_VERSION=27.5.1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && ARCH="$(dpkg --print-architecture)" \
  && case "$ARCH" in \
       amd64) DOCKER_ARCH=x86_64 ;; \
       arm64) DOCKER_ARCH=aarch64 ;; \
       *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_CLI_VERSION}.tgz" \
     | tar xzv --strip-components=1 -C /usr/local/bin docker/docker \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
