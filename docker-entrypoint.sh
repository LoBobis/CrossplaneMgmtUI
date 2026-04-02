#!/bin/sh
set -e

TOKEN_FILE="/var/run/secrets/kubernetes.io/serviceaccount/token"

if [ -f "$TOKEN_FILE" ]; then
  echo "[xr-manager] Running in-cluster: injecting ServiceAccount token"
  cp /etc/nginx/conf.d/default.conf.incluster /etc/nginx/conf.d/default.conf
  SA_TOKEN=$(cat "$TOKEN_FILE")
  sed -i "s|__SA_TOKEN__|${SA_TOKEN}|g" /etc/nginx/conf.d/default.conf
else
  echo "[xr-manager] No SA token found - using local dev config (kubectl proxy on host:8001)"
  cp /etc/nginx/conf.d/default.conf.local /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
