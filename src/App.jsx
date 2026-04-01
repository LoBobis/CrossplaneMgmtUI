import { useState, useEffect, useMemo } from "react";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_CLAIMS = [
  {
    id: "c1", name: "prod-database", namespace: "team-backend", kind: "DatabaseClaim",
    apiVersion: "platform.acme.io/v1alpha1", xrRef: "xr-prod-database",
    syncPolicy: "Automatic", ready: true, synced: true, paused: false,
    age: "14d", resourceCount: 6,
    conditions: [
      { type: "Ready", status: "True", reason: "Available", message: "Database is ready" },
      { type: "Synced", status: "True", reason: "ReconcileSuccess", message: "" },
    ],
    labels: { env: "prod", team: "backend" },
    annotations: { "crossplane.io/external-name": "prod-pg-main" },
  },
  {
    id: "c2", name: "staging-cache", namespace: "team-frontend", kind: "CacheClaim",
    apiVersion: "platform.acme.io/v1alpha1", xrRef: "xr-staging-cache",
    syncPolicy: "Automatic", ready: false, synced: true, paused: false,
    age: "3d", resourceCount: 3,
    conditions: [
      { type: "Ready", status: "False", reason: "Creating", message: "Waiting for ElastiCache cluster to become available" },
      { type: "Synced", status: "True", reason: "ReconcileSuccess", message: "" },
    ],
    labels: { env: "staging", team: "frontend" },
    annotations: {},
  },
  {
    id: "c3", name: "dev-bucket", namespace: "team-data", kind: "BucketClaim",
    apiVersion: "platform.acme.io/v1alpha1", xrRef: "xr-dev-bucket",
    syncPolicy: "Manual", ready: true, synced: false, paused: true,
    age: "7d", resourceCount: 2,
    conditions: [
      { type: "Ready", status: "True", reason: "Available", message: "" },
      { type: "Synced", status: "False", reason: "ReconcilePaused", message: "Reconciliation is paused" },
    ],
    labels: { env: "dev", team: "data" },
    annotations: {},
  },
  {
    id: "c4", name: "prod-network", namespace: "platform", kind: "NetworkClaim",
    apiVersion: "platform.acme.io/v1alpha1", xrRef: "xr-prod-network",
    syncPolicy: "Automatic", ready: true, synced: true, paused: false,
    age: "42d", resourceCount: 11,
    conditions: [
      { type: "Ready", status: "True", reason: "Available", message: "" },
      { type: "Synced", status: "True", reason: "ReconcileSuccess", message: "" },
    ],
    labels: { env: "prod", team: "platform" },
    annotations: { "crossplane.io/external-name": "vpc-prod-main" },
  },
  {
    id: "c5", name: "dev-cluster", namespace: "team-devops", kind: "ClusterClaim",
    apiVersion: "platform.acme.io/v1alpha1", xrRef: "xr-dev-cluster",
    syncPolicy: "Automatic", ready: false, synced: false, paused: true,
    age: "1d", resourceCount: 9,
    conditions: [
      { type: "Ready", status: "False", reason: "NotFound", message: "EKS cluster provisioning failed: quota exceeded" },
      { type: "Synced", status: "False", reason: "ReconcilePaused", message: "Reconciliation is paused" },
    ],
    labels: { env: "dev", team: "devops" },
    annotations: {},
  },
];

