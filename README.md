# Crossplane XR Manager

A lightweight, open-source management UI for [Crossplane](https://crossplane.io/) Composite Resources (XRs). Built to fill the gap left by read-only dashboards — this UI lets your team **search, inspect, pause, and resume** claims and their managed resources without touching `kubectl`.

![UI Preview](https://img.shields.io/badge/status-beta-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

- **Search & filter** claims by name, namespace, kind, and status
- **Status overview** — live ready/paused/error indicators per claim
- **XR resource tree** — see all managed resources grouped by provider (AWS, Azure, GCP, Kubernetes…)
- **Pause / Resume claims** — with confirmation modal before applying
- **Pause / Resume individual managed resources** — granular control with safety confirmation
- **Conditions tab** — full Kubernetes condition details per claim
- **Labels & Annotations** — inspect metadata at a glance
- **YAML view** — generated manifest per claim
- **Keyboard shortcut** — press `Esc` to close the detail panel

---

## 🚀 Quick Start

### Option 1 — Docker (recommended)

**Prerequisites:** Docker, and access to your cluster via `kubectl`.

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
# Clone the repo
git clone https://github.com/Lobobis/crossplane-xr-manager.git
cd crossplane-xr-manager

# Start kubectl proxy in background
kubectl proxy --port=8001 &

# Build and run
docker compose up -d

# Open in browser
open http://localhost:8080
```

### Option 3 — Local Dev (Node.js)

```bash
# Clone the repo
git clone https://github.com/Lobobis/crossplane-xr-manager.git
cd crossplane-xr-manager

# Install dependencies
npm install

# Start kubectl proxy
kubectl proxy --port=8001 &

# Run the dev server
npm start
# → Opens http://localhost:3000
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REACT_APP_K8S_API` | `http://localhost:8001` | Base URL of your kubectl proxy or API gateway |

Set at **build time**:

```bash
docker build \
  --build-arg REACT_APP_K8S_API=https://my-k8s-proxy.internal \
  -t crossplane-xr-manager .
```

### Connecting to a Real Cluster

The UI is pre-wired with **mock data** so you can explore it immediately. To connect to your actual Crossplane cluster:

1. **Start `kubectl proxy`** (simplest, for local use):
   ```bash
   kubectl proxy --port=8001
   ```

2. **Replace the mock fetch calls** in `src/App.jsx`:

   Find the `MOCK_CLAIMS` and `MOCK_XR_TREE` constants at the top of `App.jsx` and replace them with real API calls. Example:

   ```js
   // Fetch all claims across namespaces
   const res = await fetch(`${process.env.REACT_APP_K8S_API}/apis/platform.acme.io/v1alpha1/databaseclaims`);
   const data = await res.json();
   setClaims(data.items.map(mapClaimFromK8s));
   ```

3. **Pause/Resume** — the buttons are ready to be wired. The Crossplane pause annotation is:
   ```json
   { "metadata": { "annotations": { "crossplane.io/paused": "true" } } }
   ```
   Apply with a `PATCH` request:
   ```bash
   kubectl patch databaseclaim my-db \
     --type=merge \
     -p '{"metadata":{"annotations":{"crossplane.io/paused":"true"}}}'
   ```

### Running in-cluster (Kubernetes)

For team use, deploy the UI inside your cluster with a `Service` + `Ingress`. Create a `ServiceAccount` with RBAC access to Crossplane CRDs:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: crossplane-xr-manager-ui
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["get", "list", "watch", "patch"]  # remove patch to make read-only
```

> ⚠️ **Security note:** `kubectl proxy` has no authentication. For production, use a proper API gateway or in-cluster service with RBAC.

---

## 🔌 Kubernetes API Endpoints Used

| Resource | API Path |
|---|---|
| Claims (XRC) | `/apis/<group>/<version>/namespaces/<ns>/<kind>` |
| Composite Resources (XR) | `/apis/<group>/<version>/<kind>` |
| Managed Resources (MR) | `/apis/<provider-group>/<version>/<kind>` |
| Pause (PATCH) | Same path + `?fieldManager=crossplane-xr-manager` |

---

## 🛠️ Tech Stack

- **React 18** — UI framework
- **No external UI library** — fully custom components, zero dependencies beyond React
- **nginx** — serves the built app and proxies `/api` to kubectl proxy
- **Docker multi-stage build** — small final image (~25MB)

---

## 🤝 Contributing

PRs welcome! Some ideas for next steps:

- [ ] Wire real Kubernetes API calls (replace mock data)
- [ ] Add real-time watch (`?watch=true`) for live updates
- [ ] Multi-cluster support
- [ ] Composition / XRD browser
- [ ] Dark/light theme toggle

---

## 📄 License

MIT © [Lobobis](https://github.com/Lobobis)
