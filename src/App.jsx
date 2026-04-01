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
  RDSInstance: "\u{1F94A}", DBSubnetGroup: "\u{1F517}", SecurityGroup: "\u{1F6E1}\uFE0F",
  DBParameterGroup: "\u2699\uFE0F", Secret: "\u{1F510}", IAMPolicy: "\u{1F4CB}", IAMRole: "\u{1F464}",
  ReplicationGroup: "\u267B\uFE0F", Bucket: "\u{1FAA3}", BucketPolicy: "\u{1F4DC}", VPC: "\u{1F310}",
  Subnet: "\u{1F50C}", InternetGateway: "\u{1F6AA}", RouteTable: "\u{1F5FA}\uFE0F", EIP: "\u{1F4CD}",
  NatGateway: "\u{1F504}", FlowLog: "\u{1F4CA}", Cluster: "\u2638\uFE0F", NodeGroup: "\u{1F4E6}",
  Addon: "\u{1F9E9}", OpenIDConnectProvider: "\u{1F511}",
};

// ─── Rocky Theme ────────────────────────────────────────────────────────────
// Gritty Philadelphia boxing gym. Championship gold. Italian Stallion energy.
const R = {
  bg:         "#0a0806",       // Gym darkness
  bgCard:     "#140e08",       // Worn leather
  bgPanel:    "#1a1209",       // Heavy bag brown
  bgInput:    "#110c06",       // Shadow
  border:     "#2a1f10",       // Rope brown
  borderLit:  "#d4a017",       // Gold rope
  gold:       "#d4a017",       // Championship belt
  goldBright: "#ffd700",       // Spotlight gold
  red:        "#c41e3a",       // Glove red
  redDark:    "#3a0a12",       // Corner blood
  green:      "#4ade80",       // Victory
  greenDark:  "#0a2e16",       // Victory dark
  amber:      "#e8a910",       // Caution bell
  amberDark:  "#2a1d04",       // Corner towel
  textPrimary:"#f5e6c8",       // Old poster cream
  textSecondary:"#8a7a5a",     // Worn text
  textMuted:  "#5a4a30",       // Faded
  accent:     "#c41e3a",       // Rocky red
  accentAlt:  "#d4a017",       // Belt gold
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
  let color = R.green;
  if (paused) color = R.amber;
  else if (!ready) color = R.red;
  else if (!synced) color = R.gold;
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: color, flexShrink: 0, boxShadow: `0 0 ${size * 1.5}px ${color}80`,
    }} />
  );
}

function Badge({ children, color = R.textMuted, bg = R.bgPanel }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 3,
      color, background: bg, border: `1px solid ${color}30`,
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>{children}</span>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 3,
      background: R.bgInput, color: R.textSecondary,
      border: `1px solid ${R.border}`, fontFamily: "monospace",
    }}>{children}</span>
  );
}

