# Crossplane XR Manager

A lightweight management UI for [Crossplane](https://crossplane.io/) Composite Resources (XRs) and Claims. Search, inspect, pause, and resume your Crossplane resources without touching `kubectl`.

![UI Preview](https://img.shields.io/badge/status-beta-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **Auto-discovers all XRDs** — no configuration needed, works with any Crossplane setup
- **Claims + standalone XRs** — supports both claim-based and composite-only XRDs
- **Search & filter** by name, namespace, kind, and status
- **Status overview** — live ready/paused/error indicators
- **XR resource tree** — managed resources grouped by provider (AWS, Azure, GCP, Kubernetes...)
- **Pause / Resume** claims, XRs, and individual managed resources with confirmation modals
- **Conditions, Labels & Annotations** tabs per resource
- **YAML view** with syntax highlighting + JSON editor for merge-patch edits
- **Activity logs** — structured API call logging with level/category filters
- **Smart auto-refresh** — merge-based updates avoid UI flicker (claims every 15s, tree every 10s)
- **Keyboard shortcut** — press `Esc` to close the detail panel, click logo to go home
- **Production-ready** — in-cluster deployment with ServiceAccount + RBAC

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

### Option 2 — Local Dev (Node.js)

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

### Option 3 — Production (In-Cluster)

```bash
# Build & push the image
docker build -t your-registry/xr-manager:latest .
docker push your-registry/xr-manager:latest

# Update the image in deploy/all-in-one.yaml, then apply
kubectl apply -f deploy/all-in-one.yaml

# Access via port-forward, ingress, or LB
kubectl port-forward -n crossplane-xr-manager svc/xr-manager 8080:80
```

The Docker image auto-detects the environment:
- **In-cluster** (SA token at `/var/run/secrets/...`): nginx proxies to `https://kubernetes.default.svc` with Bearer token
- **Local dev** (no SA token): falls back to proxying to `kubectl proxy` on `host.docker.internal:8001`

---

## How It Works

1. **Discovery** — Queries the K8s API for all `CompositeResourceDefinitions` (XRDs).

2. **Listing** — For XRDs with `spec.claimNames`, fetches all claims across namespaces + their XRs. For XRDs without claims (composite-only), fetches the standalone XR instances directly.

3. **Resource tree** — When you select a resource, fetches the XR's `spec.resourceRefs` and resolves each managed resource via K8s API discovery. Resources are grouped by provider.

4. **Pause/Resume** — Uses `PATCH` with `application/merge-patch+json` to set/remove the `crossplane.io/paused` annotation.

### Architecture

```
Browser  -->  nginx (:8080)  --/api/-->  K8s API Server
              serves React app            (kubectl proxy or in-cluster SA)
```

---

## Project Structure

```
src/
  config.js                 # All constants, intervals, annotation keys
  theme.js                  # Rocky theme colors, provider colors, kind icons
  logger.js                 # Structured logging with React hook
  App.jsx                   # Main orchestrator (~250 lines)
  api/
    client.js               # k8s() fetch wrapper, API discovery cache
    resources.js            # XRD discovery, claim/XR loading, pause/apply
  utils/
    conditions.js           # getCond, isReady, isSynced, isPaused
    formatting.js           # computeAge, inferProvider
    yaml.js                 # toYaml serializer, syntax highlighting
  hooks/
    useResourceData.js      # Auto-refreshing resource list with smart merge
    useXRTree.js            # Auto-refreshing resource tree for selected entry
    useKeyboardShortcuts.js # ESC handler
  components/
    Primitives.jsx          # StatusDot, Badge, Tag, Spinner, Modal, etc.
    ResourceRow.jsx         # List row for claims and standalone XRs
    DetailPanel.jsx         # Right panel with tabs
    ResourceTree.jsx        # XR tree with provider groups
    ManagedResourceCard.jsx # Expandable managed resource card
    ConditionsTab.jsx       # Conditions display
    LabelsTab.jsx           # Labels + annotations display
    YAMLEditor.jsx          # YAML view + JSON editor
    LogsPanel.jsx           # Activity log panel with filters
deploy/
  all-in-one.yaml           # Namespace, ServiceAccount, RBAC, Deployment, Service
```

---

## Configuration

All tunable values are in `src/config.js`:

| Constant | Default | Purpose |
|---|---|---|
| `CLAIMS_REFRESH_INTERVAL_MS` | `15000` | How often the resource list refreshes |
| `TREE_REFRESH_INTERVAL_MS` | `10000` | How often the selected resource tree refreshes |
| `TOAST_DURATION_MS` | `3200` | How long toast notifications stay visible |
| `LOG_MAX_ENTRIES` | `500` | Maximum log entries kept in memory |
| `FIELD_MANAGER` | `crossplane-xr-manager` | Field manager name for K8s patches |

### RBAC (for in-cluster deployment)

See `deploy/all-in-one.yaml` for the full manifests. The ClusterRole needs:
- `get`, `list` on `compositeresourcedefinitions`
- `get`, `list`, `patch` on all claim/XR/MR resource types
- `get` on non-resource URLs (`/api/*`, `/apis/*`) for API discovery

---

## Kubernetes API Endpoints Used

| Purpose | API Path |
|---|---|
| Discover XRDs | `GET /apis/apiextensions.crossplane.io/v1/compositeresourcedefinitions` |
| API resource discovery | `GET /apis/{group}/{version}` |
| List claims | `GET /apis/{group}/{version}/{claimPlural}` |
| List XRs | `GET /apis/{group}/{version}/{xrPlural}` |
| Get managed resource | `GET /apis/{group}/{version}/{mrPlural}/{name}` |
| Pause/Resume/Apply | `PATCH .../{name}?fieldManager=crossplane-xr-manager` |

---

## Tech Stack

- **React 18** — UI framework
- **No external UI library** — fully custom components, zero dependencies beyond React
- **nginx** — serves the built app and proxies `/api` to K8s API
- **Docker multi-stage build** — small final image (~25MB)

---

## Contributing

PRs welcome! Some ideas:

- [ ] Real-time watch (`?watch=true`) for live updates
- [ ] Multi-cluster support
- [ ] Composition / XRD browser
- [ ] Dark/light theme toggle
- [ ] Events tab per resource

---

## License

MIT