const MOCK_XR_TREE = {
  "xr-prod-database": {
    name: "xr-prod-database", kind: "XDatabase", ready: true, synced: true, paused: false,
    children: [
      { name: "prod-pg-instance", kind: "RDSInstance", provider: "aws", ready: true, synced: true, paused: false, externalName: "prod-pg-main", region: "eu-west-1" },
      { name: "prod-pg-subnet-group", kind: "DBSubnetGroup", provider: "aws", ready: true, synced: true, paused: false, externalName: "prod-pg-subnet", region: "eu-west-1" },
      { name: "prod-pg-sg", kind: "SecurityGroup", provider: "aws", ready: true, synced: true, paused: false, externalName: "sg-0abc123", region: "eu-west-1" },
      { name: "prod-pg-param-group", kind: "DBParameterGroup", provider: "aws", ready: true, synced: true, paused: false, externalName: "prod-pg-params", region: "eu-west-1" },
      { name: "prod-pg-secret", kind: "Secret", provider: "kubernetes", ready: true, synced: true, paused: false, externalName: "", region: "" },
      { name: "prod-pg-policy", kind: "IAMPolicy", provider: "aws", ready: true, synced: true, paused: false, externalName: "arn:aws:iam::123:policy/prod-pg", region: "global" },
    ],
  },
  "xr-staging-cache": {
    name: "xr-staging-cache", kind: "XCache", ready: false, synced: true, paused: false,
    children: [
      { name: "staging-redis-cluster", kind: "ReplicationGroup", provider: "aws", ready: false, synced: true, paused: false, externalName: "staging-redis", region: "eu-west-1" },
      { name: "staging-redis-sg", kind: "SecurityGroup", provider: "aws", ready: true, synced: true, paused: false, externalName: "sg-0xyz789", region: "eu-west-1" },
      { name: "staging-redis-secret", kind: "Secret", provider: "kubernetes", ready: true, synced: true, paused: false, externalName: "", region: "" },
    ],
  },
  "xr-dev-bucket": {
    name: "xr-dev-bucket", kind: "XBucket", ready: true, synced: false, paused: true,
    children: [
      { name: "dev-s3-bucket", kind: "Bucket", provider: "aws", ready: true, synced: true, paused: true, externalName: "acme-dev-data-bucket", region: "us-east-1" },
      { name: "dev-s3-policy", kind: "BucketPolicy", provider: "aws", ready: true, synced: true, paused: true, externalName: "acme-dev-data-bucket", region: "us-east-1" },
    ],
  },
  "xr-prod-network": {
    name: "xr-prod-network", kind: "XNetwork", ready: true, synced: true, paused: false,
    children: [
      { name: "prod-vpc", kind: "VPC", provider: "aws", ready: true, synced: true, paused: false, externalName: "vpc-0abc1234", region: "eu-west-1" },
      { name: "prod-subnet-a", kind: "Subnet", provider: "aws", ready: true, synced: true, paused: false, externalName: "subnet-aaaa", region: "eu-west-1a" },
      { name: "prod-subnet-b", kind: "Subnet", provider: "aws", ready: true, synced: true, paused: false, externalName: "subnet-bbbb", region: "eu-west-1b" },
      { name: "prod-subnet-c", kind: "Subnet", provider: "aws", ready: true, synced: true, paused: false, externalName: "subnet-cccc", region: "eu-west-1c" },
      { name: "prod-igw", kind: "InternetGateway", provider: "aws", ready: true, synced: true, paused: false, externalName: "igw-0def5678", region: "eu-west-1" },
      { name: "prod-rtb-pub", kind: "RouteTable", provider: "aws", ready: true, synced: true, paused: false, externalName: "rtb-0pub", region: "eu-west-1" },
      { name: "prod-rtb-priv", kind: "RouteTable", provider: "aws", ready: true, synced: true, paused: false, externalName: "rtb-0priv", region: "eu-west-1" },
      { name: "prod-nat-eip", kind: "EIP", provider: "aws", ready: true, synced: true, paused: false, externalName: "eipalloc-0abc", region: "eu-west-1" },
      { name: "prod-nat-gw", kind: "NatGateway", provider: "aws", ready: true, synced: true, paused: false, externalName: "nat-0abc", region: "eu-west-1" },
      { name: "prod-flow-log", kind: "FlowLog", provider: "aws", ready: true, synced: true, paused: false, externalName: "fl-0abc", region: "eu-west-1" },
      { name: "prod-sg-default", kind: "SecurityGroup", provider: "aws", ready: true, synced: true, paused: false, externalName: "sg-0prod", region: "eu-west-1" },
    ],
  },
  "xr-dev-cluster": {
    name: "xr-dev-cluster", kind: "XCluster", ready: false, synced: false, paused: true,
    children: [
      { name: "dev-eks-cluster", kind: "Cluster", provider: "aws", ready: false, synced: false, paused: true, externalName: "dev-eks", region: "us-east-1" },
      { name: "dev-eks-role", kind: "IAMRole", provider: "aws", ready: true, synced: true, paused: true, externalName: "dev-eks-role", region: "global" },
      { name: "dev-eks-node-role", kind: "IAMRole", provider: "aws", ready: true, synced: true, paused: true, externalName: "dev-eks-node-role", region: "global" },
      { name: "dev-eks-ng", kind: "NodeGroup", provider: "aws", ready: false, synced: false, paused: true, externalName: "dev-eks-ng-main", region: "us-east-1" },
      { name: "dev-eks-addon-cni", kind: "Addon", provider: "aws", ready: false, synced: false, paused: true, externalName: "vpc-cni", region: "us-east-1" },
      { name: "dev-eks-addon-dns", kind: "Addon", provider: "aws", ready: false, synced: false, paused: true, externalName: "coredns", region: "us-east-1" },
      { name: "dev-kubeconfig", kind: "Secret", provider: "kubernetes", ready: true, synced: true, paused: true, externalName: "", region: "" },
      { name: "dev-eks-sg", kind: "SecurityGroup", provider: "aws", ready: true, synced: true, paused: true, externalName: "sg-deveks", region: "us-east-1" },
      { name: "dev-oidc-provider", kind: "OpenIDConnectProvider", provider: "aws", ready: false, synced: false, paused: true, externalName: "", region: "global" },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PROVIDER_COLORS = {
  aws: "#FF9900",
  kubernetes: "#326CE5",
  azure: "#0078D4",
  gcp: "#4285F4",
};

const KIND_ICONS = {
  RDSInstance: "🗄️", DBSubnetGroup: "🔗", SecurityGroup: "🛡️", DBParameterGroup: "⚙️",
  Secret: "🔐", IAMPolicy: "📋", IAMRole: "👤", ReplicationGroup: "♻️",
  Bucket: "🪣", BucketPolicy: "📜", VPC: "🌐", Subnet: "🔌", InternetGateway: "🚪",
  RouteTable: "🗺️", EIP: "📍", NatGateway: "🔄", FlowLog: "📊", Cluster: "☸️",
  NodeGroup: "📦", Addon: "🧩", OpenIDConnectProvider: "🔑",
};

function StatusDot({ ready, synced, paused, size = 10 }) {
  let color = "#22c55e";
  if (paused) color = "#f59e0b";
  else if (!ready) color = "#ef4444";
  else if (!synced) color = "#6366f1";
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: `0 0 ${size}px ${color}60`,
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CrossplaneManager() {
  const [claims, setClaims] = useState(MOCK_CLAIMS);
  const [xrTree, setXrTree] = useState(MOCK_XR_TREE);
  const [search, setSearch] = useState("");
  const [filterNs, setFilterNs] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKind, setFilterKind] = useState("all");
  const [selected, setSelected] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [toast, setToast] = useState(null);
  const [expandedResources, setExpandedResources] = useState({});

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

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
      || (filterStatus === "error" && !c.ready && !c.paused)
      || (filterStatus === "creating" && !c.ready && !c.paused && c.synced);
    return matchSearch && matchNs && matchKind && matchStatus;
  }), [claims, search, filterNs, filterKind, filterStatus]);

  const selectedClaim = claims.find(c => c.id === selected);
  const selectedXR = selectedClaim ? xrTree[selectedClaim.xrRef] : null;

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handlePauseToggle = (claimId, currentlyPaused) => {
    setConfirmAction({
      claimId,
      action: currentlyPaused ? "resume" : "pause",
      label: currentlyPaused ? "Resume" : "Pause",
    });
  };

  const executeAction = () => {
    if (!confirmAction) return;
    const { action } = confirmAction;
    const paused = action === "pause";

    if (confirmAction.type === "resource") {
      const { xrRef, resourceName } = confirmAction;
      setXrTree(prev => ({
        ...prev,
        [xrRef]: {
          ...prev[xrRef],
          children: prev[xrRef].children.map(ch =>
            ch.name === resourceName ? { ...ch, paused } : ch
          ),
        },
      }));
      showToast(`${resourceName} ${paused ? "paused" : "resumed"}`, paused ? "warn" : "success");
    } else {
      const { claimId } = confirmAction;
      setClaims(prev => prev.map(c => {
        if (c.id !== claimId) return c;
        return {
          ...c, paused,
          synced: paused ? false : true,
          conditions: c.conditions.map(cond =>
            cond.type === "Synced"
              ? { ...cond, status: paused ? "False" : "True", reason: paused ? "ReconcilePaused" : "ReconcileSuccess", message: paused ? "Reconciliation is paused" : "" }
              : cond
          ),
        };
      }));
      setXrTree(prev => {
        const claim = claims.find(c => c.id === claimId);
        if (!claim || !prev[claim.xrRef]) return prev;
        return {
          ...prev,
          [claim.xrRef]: {
            ...prev[claim.xrRef],
            paused,
            children: prev[claim.xrRef].children.map(ch => ({ ...ch, paused })),
          },
        };
      });
      showToast(`Claim ${paused ? "paused" : "resumed"} successfully`, paused ? "warn" : "success");
    }
    setConfirmAction(null);
  };

  const handleResourcePauseToggle = (xrRef, resourceName) => {
    const resource = xrTree[xrRef]?.children.find(c => c.name === resourceName);
    if (!resource) return;
    setConfirmAction({
      type: "resource",
      xrRef,
      resourceName,
      resourceKind: resource.kind,
      action: resource.paused ? "resume" : "pause",
      label: resource.paused ? "Resume" : "Pause",
    });
  };



  const stats = {
    total: claims.length,
    ready: claims.filter(c => c.ready && !c.paused).length,
    paused: claims.filter(c => c.paused).length,
    error: claims.filter(c => !c.ready && !c.paused).length,
  };

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
          }}>✦</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "#f1f5f9" }}>
              Crossplane XR Manager
            </div>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.08em" }}>
              COMPOSITE RESOURCE CONTROL PLANE
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569", fontSize: 13 }}>⌕</span>
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
              options={["all", "ready", "paused", "error", "creating"]} prefix="STATUS:" />
          </div>

          {/* Claims list */}
          {selected && (
            <div style={{ padding: "6px 24px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.06em" }}>
                CLICK SELECTED CLAIM TO DESELECT · ESC TO CLOSE
              </span>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", color: "#334155", marginTop: 60, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>◈</div>
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
                onPauseToggle={() => handlePauseToggle(claim.id, claim.paused)}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Detail */}
        {selected && selectedClaim && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <DetailPanel
              claim={selectedClaim}
              xr={selectedXR}
              onClose={() => setSelected(null)}
              onPauseToggle={() => handlePauseToggle(selectedClaim.id, selectedClaim.paused)}
              onToggleResourcePause={(name) => handleResourcePauseToggle(selectedClaim.xrRef, name)}
              expandedResources={expandedResources}
              setExpandedResources={setExpandedResources}
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
          onCancel={() => setConfirmAction(null)}
          onConfirm={executeAction}
          confirmLabel={confirmAction.label}
          confirmColor={confirmAction.action === "pause" ? "#f59e0b" : "#22c55e"}
        >
          {confirmAction.type === "resource" ? (
            <div>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#080f1e", border: "1px solid #1e293b", borderRadius: 6,
                padding: "10px 14px", marginBottom: 14,
              }}>
                <StatusDot
                  ready={xrTree[confirmAction.xrRef]?.children.find(c => c.name === confirmAction.resourceName)?.ready}
                  synced={xrTree[confirmAction.xrRef]?.children.find(c => c.name === confirmAction.resourceName)?.synced}
                  paused={xrTree[confirmAction.xrRef]?.children.find(c => c.name === confirmAction.resourceName)?.paused}
                  size={9}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{confirmAction.resourceName}</div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{confirmAction.resourceKind}</div>
                </div>
              </div>
              <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                {confirmAction.action === "pause"
                  ? <>Setting <code style={{ color: "#38bdf8" }}>crossplane.io/paused: "true"</code> on this managed resource. Crossplane will stop reconciling it — the cloud resource will remain as-is but drift won't be corrected.</>
                  : <>Removing the <code style={{ color: "#38bdf8" }}>crossplane.io/paused</code> annotation. Crossplane will resume reconciling this managed resource immediately.</>}
              </p>
            </div>
          ) : (
            <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
              Are you sure you want to <strong style={{ color: "#f1f5f9" }}>{confirmAction.action}</strong> reconciliation?
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
          {toast.type === "success" ? "✓" : toast.type === "warn" ? "⏸" : "✗"} {toast.msg}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// ─── Sub Components ───────────────────────────────────────────────────────────

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
              <Badge color="#38bdf8" bg="#0c1929">{claim.resourceCount} resources</Badge>
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
            {claim.paused ? "▶ RESUME" : "⏸ PAUSE"}
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
          {Object.entries(claim.labels).map(([k, v]) => (
            <Tag key={k}>{k}={v}</Tag>
          ))}
          <span style={{ fontSize: 10, color: "#334155", marginLeft: "auto" }}>age: {claim.age}</span>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ claim, xr, onClose, onPauseToggle, onToggleResourcePause, expandedResources, setExpandedResources }) {
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
            {claim.apiVersion} · {claim.namespace} · {claim.age} old
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
            {claim.paused ? "▶ RESUME CLAIM" : "⏸ PAUSE CLAIM"}
          </button>
          <button onClick={onClose} title="Back to all claims (Esc)" style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6,
            color: "#94a3b8", padding: "6px 14px", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            letterSpacing: "0.04em",
          }}>← BACK</button>
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
          <ResourceTree
            xr={xr} claim={claim}
            onToggleResourcePause={onToggleResourcePause}
            expandedResources={expandedResources}
            setExpandedResources={setExpandedResources}
          />
        )}
        {activeTab === "conditions" && <ConditionsTab claim={claim} />}
        {activeTab === "labels" && <LabelsTab claim={claim} />}
        {activeTab === "yaml" && <YAMLTab claim={claim} />}
      </div>
    </div>
  );
}