function Spinner({ size = 16, color = R.gold }) {
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
      <div style={{ minHeight: "100vh", background: R.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, fontFamily: "'Oswald', 'Impact', sans-serif", color: R.textPrimary }}>
        <div style={{ fontSize: 48 }}>{"\u{1F94A}"}</div>
        <Spinner size={32} />
        <div style={{ fontSize: 16, color: R.textSecondary, letterSpacing: "0.1em", textTransform: "uppercase" }}>Entering the ring...</div>
        <div style={{ fontSize: 11, color: R.textMuted }}>Connecting to cluster and discovering Crossplane resources</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && claims.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: R.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Oswald', 'Impact', sans-serif", color: R.textPrimary }}>
        <div style={{ background: R.bgCard, border: `2px solid ${R.red}`, borderRadius: 4, padding: 32, maxWidth: 520, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{"\u{1F94A}"}</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22, color: R.red, textTransform: "uppercase", letterSpacing: "0.1em" }}>Down for the Count!</h2>
          <p style={{ color: R.textSecondary, fontSize: 13, lineHeight: 1.8, margin: "0 0 20px", fontFamily: "monospace" }}>{error}</p>
          <div style={{ background: R.bg, borderRadius: 4, padding: 16, textAlign: "left", fontSize: 12, color: R.textSecondary, lineHeight: 2, border: `1px solid ${R.border}` }}>
            <div style={{ color: R.gold, fontWeight: 700, marginBottom: 4, letterSpacing: "0.08em" }}>GET BACK UP, CHAMP:</div>
            <div>1. <code style={{ color: R.goldBright }}>kubectl proxy --port=8001</code> is running</div>
            <div>2. Crossplane is installed on your cluster</div>
            <div>3. You have permissions to list XRDs and claims</div>
          </div>
          <button onClick={() => refresh()} style={{
            marginTop: 20, background: R.red, border: "none", borderRadius: 4,
            color: "#fff", padding: "12px 32px", cursor: "pointer", fontSize: 14, fontFamily: "inherit",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em",
          }}>Get Back in the Ring</button>
        </div>
      </div>
    );
  }

  // ─── Main UI ────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh", background: R.bg,
      fontFamily: "'Oswald', 'Impact', 'Arial Black', sans-serif",
      color: R.textPrimary,
    }}>
      {/* Grunge texture overlay */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.06, pointerEvents: "none", zIndex: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />

      {/* Header — The Arena Banner */}
      <header style={{
        borderBottom: `2px solid ${R.gold}40`, padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 68, position: "sticky", top: 0, zIndex: 50,
        background: `linear-gradient(180deg, ${R.bgCard} 0%, ${R.bg} 100%)`,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 4,
            background: `linear-gradient(135deg, ${R.red}, ${R.gold})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, border: `2px solid ${R.gold}60`,
            boxShadow: `0 0 20px ${R.red}40`,
          }}>{"\u{1F94A}"}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: R.goldBright, textTransform: "uppercase" }}>
              Rocky XR Manager
            </div>
            <div style={{ fontSize: 10, color: R.textSecondary, letterSpacing: "0.2em", fontWeight: 400 }}>
              YO ADRIAN, I DID IT! &mdash; COMPOSITE RESOURCE CONTROL PLANE
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: R.textMuted, marginRight: 8, fontFamily: "monospace" }}>
              Round {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => refresh(true)} title="New Round" style={{
            background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 4,
            color: R.gold, padding: "5px 12px", cursor: "pointer", fontSize: 13,
            fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
            letterSpacing: "0.08em",
          }}>{"\u{1F514}"} BELL</button>
          <StatPill label="FIGHTERS" value={stats.total} color={R.gold} />
          <StatPill label="STANDING" value={stats.ready} color={R.green} />
          <StatPill label="IN CORNER" value={stats.paused} color={R.amber} />
          <StatPill label="DOWN" value={stats.error} color={R.red} />
        </div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 68px)" }}>
        {/* Left Panel — The Card */}
        <div style={{
          width: selected ? "42%" : "100%", transition: "width 0.3s ease",
          borderRight: `1px solid ${R.border}`, display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Filters */}
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${R.border}`, display: "flex", gap: 10, flexWrap: "wrap", background: `${R.bgCard}80` }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: R.textMuted, fontSize: 13 }}>{"\u{1F50D}"}</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search fighters... names, gyms, weight class..."
                style={{
                  width: "100%", background: R.bgInput, border: `1px solid ${R.border}`,
                  borderRadius: 4, padding: "8px 12px 8px 32px", color: R.textPrimary,
                  fontSize: 12, outline: "none", fontFamily: "monospace", boxSizing: "border-box",
                }}
              />
            </div>
            <Select value={filterNs} onChange={setFilterNs} options={namespaces} prefix="GYM:" />
            <Select value={filterKind} onChange={setFilterKind} options={kinds} prefix="CLASS:" />
            <Select value={filterStatus} onChange={setFilterStatus}
              options={["all", "ready", "paused", "error"]} prefix="STATUS:" />
          </div>

          {/* Hint */}
          {selected && (
            <div style={{ padding: "6px 24px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: R.textMuted, letterSpacing: "0.06em" }}>
                CLICK TO DESELECT &middot; ESC TO LEAVE THE RING
              </span>
            </div>
          )}

          {/* Claims list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
            {claims.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: R.textMuted, marginTop: 60, fontSize: 14 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{"\u{1F94A}"}</div>
                <div style={{ letterSpacing: "0.1em" }}>No fighters in the ring</div>
                <div style={{ fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>No Crossplane claims found on this cluster</div>
              </div>
            )}
            {filtered.length === 0 && claims.length > 0 && (
              <div style={{ textAlign: "center", color: R.textMuted, marginTop: 60, fontSize: 14 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{"\u{1F94A}"}</div>
                <div style={{ letterSpacing: "0.1em" }}>No matches on this card</div>
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
          confirmLabel={actionLoading ? "Fighting..." : confirmAction.label}
          confirmColor={confirmAction.action === "pause" ? R.amber : R.green}
          confirmDisabled={actionLoading}
        >
          {confirmAction.type === "resource" ? (
            <div>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: R.bg, border: `1px solid ${R.border}`, borderRadius: 4,
                padding: "10px 14px", marginBottom: 14,
              }}>
                <StatusDot ready={confirmAction.resource.ready} synced={confirmAction.resource.synced} paused={confirmAction.resource.paused} size={9} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: R.textPrimary }}>{confirmAction.resource.name}</div>
                  <div style={{ fontSize: 10, color: R.textSecondary, marginTop: 2 }}>{confirmAction.resource.kind}</div>
                </div>
              </div>
              <p style={{ color: R.textSecondary, fontSize: 13, margin: 0, fontFamily: "monospace" }}>
                {confirmAction.action === "pause"
                  ? <>Throwing in the towel &mdash; setting <code style={{ color: R.goldBright }}>crossplane.io/paused: "true"</code>. Crossplane stops reconciling. The cloud resource stays as-is but drift won't be corrected.</>
                  : <>Back in the fight! Removing <code style={{ color: R.goldBright }}>crossplane.io/paused</code>. Crossplane resumes reconciling immediately.</>}
              </p>
            </div>
          ) : (
            <p style={{ color: R.textSecondary, fontSize: 13, margin: 0, fontFamily: "monospace" }}>
              {confirmAction.action === "pause"
                ? <>{"\u{1F6CE}\uFE0F"} Sending <strong style={{ color: R.textPrimary }}>{confirmAction.claim.name}</strong> to the corner. All managed resources stop syncing until the bell rings again.</>
                : <>{"\u{1F514}"} The bell rings! <strong style={{ color: R.textPrimary }}>{confirmAction.claim.name}</strong> is back in the fight. Crossplane resumes reconciling all sub-resources.</>}
            </p>
          )}
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 999,
          background: toast.type === "success" ? R.greenDark : toast.type === "warn" ? R.amberDark : R.redDark,
          border: `2px solid ${toast.type === "success" ? R.green : toast.type === "warn" ? R.amber : R.red}60`,
          borderRadius: 4, padding: "12px 18px",
          color: toast.type === "success" ? R.green : toast.type === "warn" ? R.amber : R.red,
          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
          animation: "slideUp 0.2s ease", letterSpacing: "0.04em", textTransform: "uppercase",
          boxShadow: `0 4px 24px ${R.bg}`,
        }}>
          {toast.type === "success" ? "\u{1F3C6}" : toast.type === "warn" ? "\u{1F6CE}\uFE0F" : "\u{1F94A}"} {toast.msg}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${R.bg}; }
        ::-webkit-scrollbar-thumb { background: ${R.border}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${R.gold}40; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        input::placeholder { color: ${R.textMuted} !important; }
      `}</style>
    </div>
  );
}

// ─── Sub Components ─────────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${color}12`, border: `1px solid ${color}35`,
      borderRadius: 3, padding: "4px 10px",
    }}>
      <span style={{ fontSize: 9, color: `${color}99`, letterSpacing: "0.14em", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

function Select({ value, onChange, options, prefix }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: R.bgInput, border: `1px solid ${R.border}`, borderRadius: 4,
        padding: "7px 10px", color: value === "all" ? R.textMuted : R.textPrimary,
        fontSize: 11, outline: "none", cursor: "pointer", fontFamily: "monospace",
        letterSpacing: "0.06em", fontWeight: 600,
      }}
    >
      {options.map(o => (
        <option key={o} value={o} style={{ background: R.bg }}>
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
        border: `1px solid ${selected ? R.gold + "50" : R.border}`,
        borderRadius: 4, padding: compact ? "12px 16px" : "16px 20px",
        marginBottom: 8, cursor: "pointer",
        background: selected ? R.bgPanel : R.bgCard,
        transition: "all 0.15s ease",
        position: "relative", overflow: "hidden",
      }}
    >
      {selected && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: R.gold, borderRadius: "2px 0 0 2px" }} />}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <StatusDot ready={claim.ready} synced={claim.synced} paused={claim.paused} size={9} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: R.textPrimary, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                {claim.name}
              </span>
              <Tag>{claim.kind}</Tag>
            </div>
            <div style={{ fontSize: 11, color: R.textSecondary, marginTop: 2, fontFamily: "monospace" }}>
              {claim.namespace}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {!compact && (
            <>
              <Badge
                color={claim.ready && !claim.paused ? R.green : claim.paused ? R.amber : R.red}
                bg={claim.ready && !claim.paused ? R.greenDark : claim.paused ? R.amberDark : R.redDark}
              >
                {claim.paused ? "\u{1F6CE}\uFE0F CORNER" : claim.ready ? "\u{1F3C6} CHAMPION" : "\u{1F94A} FIGHTING"}
              </Badge>
              {claim.resourceCount > 0 && (
                <Badge color={R.gold} bg={R.bgInput}>{claim.resourceCount} crew</Badge>
              )}
            </>
          )}
          <button
            onClick={e => { e.stopPropagation(); onPauseToggle(); }}
            title={claim.paused ? "Back in the ring" : "Send to corner"}
            style={{
              background: claim.paused ? R.amberDark : R.redDark,
              border: `1px solid ${claim.paused ? R.amber + "60" : R.red + "60"}`,
              borderRadius: 4, color: claim.paused ? R.amber : R.red,
              padding: "4px 10px", fontSize: 11, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.08em",
              transition: "all 0.15s ease", textTransform: "uppercase",
            }}
          >
            {claim.paused ? "\u{1F514} BELL" : "\u{1F6CE}\uFE0F CORNER"}
          </button>
        </div>
      </div>

      {!compact && readyCondition?.message && (
        <div style={{
          marginTop: 10, fontSize: 11, color: R.textSecondary, fontFamily: "monospace",
          padding: "6px 10px", background: R.bg, borderRadius: 3,
          borderLeft: `3px solid ${!claim.ready ? R.red + "60" : R.green + "60"}`,
        }}>
          {readyCondition.message}
        </div>
      )}

      {!compact && (
        <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Object.entries(claim.labels).filter(([k]) => !k.startsWith("crossplane.io/")).map(([k, v]) => (
            <Tag key={k}>{k}={v}</Tag>
          ))}
          <span style={{ fontSize: 10, color: R.textMuted, marginLeft: "auto", fontFamily: "monospace" }}>round: {claim.age}</span>
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
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${R.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: `${R.bgCard}80` }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusDot ready={claim.ready} synced={claim.synced} paused={claim.paused} size={12} />
            <span style={{ fontSize: 18, fontWeight: 700, color: R.goldBright, letterSpacing: "0.06em", textTransform: "uppercase" }}>{claim.name}</span>
            <Tag>{claim.kind}</Tag>
          </div>
          <div style={{ fontSize: 11, color: R.textSecondary, marginTop: 4, fontFamily: "monospace" }}>
            {claim.apiVersion} &middot; {claim.namespace} &middot; {claim.age} in the ring
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onPauseToggle}
            style={{
              background: claim.paused ? R.amberDark : R.redDark,
              border: `1px solid ${claim.paused ? R.amber + "60" : R.red + "60"}`,
              borderRadius: 4, color: claim.paused ? R.amber : R.red,
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            {claim.paused ? "\u{1F514} RING THE BELL" : "\u{1F6CE}\uFE0F TO THE CORNER"}
          </button>
          <button onClick={onClose} title="Back to card (Esc)" style={{
            background: R.bgInput, border: `1px solid ${R.border}`, borderRadius: 4,
            color: R.textSecondary, padding: "6px 14px", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.08em",
          }}>&larr; BACK</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${R.border}`, padding: "0 24px" }}>
        {["tree", "conditions", "labels", "yaml"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.1em",
            color: activeTab === tab ? R.goldBright : R.textMuted,
            borderBottom: `3px solid ${activeTab === tab ? R.gold : "transparent"}`,
            marginBottom: -1, transition: "all 0.15s ease", textTransform: "uppercase",
          }}>
            {tab === "tree" ? "CREW" : tab === "conditions" ? "STATS" : tab === "labels" ? "PATCHES" : "PLAYBOOK"}
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
    <div style={{ color: R.textMuted, fontSize: 13 }}>
      {claim.xrRef ? "Waiting for the fighter to enter the ring..." : "No composite resource ref found on this claim."}
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
      {/* XR node — The Main Fighter */}
      <div style={{
        border: `1px solid ${R.border}`, borderRadius: 4, padding: "14px 18px", marginBottom: 20,
        background: R.bgCard,
        borderLeft: `4px solid ${xr.paused ? R.amber : xr.ready ? R.gold : R.red}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot ready={xr.ready} synced={xr.synced} paused={xr.paused} size={10} />
          <span style={{ fontSize: 14, fontWeight: 700, color: R.goldBright, letterSpacing: "0.04em", textTransform: "uppercase" }}>{xr.name}</span>
          <Tag>{xr.kind}</Tag>
          <Badge color={R.gold} bg={R.bgInput}>{"\u{1F3C6}"} COMPOSITE</Badge>
        </div>
        <div style={{ fontSize: 11, color: R.textMuted, marginTop: 6, fontFamily: "monospace" }}>
          &uarr; Claim: {claim.name} / {claim.namespace}
        </div>
      </div>

      {/* Provider groups — The Corners */}
      {Object.entries(groups).map(([prov, resources]) => (
        <div key={prov} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ height: 2, width: 16, background: PROVIDER_COLORS[prov] || R.textMuted }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: PROVIDER_COLORS[prov] || R.textSecondary }}>
              CORNER: {prov.toUpperCase()}
            </span>
            <div style={{ flex: 1, height: 1, background: R.border }} />
            <span style={{ fontSize: 10, color: R.textMuted }}>{resources.length} fighters</span>
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
  const [activeView, setActiveView] = useState("info");
  const labels = Object.entries(resource.labels || {});

  return (
    <div style={{
      border: `1px solid ${R.border}`, borderRadius: 4, overflow: "hidden",
      background: R.bg,
      borderLeft: `3px solid ${resource.paused ? R.amber + "60" : resource.ready ? R.green + "60" : R.red + "60"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
        <StatusDot ready={resource.ready} synced={resource.synced} paused={resource.paused} size={8} />
        <span style={{ fontSize: 11, color: R.textSecondary }}>{KIND_ICONS[resource.kind] || "\u{1F94A}"}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: R.textPrimary, flex: 1, letterSpacing: "0.02em" }}>{resource.name}</span>
        <Tag>{resource.kind}</Tag>
        {resource.region && <span style={{ fontSize: 10, color: R.textMuted, fontFamily: "monospace" }}>{resource.region}</span>}
        {resource._error && <span style={{ fontSize: 10, color: R.red }} title={resource._error}>&#x26A0;</span>}
        {!resource._error && (
          <button
            onClick={onTogglePause}
            style={{
              background: "none", border: `1px solid ${resource.paused ? R.amber + "40" : R.red + "40"}`,
              borderRadius: 3, color: resource.paused ? R.amber : R.red,
              padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
            }}
          >
            {resource.paused ? "\u{1F514}" : "\u{1F6CE}\uFE0F"}
          </button>
        )}
        <button onClick={onToggleExpand} style={{
          background: "none", border: "none", color: R.textMuted,
          cursor: "pointer", fontSize: 12, padding: "2px 4px",
        }}>
          {expanded ? "\u25B2" : "\u25BC"}
        </button>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${R.border}`, background: R.bgCard }}>
          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${R.border}`, padding: "0 14px" }}>
            {["info", "yaml"].map(v => (
              <button key={v} onClick={() => setActiveView(v)} style={{
                background: "none", border: "none", padding: "6px 12px", cursor: "pointer",
                fontSize: 10, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.1em",
                color: activeView === v ? R.goldBright : R.textMuted,
                borderBottom: `2px solid ${activeView === v ? R.gold : "transparent"}`,
                marginBottom: -1, textTransform: "uppercase",
              }}>
                {v === "info" ? "STATS" : "PLAYBOOK"}
              </button>
            ))}
          </div>

          {activeView === "info" && (
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {resource.externalName && <InfoRow label="Ring Name" value={resource.externalName} />}
                <InfoRow label="Corner" value={resource.provider} />
                <InfoRow label="Arena" value={resource.region || "\u2014"} />
                <InfoRow label="Standing" value={resource.ready ? "True" : "False"} color={resource.ready ? R.green : R.red} />
                <InfoRow label="Synced" value={resource.synced ? "True" : "False"} color={resource.synced ? R.green : R.red} />
                <InfoRow label="In Corner" value={resource.paused ? "True" : "False"} color={resource.paused ? R.amber : R.textMuted} />
                {resource._error && <InfoRow label="Injury" value={resource._error} color={R.red} />}
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: R.textMuted, letterSpacing: "0.1em", marginBottom: 4 }}>PATCHES</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {labels.map(([k, v]) => (
                      <span key={k} style={{
                        fontSize: 10, padding: "1px 6px", borderRadius: 3,
                        background: R.bgInput, color: R.textSecondary,
                        border: `1px solid ${R.border}`, fontFamily: "monospace",
                      }}>{k}={v}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions */}
              {resource.conditions && resource.conditions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: R.textMuted, letterSpacing: "0.1em", marginBottom: 4 }}>FIGHT STATS</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {resource.conditions.map((c, i) => (
                      <span key={i} style={{
                        fontSize: 10, padding: "1px 6px", borderRadius: 3,
                        background: c.status === "True" ? R.greenDark + "80" : R.redDark + "80",
                        color: c.status === "True" ? R.green : R.red,
                        border: `1px solid ${c.status === "True" ? R.green + "30" : R.red + "30"}`,
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
      <div style={{ fontSize: 9, color: R.textMuted, letterSpacing: "0.1em", marginBottom: 2, fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 11, color: color || R.textSecondary, fontWeight: 700, wordBreak: "break-all", fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

function ConditionsTab({ claim }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {claim.conditions.length === 0 && (
        <div style={{ color: R.textMuted, fontSize: 12 }}>No fight stats reported</div>
      )}
      {claim.conditions.map((cond, i) => (
        <div key={i} style={{
          border: `1px solid ${R.border}`, borderRadius: 4, padding: "14px 18px",
          background: R.bgCard,
          borderLeft: `4px solid ${cond.status === "True" ? R.green : R.red}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: R.textPrimary, letterSpacing: "0.06em", textTransform: "uppercase" }}>{cond.type}</span>
            <Badge
              color={cond.status === "True" ? R.green : R.red}
              bg={cond.status === "True" ? R.greenDark : R.redDark}
            >
              {cond.status === "True" ? "\u{1F3C6}" : "\u{1F94A}"} {cond.status}
            </Badge>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <InfoRow label="Reason" value={cond.reason || "\u2014"} />
            {cond.message && <InfoRow label="Message" value={cond.message} />}
            {cond.lastTransitionTime && <InfoRow label="Last Round" value={new Date(cond.lastTransitionTime).toLocaleString()} />}
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
      <SectionTitle>Patches (Labels)</SectionTitle>
      {labels.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {labels.map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 3, overflow: "hidden", fontSize: 11 }}>
              <span style={{ background: R.bgPanel, padding: "4px 8px", color: R.textSecondary }}>{k}</span>
              <span style={{ background: R.bgInput, padding: "4px 8px", color: R.textPrimary, border: `1px solid ${R.border}` }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: R.textMuted, fontSize: 12, marginBottom: 20 }}>No patches on this fighter</div>}

      <SectionTitle>Annotations</SectionTitle>
      {annotations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {annotations.map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 3, overflow: "hidden", fontSize: 11 }}>
              <span style={{ background: R.bgPanel, padding: "4px 8px", color: R.textSecondary, minWidth: 140 }}>{k}</span>
              <span style={{ background: R.bgInput, padding: "4px 8px", color: R.textPrimary, border: `1px solid ${R.border}`, flex: 1, fontFamily: "monospace", wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: R.textMuted, fontSize: 12 }}>No annotations</div>}
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
          <span style={{ fontSize: 10, color: R.amber, fontWeight: 700, letterSpacing: "0.1em" }}>
            {"\u{1F94A}"} EDITING PLAYBOOK (JSON) &mdash; MERGE-PATCH ON APPLY
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={cancelEditing} disabled={applying} style={{
              background: R.bgInput, border: `1px solid ${R.border}`, borderRadius: 4,
              color: R.textSecondary, padding: "4px 12px", fontSize: 11, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, opacity: applying ? 0.5 : 1,
            }}>Throw Towel</button>
            <button onClick={handleApply} disabled={applying} style={{
              background: R.greenDark, border: `1px solid ${R.green}60`, borderRadius: 4,
              color: R.green, padding: "4px 12px", fontSize: 11, cursor: applying ? "not-allowed" : "pointer",
              fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
              opacity: applying ? 0.7 : 1, letterSpacing: "0.06em",
            }}>
              {applying ? <><Spinner size={10} color={R.green} /> Fighting...</> : "\u{1F3C6} Apply"}
            </button>
          </div>
        </div>
        {parseError && (
          <div style={{
            background: R.redDark, border: `1px solid ${R.red}60`, borderRadius: 4,
            padding: "8px 12px", marginBottom: 8, fontSize: 11, color: R.red,
            whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace",
          }}>{parseError}</div>
        )}
        <textarea
          value={jsonText}
          onChange={e => { setJsonText(e.target.value); setParseError(null); }}
          spellCheck={false}
          style={{
            width: "100%", minHeight: compact ? 250 : 400, background: R.bg,
            border: `1px solid ${R.gold}40`, borderRadius: 4,
            padding: 14, fontSize: 11, color: R.textPrimary, resize: "vertical",
            lineHeight: 1.6, margin: 0, fontFamily: "monospace",
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
          background: R.bgPanel, border: `1px solid ${R.gold}40`, borderRadius: 4,
          color: R.gold, padding: "4px 12px", fontSize: 11, cursor: "pointer",
          fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.08em",
        }}>
          {"\u{270E}"} Edit Playbook
        </button>
      </div>
      <pre style={{
        background: R.bg, border: `1px solid ${R.border}`, borderRadius: 4,
        padding: compact ? 12 : 18, fontSize: 11, color: R.textSecondary, overflowX: "auto",
        lineHeight: 1.7, margin: 0, fontFamily: "monospace",
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
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: R.gold, marginBottom: 10, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function Modal({ title, children, onCancel, onConfirm, confirmLabel, confirmColor, confirmDisabled }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: R.bgCard, border: `2px solid ${R.gold}40`, borderRadius: 4,
        padding: 28, width: 440, boxShadow: `0 24px 80px ${R.bg}`,
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: R.goldBright, fontFamily: "inherit", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {"\u{1F94A}"} {title}
        </h3>
        {children}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onCancel} disabled={confirmDisabled} style={{
            background: R.bgInput, border: `1px solid ${R.border}`, borderRadius: 4,
            color: R.textSecondary, padding: "8px 18px", cursor: confirmDisabled ? "not-allowed" : "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.06em",
            opacity: confirmDisabled ? 0.5 : 1,
          }}>Walk Away</button>
          <button onClick={onConfirm} disabled={confirmDisabled} style={{
            background: `${confirmColor}25`, border: `2px solid ${confirmColor}70`,
            borderRadius: 4, color: confirmColor, padding: "8px 18px",
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 800, letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: confirmDisabled ? 0.7 : 1,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
