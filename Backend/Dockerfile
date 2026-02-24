
FROM node:20-alpine AS deps
WORKDIR /app
# Install dumb-init here to copy it later
RUN apk add --no-cache dumb-init

COPY package.json yarn.lock* package-lock.json* ./

RUN if [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile --production --ignore-scripts; \
    else \
      npm ci --only=production --ignore-scripts; \
    fi

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

COPY --from=deps /usr/bin/dumb-init /usr/bin/dumb-init

COPY --chown=nodeuser:nodejs . .

COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules

USER nodeuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# 5. Start command
CMD ["yarn", "start"]
