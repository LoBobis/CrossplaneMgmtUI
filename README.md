# Crossplane XR Manager

A lightweight, open-source management UI for [Crossplane](https://crossplane.io/) Composite Resources (XRs). Search, inspect, pause, and resume claims and their managed resources without touching `kubectl`.

![UI Preview](https://img.shields.io/badge/status-beta-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **Auto-discovers all XRDs** — no configuration needed, works with any Crossplane setup
- **Search & filter** claims by name, namespace, kind, and status
- **Status overview** — live ready/paused/error indicators per claim
- **XR resource tree** — see all managed resources grouped by provider (AWS, Azure, GCP, Kubernetes...)
- **Pause / Resume claims** — with confirmation modal before applying
- **Pause / Resume individual managed resources** — granular control with safety confirmation
- **Conditions tab** — full Kubernetes condition details per claim
- **Labels & Annotations** — inspect metadata at a glance
- **YAML view** — actual Kubernetes object manifest
- **Auto-refresh** — claims list refreshes every 30 seconds
- **Keyboard shortcut** — press `Esc` to close the detail panel

---

## Quick Start

### Prerequisites

- A Kubernetes cluster with Crossplane installed
- `kubectl` configured to access your cluster

### Option 1 — Docker (recommended)

```bash
# 1. Start kubectl proxy so the UI can talk to your cluster
kubectl proxy --port=8001 &

# 2. Run the container
docker run -d \
  --name crossplane-xr-manager \
  -p 8080:8080 \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/Lobobis/crossplane-xr-manager:latest

# 3. Open in browser
open http://localhost:8080
```

### Option 2 — Docker Compose

```bash
git clone https://github.com/Lobobis/crossplane-xr-manager.git
cd crossplane-xr-manager

# Start kubectl proxy in background
kubectl proxy --port=8001 &

# Build and run
docker compose up -d --build

# Open in browser
open http://localhost:8080
```

### Option 3 — Local Dev (Node.js)

```bash
git clone https://github.com/Lobobis/crossplane-xr-manager.git
cd crossplane-xr-manager

npm install

# Start kubectl proxy
kubectl proxy --port=8001 &

# Run the dev server (auto-proxies /api to kubectl proxy via setupProxy.js)
npm start
# Opens http://localhost:3000
```

---

## How It Works

1. **Discovery** — On load, the UI queries the Kubernetes API for all `CompositeResourceDefinitions` (XRDs). This tells it what claim types exist on your cluster.

2. **Listing claims** — For each XRD that defines a claim, it fetches all claim instances across all namespaces. It also fetches the corresponding composite resources (XRs) to get resource counts.

3. **Resource tree** — When you select a claim, it fetches the XR's `spec.resourceRefs` and resolves each managed resource via the Kubernetes API discovery mechanism. Resources are grouped by provider.

4. **Pause/Resume** — Uses `PATCH` with `application/merge-patch+json` to set or remove the `crossplane.io/paused` annotation. This is the standard Crossplane mechanism for pausing reconciliation.

### Architecture

```
Browser  -->  nginx (:8080)  --/api/-->  kubectl proxy (:8001)  -->  K8s API
              serves React app            strips /api prefix
```

In dev mode (`npm start`), Create React App's dev server proxies `/api/*` to `kubectl proxy` via `src/setupProxy.js`.

---

## Configuration

### RBAC (for in-cluster deployment)

The UI needs read access to XRDs and all claim/XR/MR types, plus patch access for pause/resume:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: crossplane-xr-manager-ui
rules:
  - apiGroups: ["apiextensions.crossplane.io"]
    resources: ["compositeresourcedefinitions"]
    verbs: ["get", "list"]
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["get", "list", "patch"]
```

> **Security note:** `kubectl proxy` has no authentication. For production, deploy inside the cluster with a `ServiceAccount` + RBAC, or use an API gateway with auth.

---

## Kubernetes API Endpoints Used

| Purpose | API Path |
|---|---|
| Discover XRDs | `GET /apis/apiextensions.crossplane.io/v1/compositeresourcedefinitions` |
| API resource discovery | `GET /apis/{group}/{version}` |
| List claims | `GET /apis/{group}/{version}/{claimPlural}` |
| List XRs | `GET /apis/{group}/{version}/{xrPlural}` |
| Get managed resource | `GET /apis/{group}/{version}/{mrPlural}/{name}` |
| Pause/Resume (PATCH) | `PATCH .../{name}?fieldManager=crossplane-xr-manager` |

---

## Tech Stack

- **React 18** — UI framework
- **No external UI library** — fully custom components, zero dependencies beyond React
- **nginx** — serves the built app and proxies `/api` to kubectl proxy
- **Docker multi-stage build** — small final image (~25MB)

---

## Contributing

PRs welcome! Some ideas for next steps:

- [ ] Real-time watch (`?watch=true`) for live updates
- [ ] Multi-cluster support
- [ ] Composition / XRD browser
- [ ] Dark/light theme toggle
- [ ] Events tab per resource

---

## License

MIT
