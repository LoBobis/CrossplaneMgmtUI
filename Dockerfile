# --- Stage 1: Build ---
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY public/ ./public/
COPY src/ ./src/

RUN npm run build

# --- Stage 2: Serve ---
FROM nginx:1.25-alpine

# Copy built assets
COPY --from=builder /app/build /usr/share/nginx/html

# Copy both nginx configs — entrypoint picks the right one
COPY nginx.conf /etc/nginx/conf.d/default.conf.local
COPY nginx-incluster.conf /etc/nginx/conf.d/default.conf.incluster

# Entrypoint: injects SA token for in-cluster, or uses local config
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
