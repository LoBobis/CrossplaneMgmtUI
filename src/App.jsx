import { useState, useEffect, useMemo, useCallback } from "react";

// ─── API Layer ──────────────────────────────────────────────────────────────

const API = "/api";
const resourceInfoCache = {};

async function k8s(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

async function resolveResourceInfo(group, version, kind) {
  const key = `${group}/${version}`;
  if (!resourceInfoCache[key]) {
    const path = group ? `/apis/${group}/${version}` : `/api/${version}`;
    const data = await k8s(path);
    resourceInfoCache[key] = {};
    for (const r of data.resources) {
      if (!r.name.includes("/")) {
        resourceInfoCache[key][r.kind] = { plural: r.name, namespaced: r.namespaced };
      }
    }
  }
  return resourceInfoCache[key]?.[kind];
}

function parseAV(apiVersion) {
  const p = (apiVersion || "").split("/");
  return p.length === 2 ? { group: p[0], version: p[1] } : { group: "", version: p[0] };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeAge(ts) {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const d = Math.floor(ms / 86400000);
  if (d > 0) return `${d}d`;
  const h = Math.floor(ms / 3600000);
  if (h > 0) return `${h}h`;
  return `${Math.floor(ms / 60000)}m`;
}

function inferProvider(apiGroup) {
  if (!apiGroup) return "kubernetes";
  const g = apiGroup.toLowerCase();
  if (g.includes("aws") || g.includes("amazon")) return "aws";
  if (g.includes("azure")) return "azure";
  if (g.includes("gcp") || g.includes("google")) return "gcp";
  if (g.includes("kubernetes") || g === "") return "kubernetes";
  return g.split(".")[0];
}

function getCond(obj, type) {
  return (obj?.status?.conditions || obj?.conditions || []).find(c => c.type === type);
}
function isReady(obj) { return getCond(obj, "Ready")?.status === "True"; }
function isSynced(obj) { return getCond(obj, "Synced")?.status === "True"; }
function isPaused(obj) { return obj?.metadata?.annotations?.["crossplane.io/paused"] === "true"; }

const PROVIDER_COLORS = {
  aws: "#FF9900", kubernetes: "#326CE5", azure: "#0078D4", gcp: "#4285F4",
};

const KIND_ICONS = {
  RDSInstance: "\u{1F5C4}\uFE0F", DBSubnetGroup: "\u{1F517}", SecurityGroup: "\u{1F6E1}\uFE0F",
  DBParameterGroup: "\u2699\uFE0F", Secret: "\u{1F510}", IAMPolicy: "\u{1F4CB}", IAMRole: "\u{1F464}",
  ReplicationGroup: "\u267B\uFE0F", Bucket: "\u{1FAA3}", BucketPolicy: "\u{1F4DC}", VPC: "\u{1F310}",
  Subnet: "\u{1F50C}", InternetGateway: "\u{1F6AA}", RouteTable: "\u{1F5FA}\uFE0F", EIP: "\u{1F4CD}",
  NatGateway: "\u{1F504}", FlowLog: "\u{1F4CA}", Cluster: "\u2638\uFE0F", NodeGroup: "\u{1F4E6}",
  Addon: "\u{1F9E9}", OpenIDConnectProvider: "\u{1F511}",
};

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadAllClaims() {
  const xrds = (await k8s("/apis/apiextensions.crossplane.io/v1/compositeresourcedefinitions")).items;
  const allClaims = [];

  await Promise.allSettled(xrds.map(async (xrd) => {
    const claimNames = xrd.spec.claimNames;
    if (!claimNames) return;

    const group = xrd.spec.group;
    const ver = xrd.spec.versions?.find(v => v.served)?.name || "v1alpha1";

    try {
      const [claimData, xrData] = await Promise.all([
        k8s(`/apis/${group}/${ver}/${claimNames.plural}`),
        k8s(`/apis/${group}/${ver}/${xrd.spec.names.plural}`).catch(() => ({ items: [] })),
      ]);

      const xrMap = {};
      for (const xr of xrData.items) xrMap[xr.metadata.name] = xr;

      for (const item of claimData.items) {
        const xrName = item.spec?.resourceRef?.name;
        const xr = xrName ? xrMap[xrName] : null;
        const conditions = item.status?.conditions || [];

        allClaims.push({
          id: `${item.metadata.namespace}/${item.metadata.name}`,
          name: item.metadata.name,
          namespace: item.metadata.namespace || "—",
          kind: item.kind,
          apiVersion: item.apiVersion,
          xrRef: xrName || null,
          ready: getCond(item, "Ready")?.status === "True",
          synced: getCond(item, "Synced")?.status === "True",
          paused: isPaused(item),
          age: computeAge(item.metadata.creationTimestamp),
          resourceCount: xr?.spec?.resourceRefs?.length || 0,
          conditions: conditions.map(c => ({
            type: c.type, status: c.status,
            reason: c.reason || "", message: c.message || "",
            lastTransitionTime: c.lastTransitionTime || "",
          })),
          labels: item.metadata.labels || {},
          annotations: item.metadata.annotations || {},
          _raw: item,
          _xrd: { group, version: ver, claimPlural: claimNames.plural, xrPlural: xrd.spec.names.plural },
        });
      }
    } catch (e) {
      console.warn(`Failed to fetch ${group}/${claimNames.plural}:`, e);
    }
  }));

  allClaims.sort((a, b) => a.name.localeCompare(b.name));
  return allClaims;
}

async function loadXRTree(claim) {
  if (!claim.xrRef || !claim._xrd) return null;
  const { group, version, xrPlural } = claim._xrd;
  const xr = await k8s(`/apis/${group}/${version}/${xrPlural}/${claim.xrRef}`);
  const refs = xr.spec?.resourceRefs || [];

  const children = await Promise.allSettled(refs.map(async (ref) => {
    const { group: rg, version: rv } = parseAV(ref.apiVersion);
    const info = await resolveResourceInfo(rg, rv, ref.kind);
    if (!info) throw new Error(`Unknown kind ${ref.kind}`);
    const nsPath = info.namespaced && ref.namespace ? `/namespaces/${ref.namespace}` : "";
    const base = rg ? `/apis/${rg}/${rv}` : `/api/${rv}`;
    const mr = await k8s(`${base}${nsPath}/${info.plural}/${ref.name}`);
    return {
      name: mr.metadata.name, kind: mr.kind,
      provider: inferProvider(rg),
      ready: isReady(mr), synced: isSynced(mr), paused: isPaused(mr),
      externalName: mr.metadata?.annotations?.["crossplane.io/external-name"] || "",
      region: mr.spec?.forProvider?.region || "",
      labels: mr.metadata?.labels || {},
      annotations: mr.metadata?.annotations || {},
      conditions: (mr.status?.conditions || []).map(c => ({
        type: c.type, status: c.status, reason: c.reason || "", message: c.message || "",
      })),
      apiVersion: ref.apiVersion, _raw: mr,
    };
  }));

  return {
    name: xr.metadata.name, kind: xr.kind,
    ready: isReady(xr), synced: isSynced(xr), paused: isPaused(xr),
    children: children.map((r, i) =>
      r.status === "fulfilled" ? r.value : {
        name: refs[i].name, kind: refs[i].kind,
        provider: inferProvider(parseAV(refs[i].apiVersion).group),
        ready: false, synced: false, paused: false,
        externalName: "", region: "", apiVersion: refs[i].apiVersion,
        _error: r.reason?.message,
      }
    ),
    _raw: xr,
  };
}

async function patchPause(apiVersion, plural, name, namespace, pause) {
  const { group, version } = parseAV(apiVersion);
  const nsPath = namespace ? `/namespaces/${namespace}` : "";
  const base = group ? `/apis/${group}/${version}` : `/api/${version}`;
  const url = `${API}${base}${nsPath}/${plural}/${name}?fieldManager=crossplane-xr-manager`;
  const body = { metadata: { annotations: pause ? { "crossplane.io/paused": "true" } : { "crossplane.io/paused": null } } };
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/merge-patch+json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

// Apply a full resource object (server-side apply via PATCH)
async function applyResource(obj) {
  const { group, version } = parseAV(obj.apiVersion);
  const info = await resolveResourceInfo(group, version, obj.kind);
  if (!info) throw new Error(`Unknown resource kind: ${obj.kind}`);
  const ns = obj.metadata?.namespace;
  const nsPath = ns ? `/namespaces/${ns}` : "";
  const base = group ? `/apis/${group}/${version}` : `/api/${version}`;
  const name = obj.metadata?.name;
  if (!name) throw new Error("Resource must have metadata.name");
  const url = `${API}${base}${nsPath}/${info.plural}/${name}?fieldManager=crossplane-xr-manager`;

  // Use merge-patch to apply edits
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/merge-patch+json" },
    body: JSON.stringify(obj),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ─── YAML Serializer ────────────────────────────────────────────────────────

function toYaml(v, depth = 0) {
  const pad = "  ".repeat(depth);
  if (v == null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (v === "" || /[:\n#[\]{}|>&*!?,'"`]/.test(v) || v === "true" || v === "false" || v === "null" || !isNaN(v))
      return JSON.stringify(v);
    return v;
  }
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return v.map(item => {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const inner = Object.entries(item).filter(([, x]) => x !== undefined);
        if (!inner.length) return `${pad}- {}`;
        const first = inner[0];
        const fVal = toYaml(first[1], depth + 2);
        const fLine = fVal.includes("\n")
          ? `${first[0]}:\n${fVal}` : `${first[0]}: ${fVal}`;
        const rest = inner.slice(1).map(([k, x]) => {
          const s = toYaml(x, depth + 2);
          return s.includes("\n") ? `${pad}  ${k}:\n${s}` : `${pad}  ${k}: ${s}`;
        }).join("\n");
        return rest ? `${pad}- ${fLine}\n${rest}` : `${pad}- ${fLine}`;
      }
      return `${pad}- ${toYaml(item, depth + 1)}`;
    }).join("\n");
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!entries.length) return "{}";
  return entries.map(([key, val]) => {
    const s = toYaml(val, depth + 1);
    return s.includes("\n") ? `${pad}${key}:\n${s}` : `${pad}${key}: ${s}`;
  }).join("\n");
}

function cleanRaw(obj) {
  if (!obj) return obj;
  const c = { ...obj };
  if (c.metadata) {
    c.metadata = { ...c.metadata };
    delete c.metadata.managedFields;
  }
  return c;
}

// ─── UI Primitives ──────────────────────────────────────────────────────────

function StatusDot({ ready, synced, paused, size = 10 }) {
  let color = "#22c55e";
  if (paused) color = "#f59e0b";
  else if (!ready) color = "#ef4444";
  else if (!synced) color = "#6366f1";
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: color, flexShrink: 0, boxShadow: `0 0 ${size}px ${color}60`,
    }} />
  );
}

function Badge({ children, color = "#334155", bg = "#1e293b" }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      padding: "2px 8px", borderRadius: 4,
      color, background: bg, border: `1px solid ${color}30`,
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>{children}</span>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 3,
      background: "#0f172a", color: "#64748b",
      border: "1px solid #1e293b", fontFamily: "monospace",
    }}>{children}</span>
  );
}

