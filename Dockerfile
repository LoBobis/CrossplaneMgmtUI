# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY public/ ./public/
COPY src/ ./src/

# Optional: set the API base URL at build time
# e.g. docker build --build-arg REACT_APP_K8S_API=http://localhost:8001
ARG REACT_APP_K8S_API=http://localhost:8001
ENV REACT_APP_K8S_API=$REACT_APP_K8S_API

RUN npm run build

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Copy built assets
COPY --from=builder /app/build /usr/share/nginx/html

# Custom nginx config - handles React Router & proxies /api to kubectl proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
