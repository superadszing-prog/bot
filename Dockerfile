# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app

# Install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# App source
COPY src ./src

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/uploads && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/index.js"]