function Spinner({ size = 16, color = "#38bdf8" }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `2px solid ${color}30`, borderTopColor: color,
      borderRadius: "50%", animation: "spin 0.6s linear infinite",
    }} />
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CrossplaneManager() {
  const [claims, setClaims] = useState([]);
  const [xrTree, setXrTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterNs, setFilterNs] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKind, setFilterKind] = useState("all");
  const [selected, setSelected] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [expandedResources, setExpandedResources] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await loadAllClaims();
      setClaims(data);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(true), 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Load XR tree when claim is selected
  useEffect(() => {
    setXrTree(null);
    if (!selected) return;
    const claim = claims.find(c => c.id === selected);
    if (!claim?.xrRef) return;

    let cancelled = false;
    setLoadingTree(true);
    loadXRTree(claim).then(tree => {
      if (!cancelled) setXrTree(tree);
    }).catch(e => {
      if (!cancelled) showToast(`Failed to load resource tree: ${e.message}`, "error");
    }).finally(() => {
      if (!cancelled) setLoadingTree(false);
    });
    return () => { cancelled = true; };
  }, [selected, claims]);

  // ESC to close
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const namespaces = useMemo(() => ["all", ...new Set(claims.map(c => c.namespace))], [claims]);
  const kinds = useMemo(() => ["all", ...new Set(claims.map(c => c.kind))], [claims]);

  const filtered = useMemo(() => claims.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.includes(q) || c.namespace.includes(q) || c.kind.toLowerCase().includes(q);
    const matchNs = filterNs === "all" || c.namespace === filterNs;
    const matchKind = filterKind === "all" || c.kind === filterKind;
    const matchStatus = filterStatus === "all"
      || (filterStatus === "ready" && c.ready && !c.paused)
      || (filterStatus === "paused" && c.paused)
      || (filterStatus === "error" && !c.ready && !c.paused);
    return matchSearch && matchNs && matchKind && matchStatus;
  }), [claims, search, filterNs, filterKind, filterStatus]);

  const selectedClaim = claims.find(c => c.id === selected);

  const handlePauseToggle = (claim) => {
    setConfirmAction({
      type: "claim", claim,
      action: claim.paused ? "resume" : "pause",
      label: claim.paused ? "Resume" : "Pause",
    });
  };

  const handleResourcePauseToggle = (resource) => {
    setConfirmAction({
      type: "resource", resource,
      action: resource.paused ? "resume" : "pause",
      label: resource.paused ? "Resume" : "Pause",
    });
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    const { action } = confirmAction;
    const shouldPause = action === "pause";
    setActionLoading(true);

    try {
      if (confirmAction.type === "resource") {
        const { resource } = confirmAction;
        const { group, version } = parseAV(resource.apiVersion);
        const info = await resolveResourceInfo(group, version, resource.kind);
        if (!info) throw new Error(`Unknown resource kind: ${resource.kind}`);
        const ns = resource._raw?.metadata?.namespace || null;
        await patchPause(resource.apiVersion, info.plural, resource.name, ns, shouldPause);

        setXrTree(prev => prev && ({
          ...prev,
          children: prev.children.map(ch =>
            ch.name === resource.name ? { ...ch, paused: shouldPause } : ch
          ),
        }));
        showToast(`${resource.name} ${shouldPause ? "paused" : "resumed"}`, shouldPause ? "warn" : "success");
      } else {
        const { claim } = confirmAction;
        await patchPause(claim.apiVersion, claim._xrd.claimPlural, claim.name, claim.namespace, shouldPause);
        await refresh(true);

        // Refresh tree if we're viewing this claim
        if (selected === claim.id && claim.xrRef) {
          setLoadingTree(true);
          try {
            const updatedClaim = claims.find(c => c.id === claim.id) || claim;
            const tree = await loadXRTree(updatedClaim);
            setXrTree(tree);
          } catch {} finally { setLoadingTree(false); }
        }
        showToast(`Claim ${shouldPause ? "paused" : "resumed"} successfully`, shouldPause ? "warn" : "success");
      }
    } catch (e) {
      showToast(`Failed: ${e.message}`, "error");
    }
    setActionLoading(false);
    setConfirmAction(null);
  };

  const stats = {
    total: claims.length,
    ready: claims.filter(c => c.ready && !c.paused).length,
    paused: claims.filter(c => c.paused).length,
    error: claims.filter(c => !c.ready && !c.paused).length,
  };

  // ─── Error / Loading states ─────────────────────────────────────────────

  if (loading && claims.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: "'IBM Plex Mono', monospace", color: "#e2e8f0" }}>
        <Spinner size={32} />
        <div style={{ fontSize: 14, color: "#64748b" }}>Connecting to cluster and discovering Crossplane resources...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && claims.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace", color: "#e2e8f0" }}>
        <div style={{ background: "#0f172a", border: "1px solid #991b1b", borderRadius: 12, padding: 32, maxWidth: 520, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#x26A0;</div>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, color: "#f87171" }}>Cannot connect to cluster</h2>
          <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.8, margin: "0 0 20px" }}>{error}</p>
          <div style={{ background: "#020617", borderRadius: 8, padding: 16, textAlign: "left", fontSize: 12, color: "#64748b", lineHeight: 2 }}>
            <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>Make sure:</div>
            <div>1. <code style={{ color: "#38bdf8" }}>kubectl proxy --port=8001</code> is running</div>
            <div>2. Crossplane is installed on your cluster</div>
            <div>3. You have permissions to list XRDs and claims</div>
          </div>
          <button onClick={() => refresh()} style={{
            marginTop: 20, background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
            color: "#e2e8f0", padding: "10px 24px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600,
          }}>Retry Connection</button>
        </div>
      </div>
    );
  }

  // ─── Main UI ────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh", background: "#020617",
      fontFamily: "'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace",
      color: "#e2e8f0",
    }}>
      {/* Noise texture overlay */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.03, pointerEvents: "none", zIndex: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />

      {/* Header */}
      <header style={{
        borderBottom: "1px solid #1e293b", padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 60, position: "sticky", top: 0, zIndex: 50,
        background: "rgba(2,6,23,0.92)", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #38bdf8, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900,
          }}>&#x2726;</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "#f1f5f9" }}>
              Crossplane XR Manager
            </div>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.08em" }}>
              COMPOSITE RESOURCE CONTROL PLANE
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: "#334155", marginRight: 8 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => refresh(true)} title="Refresh" style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6,
            color: "#64748b", padding: "4px 10px", cursor: "pointer", fontSize: 12,
            fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
          }}>&#x21BB;</button>
          <StatPill label="TOTAL" value={stats.total} color="#38bdf8" />
          <StatPill label="READY" value={stats.ready} color="#22c55e" />
          <StatPill label="PAUSED" value={stats.paused} color="#f59e0b" />
          <StatPill label="ERROR" value={stats.error} color="#ef4444" />
        </div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
        {/* Left Panel */}
        <div style={{
          width: selected ? "42%" : "100%", transition: "width 0.3s ease",
          borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Filters */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e293b", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569", fontSize: 13 }}>&#x2315;</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search claims, namespaces, kinds..."
                style={{
                  width: "100%", background: "#0f172a", border: "1px solid #1e293b",
                  borderRadius: 6, padding: "8px 12px 8px 30px", color: "#e2e8f0",
                  fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
            </div>
            <Select value={filterNs} onChange={setFilterNs} options={namespaces} prefix="NS:" />
            <Select value={filterKind} onChange={setFilterKind} options={kinds} prefix="KIND:" />
            <Select value={filterStatus} onChange={setFilterStatus}
              options={["all", "ready", "paused", "error"]} prefix="STATUS:" />
          </div>

          {/* Hint */}
          {selected && (
            <div style={{ padding: "6px 24px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.06em" }}>
                CLICK SELECTED CLAIM TO DESELECT &middot; ESC TO CLOSE
              </span>
            </div>
          )}

          {/* Claims list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
            {claims.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: "#334155", marginTop: 60, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>&#x25C8;</div>
                No Crossplane claims found on this cluster
              </div>
            )}
            {filtered.length === 0 && claims.length > 0 && (
              <div style={{ textAlign: "center", color: "#334155", marginTop: 60, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>&#x25C8;</div>
                No claims match your filters
              </div>
            )}
            {filtered.map(claim => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                selected={selected === claim.id}
                compact={!!selected}
                onSelect={() => setSelected(selected === claim.id ? null : claim.id)}
                onPauseToggle={() => handlePauseToggle(claim)}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Detail */}
        {selected && selectedClaim && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <DetailPanel
              claim={selectedClaim}
              xr={xrTree}
              loadingTree={loadingTree}
              onClose={() => setSelected(null)}
              onPauseToggle={() => handlePauseToggle(selectedClaim)}
              onToggleResourcePause={handleResourcePauseToggle}
              expandedResources={expandedResources}
              setExpandedResources={setExpandedResources}
              showToast={showToast}
              onRefresh={() => refresh(true)}
            />
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <Modal
          title={confirmAction.type === "resource"
            ? `${confirmAction.label} Managed Resource`
            : `${confirmAction.label} Claim`}
          onCancel={() => { if (!actionLoading) setConfirmAction(null); }}
          onConfirm={executeAction}
          confirmLabel={actionLoading ? "Working..." : confirmAction.label}
          confirmColor={confirmAction.action === "pause" ? "#f59e0b" : "#22c55e"}
          confirmDisabled={actionLoading}
        >
          {confirmAction.type === "resource" ? (
            <div>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#080f1e", border: "1px solid #1e293b", borderRadius: 6,
                padding: "10px 14px", marginBottom: 14,
              }}>
                <StatusDot ready={confirmAction.resource.ready} synced={confirmAction.resource.synced} paused={confirmAction.resource.paused} size={9} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{confirmAction.resource.name}</div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{confirmAction.resource.kind}</div>
                </div>
              </div>
              <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                {confirmAction.action === "pause"
                  ? <>Setting <code style={{ color: "#38bdf8" }}>crossplane.io/paused: "true"</code> on this managed resource. Crossplane will stop reconciling it &mdash; the cloud resource will remain as-is but drift won't be corrected.</>
                  : <>Removing the <code style={{ color: "#38bdf8" }}>crossplane.io/paused</code> annotation. Crossplane will resume reconciling this managed resource immediately.</>}
              </p>
            </div>
          ) : (
            <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
              Are you sure you want to <strong style={{ color: "#f1f5f9" }}>{confirmAction.action}</strong> reconciliation for <strong style={{ color: "#f1f5f9" }}>{confirmAction.claim.name}</strong>?
              {confirmAction.action === "pause"
                ? " All managed resources under this claim will stop syncing until resumed."
                : " Crossplane will resume reconciling this claim and all sub-resources."}
            </p>
          )}
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 999,
          background: toast.type === "success" ? "#052e16" : toast.type === "warn" ? "#1c1008" : "#2d0f0f",
          border: `1px solid ${toast.type === "success" ? "#166534" : toast.type === "warn" ? "#92400e" : "#991b1b"}`,
          borderRadius: 8, padding: "12px 18px",
          color: toast.type === "success" ? "#4ade80" : toast.type === "warn" ? "#fbbf24" : "#f87171",
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          animation: "slideUp 0.2s ease",
        }}>
          {toast.type === "success" ? "\u2713" : toast.type === "warn" ? "\u23F8" : "\u2717"} {toast.msg}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// ─── Sub Components ─────────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${color}10`, border: `1px solid ${color}30`,
      borderRadius: 6, padding: "4px 10px",
    }}>
      <span style={{ fontSize: 10, color: `${color}99`, letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function Select({ value, onChange, options, prefix }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6,
        padding: "7px 10px", color: value === "all" ? "#475569" : "#e2e8f0",
        fontSize: 11, outline: "none", cursor: "pointer", fontFamily: "inherit",
        letterSpacing: "0.04em",
      }}
    >
      {options.map(o => (
        <option key={o} value={o} style={{ background: "#0f172a" }}>
          {prefix}{o.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

function ClaimRow({ claim, selected, compact, onSelect, onPauseToggle }) {
  const readyCondition = claim.conditions.find(c => c.type === "Ready");
  return (
    <div
      onClick={onSelect}
      style={{
        border: `1px solid ${selected ? "#38bdf830" : "#1e293b"}`,
        borderRadius: 8, padding: compact ? "12px 16px" : "16px 20px",
        marginBottom: 8, cursor: "pointer",
        background: selected ? "#0c1929" : "#080f1e",
        transition: "all 0.15s ease",
        position: "relative", overflow: "hidden",
      }}
    >
      {selected && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#38bdf8", borderRadius: "3px 0 0 3px" }} />}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <StatusDot ready={claim.ready} synced={claim.synced} paused={claim.paused} size={9} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
                {claim.name}
              </span>
              <Tag>{claim.kind}</Tag>
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
              {claim.namespace}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {!compact && (
            <>
              <Badge
                color={claim.ready && !claim.paused ? "#22c55e" : claim.paused ? "#f59e0b" : "#ef4444"}
                bg={claim.ready && !claim.paused ? "#052e16" : claim.paused ? "#1c1008" : "#2d0f0f"}
              >
                {claim.paused ? "PAUSED" : claim.ready ? "READY" : "NOT READY"}
              </Badge>
              {claim.resourceCount > 0 && (
                <Badge color="#38bdf8" bg="#0c1929">{claim.resourceCount} resources</Badge>
              )}
            </>
          )}
          <button
            onClick={e => { e.stopPropagation(); onPauseToggle(); }}
            title={claim.paused ? "Resume reconciliation" : "Pause reconciliation"}
            style={{
              background: claim.paused ? "#1c1008" : "#0c0c1a",
              border: `1px solid ${claim.paused ? "#92400e" : "#312e81"}`,
              borderRadius: 6, color: claim.paused ? "#fbbf24" : "#818cf8",
              padding: "4px 10px", fontSize: 11, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.04em",
              transition: "all 0.15s ease",
            }}
          >
            {claim.paused ? "\u25B6 RESUME" : "\u23F8 PAUSE"}
          </button>
        </div>
      </div>

      {!compact && readyCondition?.message && (
        <div style={{
          marginTop: 10, fontSize: 11, color: "#64748b",
          padding: "6px 10px", background: "#0f172a", borderRadius: 4,
          borderLeft: `2px solid ${!claim.ready ? "#ef444440" : "#22c55e40"}`,
        }}>
          {readyCondition.message}
        </div>
      )}

      {!compact && (
        <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Object.entries(claim.labels).filter(([k]) => !k.startsWith("crossplane.io/")).map(([k, v]) => (
            <Tag key={k}>{k}={v}</Tag>
          ))}
          <span style={{ fontSize: 10, color: "#334155", marginLeft: "auto" }}>age: {claim.age}</span>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ claim, xr, loadingTree, onClose, onPauseToggle, onToggleResourcePause, expandedResources, setExpandedResources, showToast, onRefresh }) {
  const [activeTab, setActiveTab] = useState("tree");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Detail header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusDot ready={claim.ready} synced={claim.synced} paused={claim.paused} size={11} />
            <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{claim.name}</span>
            <Tag>{claim.kind}</Tag>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
            {claim.apiVersion} &middot; {claim.namespace} &middot; {claim.age} old
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onPauseToggle}
            style={{
              background: claim.paused ? "#1c1008" : "#0c0c1a",
              border: `1px solid ${claim.paused ? "#92400e" : "#312e81"}`,
              borderRadius: 6, color: claim.paused ? "#fbbf24" : "#818cf8",
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 700,
            }}
          >
            {claim.paused ? "\u25B6 RESUME CLAIM" : "\u23F8 PAUSE CLAIM"}
          </button>
          <button onClick={onClose} title="Back to all claims (Esc)" style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6,
            color: "#94a3b8", padding: "6px 14px", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.04em",
          }}>&larr; BACK</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e293b", padding: "0 24px" }}>
        {["tree", "conditions", "labels", "yaml"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.06em",
            color: activeTab === tab ? "#38bdf8" : "#475569",
            borderBottom: `2px solid ${activeTab === tab ? "#38bdf8" : "transparent"}`,
            marginBottom: -1, transition: "all 0.15s ease",
          }}>
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {activeTab === "tree" && (
          loadingTree ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
              <Spinner size={20} /><div style={{ marginTop: 10, fontSize: 12 }}>Loading resource tree...</div>
            </div>
          ) : (
            <ResourceTree
              xr={xr} claim={claim}
              onToggleResourcePause={onToggleResourcePause}
              expandedResources={expandedResources}
              setExpandedResources={setExpandedResources}
              showToast={showToast}
              onRefresh={onRefresh}
            />
          )
        )}
        {activeTab === "conditions" && <ConditionsTab claim={claim} />}
        {activeTab === "labels" && <LabelsTab claim={claim} />}
        {activeTab === "yaml" && <YAMLEditor rawObj={claim._raw} showToast={showToast} onRefresh={onRefresh} />}
      </div>
    </div>
  );
}

function ResourceTree({ xr, claim, onToggleResourcePause, expandedResources, setExpandedResources, showToast, onRefresh }) {
  if (!xr) return (
    <div style={{ color: "#475569", fontSize: 13 }}>
      {claim.xrRef ? "No XR data loaded yet." : "No composite resource reference found on this claim."}
    </div>
  );

  const groups = {};
  xr.children.forEach(ch => {
    const p = ch.provider || "unknown";
    if (!groups[p]) groups[p] = [];
    groups[p].push(ch);
  });

  return (
    <div>
      {/* XR node */}
      <div style={{
        border: "1px solid #1e293b", borderRadius: 8, padding: "14px 18px", marginBottom: 20,
        background: "#080f1e",
        borderLeft: `3px solid ${xr.paused ? "#f59e0b" : xr.ready ? "#22c55e" : "#ef4444"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot ready={xr.ready} synced={xr.synced} paused={xr.paused} size={10} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{xr.name}</span>
          <Tag>{xr.kind}</Tag>
          <Badge color="#6366f1" bg="#0c0c1a">COMPOSITE RESOURCE</Badge>
        </div>
        <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>
          &uarr; Claim: {claim.name} / {claim.namespace}
        </div>
      </div>

      {/* Provider groups */}
      {Object.entries(groups).map(([prov, resources]) => (
        <div key={prov} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ height: 1, width: 16, background: "#1e293b" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: PROVIDER_COLORS[prov] || "#64748b" }}>
              PROVIDER: {prov.toUpperCase()}
            </span>
            <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
            <span style={{ fontSize: 10, color: "#334155" }}>{resources.length} resources</span>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {resources.map(res => (
              <ManagedResourceCard
                key={res.name}
                resource={res}
                onTogglePause={() => onToggleResourcePause(res)}
                expanded={expandedResources[res.name]}
                onToggleExpand={() => setExpandedResources(prev => ({ ...prev, [res.name]: !prev[res.name] }))}
                showToast={showToast}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ManagedResourceCard({ resource, onTogglePause, expanded, onToggleExpand, showToast, onRefresh }) {
  const [activeView, setActiveView] = useState("info"); // "info" | "yaml"
  const labels = Object.entries(resource.labels || {});

  return (
    <div style={{
      border: "1px solid #1e293b", borderRadius: 6, overflow: "hidden",
      background: "#050d1a",
      borderLeft: `2px solid ${resource.paused ? "#f59e0b40" : resource.ready ? "#22c55e40" : "#ef444440"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
        <StatusDot ready={resource.ready} synced={resource.synced} paused={resource.paused} size={8} />
        <span style={{ fontSize: 11, color: "#64748b" }}>{KIND_ICONS[resource.kind] || "\u25AA"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", flex: 1 }}>{resource.name}</span>
        <Tag>{resource.kind}</Tag>
        {resource.region && <span style={{ fontSize: 10, color: "#334155" }}>{resource.region}</span>}
        {resource._error && <span style={{ fontSize: 10, color: "#ef4444" }} title={resource._error}>&#x26A0;</span>}
        {!resource._error && (
          <button
            onClick={onTogglePause}
            style={{
              background: "none", border: `1px solid ${resource.paused ? "#92400e50" : "#312e8150"}`,
              borderRadius: 4, color: resource.paused ? "#f59e0b" : "#6366f1",
              padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
            }}
          >
            {resource.paused ? "\u25B6" : "\u23F8"}
          </button>
        )}
        <button onClick={onToggleExpand} style={{
          background: "none", border: "none", color: "#334155",
          cursor: "pointer", fontSize: 12, padding: "2px 4px",
        }}>
          {expanded ? "\u25B2" : "\u25BC"}
        </button>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #1e293b", background: "#030b18" }}>
          {/* Sub-tabs for info vs yaml */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e293b", padding: "0 14px" }}>
            {["info", "yaml"].map(v => (
              <button key={v} onClick={() => setActiveView(v)} style={{
                background: "none", border: "none", padding: "6px 12px", cursor: "pointer",
                fontSize: 10, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.06em",
                color: activeView === v ? "#38bdf8" : "#475569",
                borderBottom: `2px solid ${activeView === v ? "#38bdf8" : "transparent"}`,
                marginBottom: -1,
              }}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>

          {activeView === "info" && (
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {resource.externalName && <InfoRow label="External Name" value={resource.externalName} />}
                <InfoRow label="Provider" value={resource.provider} />
                <InfoRow label="Region" value={resource.region || "\u2014"} />
                <InfoRow label="Ready" value={resource.ready ? "True" : "False"} color={resource.ready ? "#22c55e" : "#ef4444"} />
                <InfoRow label="Synced" value={resource.synced ? "True" : "False"} color={resource.synced ? "#22c55e" : "#ef4444"} />
                <InfoRow label="Paused" value={resource.paused ? "True" : "False"} color={resource.paused ? "#f59e0b" : "#475569"} />
                {resource._error && <InfoRow label="Error" value={resource._error} color="#ef4444" />}
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.08em", marginBottom: 4 }}>LABELS</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {labels.map(([k, v]) => (
                      <span key={k} style={{
                        fontSize: 10, padding: "1px 6px", borderRadius: 3,
                        background: "#0f172a", color: "#64748b",
                        border: "1px solid #1e293b", fontFamily: "monospace",
                      }}>{k}={v}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions */}
              {resource.conditions && resource.conditions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.08em", marginBottom: 4 }}>CONDITIONS</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {resource.conditions.map((c, i) => (
                      <span key={i} style={{
                        fontSize: 10, padding: "1px 6px", borderRadius: 3,
                        background: c.status === "True" ? "#052e1680" : "#2d0f0f80",
                        color: c.status === "True" ? "#22c55e" : "#ef4444",
                        border: `1px solid ${c.status === "True" ? "#16653440" : "#991b1b40"}`,
                        fontFamily: "monospace",
                      }} title={c.message || c.reason}>{c.type}: {c.status}{c.reason ? ` (${c.reason})` : ""}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === "yaml" && resource._raw && (
            <div style={{ padding: "10px 14px" }}>
              <YAMLEditor rawObj={resource._raw} showToast={showToast} onRefresh={onRefresh} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.08em", marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 11, color: color || "#64748b", fontWeight: 600, wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}

function ConditionsTab({ claim }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {claim.conditions.length === 0 && (
        <div style={{ color: "#334155", fontSize: 12 }}>No conditions reported</div>
      )}
      {claim.conditions.map((cond, i) => (
        <div key={i} style={{
          border: "1px solid #1e293b", borderRadius: 8, padding: "14px 18px",
          background: "#080f1e",
          borderLeft: `3px solid ${cond.status === "True" ? "#22c55e" : "#ef4444"}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{cond.type}</span>
            <Badge
              color={cond.status === "True" ? "#22c55e" : "#ef4444"}
              bg={cond.status === "True" ? "#052e16" : "#2d0f0f"}
            >
              {cond.status}
            </Badge>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <InfoRow label="Reason" value={cond.reason || "\u2014"} />
            {cond.message && <InfoRow label="Message" value={cond.message} />}
            {cond.lastTransitionTime && <InfoRow label="Last Transition" value={new Date(cond.lastTransitionTime).toLocaleString()} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function LabelsTab({ claim }) {
  const labels = Object.entries(claim.labels);
  const annotations = Object.entries(claim.annotations);
  return (
    <div>
      <SectionTitle>Labels</SectionTitle>
      {labels.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {labels.map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 4, overflow: "hidden", fontSize: 11 }}>
              <span style={{ background: "#1e293b", padding: "4px 8px", color: "#64748b" }}>{k}</span>
              <span style={{ background: "#0f172a", padding: "4px 8px", color: "#94a3b8", border: "1px solid #1e293b" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: "#334155", fontSize: 12, marginBottom: 20 }}>No labels</div>}

      <SectionTitle>Annotations</SectionTitle>
      {annotations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {annotations.map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 4, overflow: "hidden", fontSize: 11 }}>
              <span style={{ background: "#1e293b", padding: "4px 8px", color: "#64748b", minWidth: 140 }}>{k}</span>
              <span style={{ background: "#0f172a", padding: "4px 8px", color: "#94a3b8", border: "1px solid #1e293b", flex: 1, fontFamily: "monospace", wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: "#334155", fontSize: 12 }}>No annotations</div>}
    </div>
  );
}

function YAMLEditor({ rawObj, showToast, onRefresh, compact = false }) {
  const [editing, setEditing] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [applying, setApplying] = useState(false);
  const [parseError, setParseError] = useState(null);

  const yamlView = useMemo(() => toYaml(cleanRaw(rawObj)), [rawObj]);

  const startEditing = () => {
    const cleaned = cleanRaw(rawObj);
    setJsonText(JSON.stringify(cleaned, null, 2));
    setParseError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setParseError(null);
  };

  const handleApply = async () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setParseError(`Invalid JSON: ${e.message}`);
      return;
    }
    if (!parsed.apiVersion || !parsed.kind || !parsed.metadata?.name) {
      setParseError("Object must have apiVersion, kind, and metadata.name");
      return;
    }
    setApplying(true);
    setParseError(null);
    try {
      await applyResource(parsed);
      showToast(`${parsed.metadata.name} applied successfully`, "success");
      setEditing(false);
      if (onRefresh) onRefresh();
    } catch (e) {
      setParseError(`Apply failed: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  if (editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.06em" }}>
            EDITING (JSON) &mdash; Changes will be applied via merge-patch
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={cancelEditing} disabled={applying} style={{
              background: "#1e293b", border: "1px solid #334155", borderRadius: 5,
              color: "#94a3b8", padding: "4px 12px", fontSize: 11, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, opacity: applying ? 0.5 : 1,
            }}>Cancel</button>
            <button onClick={handleApply} disabled={applying} style={{
              background: "#052e16", border: "1px solid #166534", borderRadius: 5,
              color: "#4ade80", padding: "4px 12px", fontSize: 11, cursor: applying ? "not-allowed" : "pointer",
              fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
              opacity: applying ? 0.7 : 1,
            }}>
              {applying ? <><Spinner size={10} color="#4ade80" /> Applying...</> : "\u2714 Apply"}
            </button>
          </div>
        </div>
        {parseError && (
          <div style={{
            background: "#2d0f0f", border: "1px solid #991b1b", borderRadius: 6,
            padding: "8px 12px", marginBottom: 8, fontSize: 11, color: "#f87171",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>{parseError}</div>
        )}
        <textarea
          value={jsonText}
          onChange={e => { setJsonText(e.target.value); setParseError(null); }}
          spellCheck={false}
          style={{
            width: "100%", minHeight: compact ? 250 : 400, background: "#030b18",
            border: "1px solid #f59e0b40", borderRadius: 8,
            padding: 14, fontSize: 11, color: "#e2e8f0", resize: "vertical",
            lineHeight: 1.6, margin: 0, fontFamily: "'IBM Plex Mono', monospace",
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={startEditing} style={{
          background: "#0c0c1a", border: "1px solid #312e81", borderRadius: 5,
          color: "#818cf8", padding: "4px 12px", fontSize: 11, cursor: "pointer",
          fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.04em",
        }}>
          &#x270E; Edit
        </button>
      </div>
      <pre style={{
        background: "#030b18", border: "1px solid #1e293b", borderRadius: 8,
        padding: compact ? 12 : 18, fontSize: 11, color: "#94a3b8", overflowX: "auto",
        lineHeight: 1.7, margin: 0, fontFamily: "inherit",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        maxHeight: compact ? 300 : undefined,
      }}>
        {yamlView}
      </pre>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#475569", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Modal({ title, children, onCancel, onConfirm, confirmLabel, confirmColor, confirmDisabled }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
        padding: 28, width: 420, boxShadow: "0 24px 80px #000a",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#f1f5f9", fontFamily: "inherit" }}>{title}</h3>
        {children}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onCancel} disabled={confirmDisabled} style={{
            background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
            color: "#94a3b8", padding: "8px 18px", cursor: confirmDisabled ? "not-allowed" : "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 600,
            opacity: confirmDisabled ? 0.5 : 1,
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={confirmDisabled} style={{
            background: `${confirmColor}20`, border: `1px solid ${confirmColor}60`,
            borderRadius: 6, color: confirmColor, padding: "8px 18px",
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 700,
            opacity: confirmDisabled ? 0.7 : 1,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