function ResourceTree({ xr, claim, onToggleResourcePause, expandedResources, setExpandedResources }) {
  if (!xr) return <div style={{ color: "#475569", fontSize: 13 }}>No XR data found for this claim.</div>;

  const groups = {};
  xr.children.forEach(ch => {
    if (!groups[ch.provider]) groups[ch.provider] = [];
    groups[ch.provider].push(ch);
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
          ↑ Claim: {claim.name} / {claim.namespace}
        </div>
      </div>

      {/* Provider groups */}
      {Object.entries(groups).map(([provider, resources]) => (
        <div key={provider} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ height: 1, width: 16, background: "#1e293b" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: PROVIDER_COLORS[provider] || "#64748b" }}>
              PROVIDER: {provider.toUpperCase()}
            </span>
            <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
            <span style={{ fontSize: 10, color: "#334155" }}>{resources.length} resources</span>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {resources.map(res => (
              <ManagedResourceCard
                key={res.name}
                resource={res}
                onTogglePause={() => onToggleResourcePause(res.name)}
                expanded={expandedResources[res.name]}
                onToggleExpand={() => setExpandedResources(prev => ({ ...prev, [res.name]: !prev[res.name] }))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ManagedResourceCard({ resource, onTogglePause, expanded, onToggleExpand }) {
  return (
    <div style={{
      border: "1px solid #1e293b", borderRadius: 6, overflow: "hidden",
      background: "#050d1a",
      borderLeft: `2px solid ${resource.paused ? "#f59e0b40" : resource.ready ? "#22c55e40" : "#ef444440"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
        <StatusDot ready={resource.ready} synced={resource.synced} paused={resource.paused} size={8} />
        <span style={{ fontSize: 11, color: "#64748b" }}>{KIND_ICONS[resource.kind] || "▪"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", flex: 1 }}>{resource.name}</span>
        <Tag>{resource.kind}</Tag>
        {resource.region && <span style={{ fontSize: 10, color: "#334155" }}>{resource.region}</span>}
        <button
          onClick={onTogglePause}
          style={{
            background: "none", border: `1px solid ${resource.paused ? "#92400e50" : "#312e8150"}`,
            borderRadius: 4, color: resource.paused ? "#f59e0b" : "#6366f1",
            padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
          }}
        >
          {resource.paused ? "▶" : "⏸"}
        </button>
        <button onClick={onToggleExpand} style={{
          background: "none", border: "none", color: "#334155",
          cursor: "pointer", fontSize: 12, padding: "2px 4px",
        }}>
          {expanded ? "▲" : "▼"}
        </button>
      </div>
      {expanded && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid #1e293b", background: "#030b18" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {resource.externalName && (
              <InfoRow label="External Name" value={resource.externalName} />
            )}
            <InfoRow label="Provider" value={resource.provider} />
            <InfoRow label="Region" value={resource.region || "—"} />
            <InfoRow label="Ready" value={resource.ready ? "True" : "False"} color={resource.ready ? "#22c55e" : "#ef4444"} />
            <InfoRow label="Synced" value={resource.synced ? "True" : "False"} color={resource.synced ? "#22c55e" : "#ef4444"} />
            <InfoRow label="Paused" value={resource.paused ? "True" : "False"} color={resource.paused ? "#f59e0b" : "#475569"} />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.08em", marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 11, color: color || "#64748b", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function ConditionsTab({ claim }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
          <div style={{ display: "flex", gap: 16 }}>
            <InfoRow label="Reason" value={cond.reason} />
            {cond.message && <InfoRow label="Message" value={cond.message} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function LabelsTab({ claim }) {
  const hasLabels = Object.keys(claim.labels).length > 0;
  const hasAnnotations = Object.keys(claim.annotations).length > 0;
  return (
    <div>
      <SectionTitle>Labels</SectionTitle>
      {hasLabels ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {Object.entries(claim.labels).map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 4, overflow: "hidden", fontSize: 11 }}>
              <span style={{ background: "#1e293b", padding: "4px 8px", color: "#64748b" }}>{k}</span>
              <span style={{ background: "#0f172a", padding: "4px 8px", color: "#94a3b8", border: "1px solid #1e293b" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: "#334155", fontSize: 12, marginBottom: 20 }}>No labels</div>}

      <SectionTitle>Annotations</SectionTitle>
      {hasAnnotations ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(claim.annotations).map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 4, overflow: "hidden", fontSize: 11 }}>
              <span style={{ background: "#1e293b", padding: "4px 8px", color: "#64748b", minWidth: 140 }}>{k}</span>
              <span style={{ background: "#0f172a", padding: "4px 8px", color: "#94a3b8", border: "1px solid #1e293b", flex: 1, fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: "#334155", fontSize: 12 }}>No annotations</div>}
    </div>
  );
}

function YAMLTab({ claim }) {
  const yaml = `apiVersion: ${claim.apiVersion}
kind: ${claim.kind}
metadata:
  name: ${claim.name}
  namespace: ${claim.namespace}
  labels:
${Object.entries(claim.labels).map(([k, v]) => `    ${k}: ${v}`).join("\n") || "    {}"}
  annotations:
${Object.entries(claim.annotations).map(([k, v]) => `    ${k}: ${v}`).join("\n") || "    {}"}
spec:
  compositeDeletePolicy: Background
  resourceRef:
    apiVersion: ${claim.apiVersion}
    kind: X${claim.kind.replace("Claim", "")}
    name: ${claim.xrRef}
status:
  conditions:
${claim.conditions.map(c => `  - type: ${c.type}
    status: "${c.status}"
    reason: ${c.reason}${c.message ? `\n    message: ${c.message}` : ""}`).join("\n")}`;

  return (
    <pre style={{
      background: "#030b18", border: "1px solid #1e293b", borderRadius: 8,
      padding: 18, fontSize: 11, color: "#94a3b8", overflowX: "auto",
      lineHeight: 1.7, margin: 0, fontFamily: "inherit",
    }}>
      {yaml}
    </pre>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#475569", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Modal({ title, children, onCancel, onConfirm, confirmLabel, confirmColor }) {
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
          <button onClick={onCancel} style={{
            background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
            color: "#94a3b8", padding: "8px 18px", cursor: "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 600,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            background: `${confirmColor}20`, border: `1px solid ${confirmColor}60`,
            borderRadius: 6, color: confirmColor, padding: "8px 18px", cursor: "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 700,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
