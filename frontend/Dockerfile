FROM node:20-alpine AS deps
WORKDIR /app

# Apply security updates
RUN apk upgrade --no-cache

# Copy package files
COPY package*.json ./

# Use npm ci for reproducible builds (more secure than npm install)
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# ---------------------------------------------------
# Stage 2: Build
# ---------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Apply security updates
RUN apk upgrade --no-cache

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for build
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build arguments
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=${NEXT_PUBLIC_PADDLE_CLIENT_TOKEN}
ENV NODE_ENV=production

# Build the app
RUN npm run build

# ---------------------------------------------------
# Stage 3: Production Runner (Secure)
# ---------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Install security updates and dumb-init
RUN apk upgrade --no-cache && \
    apk add --no-cache dumb-init

# Set production environment
ENV NODE_ENV=production

# Create a dedicated user (more secure than default 'node' user)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only production node_modules from deps stage
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy package.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Copy built application (NOT source code)
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Use dumb-init for proper signal handling
CMD ["dumb-init", "npm", "start"]