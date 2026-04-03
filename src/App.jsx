import React, { useState, useMemo, useCallback } from "react";
import { theme as R, FONT_FAMILY, globalStyles } from "./theme";
import { TOAST_DURATION_MS, HEADER_HEIGHT, LEFT_PANEL_WIDTH, SOURCE_XR } from "./config";
import { PAUSED_ANNOTATION } from "./config";
import { parseAV, resolveResourceInfo } from "./api/client";
import { patchPause, loadXRTree } from "./api/resources";
import { useResourceData } from "./hooks/useResourceData";
import { useXRTree } from "./hooks/useXRTree";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { StatusDot, Spinner, StatPill, Select, Modal } from "./components/Primitives";
import { ResourceRow } from "./components/ResourceRow";
import { DetailPanel } from "./components/DetailPanel";
import { LogsPanel } from "./components/LogsPanel";

export default function CrossplaneManager() {
  const { entries, loading, error, lastRefresh, refresh } = useResourceData();
  const [selected, setSelected] = useState(null);
  const { xrTree, setXrTree, loadingTree, setLoadingTree } = useXRTree(selected, entries);
  const [search, setSearch] = useState("");
  const [filterNs, setFilterNs] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKind, setFilterKind] = useState("all");
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [expandedResources, setExpandedResources] = useState({});
  const [showLogs, setShowLogs] = useState(false);

  const onEscape = useCallback(() => setSelected(null), []);
  useKeyboardShortcuts({ onEscape });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };

  // ─── Filters ───────────────────────────────────────────────────────────

  const namespaces = useMemo(() => {
    const ns = new Set(entries.filter(c => c.namespace).map(c => c.namespace));
    return ["all", ...ns];
  }, [entries]);
  const kinds = useMemo(() => ["all", ...new Set(entries.map(c => c.kind))], [entries]);

  const filtered = useMemo(() => entries.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.includes(q) || (c.namespace || "").includes(q) || c.kind.toLowerCase().includes(q);
    const matchNs = filterNs === "all" || c.namespace === filterNs || (filterNs === "cluster-scoped" && !c.namespace);
    const matchKind = filterKind === "all" || c.kind === filterKind;
    const matchStatus = filterStatus === "all"
      || (filterStatus === "ready" && c.ready && !c.paused)
      || (filterStatus === "paused" && c.paused)
      || (filterStatus === "error" && !c.ready && !c.paused);
    return matchSearch && matchNs && matchKind && matchStatus;
  }), [entries, search, filterNs, filterKind, filterStatus]);

  const selectedEntry = entries.find(c => c.id === selected);

  // ─── Actions ───────────────────────────────────────────────────────────

  const handlePauseToggle = (entry) => {
    const isXR = entry.sourceType === SOURCE_XR;
    setConfirmAction({
      type: isXR ? "xr" : "claim", entry,
      action: entry.paused ? "resume" : "pause",
      label: entry.paused ? "Resume" : "Pause",
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
        const { entry } = confirmAction;
        const isXR = entry.sourceType === SOURCE_XR;
        const plural = isXR ? entry._xrd.xrPlural : entry._xrd.claimPlural;
        const ns = isXR ? null : entry.namespace;
        await patchPause(entry.apiVersion, plural, entry.name, ns, shouldPause);
        await refresh(true);

        if (selected === entry.id && entry.xrRef) {
          setLoadingTree(true);
          try {
            const updatedEntry = entries.find(c => c.id === entry.id) || entry;
            const tree = await loadXRTree(updatedEntry);
            setXrTree(tree);
          } catch {} finally { setLoadingTree(false); }
        }
        const typeLabel = isXR ? "XR" : "Claim";
        showToast(`${typeLabel} ${shouldPause ? "paused" : "resumed"} successfully`, shouldPause ? "warn" : "success");
      }
    } catch (e) {
      showToast(`Failed: ${e.message}`, "error");
    }
    setActionLoading(false);
    setConfirmAction(null);
  };

  // ─── Stats ─────────────────────────────────────────────────────────────

  const stats = {
    total: entries.length,
    ready: entries.filter(c => c.ready && !c.paused).length,
    paused: entries.filter(c => c.paused).length,
    error: entries.filter(c => !c.ready && !c.paused).length,
  };

  // ─── Loading / Error states ────────────────────────────────────────────

  if (loading && entries.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: R.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, fontFamily: FONT_FAMILY, color: R.textPrimary }}>
        <div style={{ fontSize: 48 }}>{"\u{1F94A}"}</div>
        <Spinner size={32} />
        <div style={{ fontSize: 16, color: R.textSecondary, letterSpacing: "0.1em", textTransform: "uppercase" }}>Entering the ring...</div>
        <div style={{ fontSize: 13, color: R.textMuted }}>Connecting to cluster and discovering Crossplane resources</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: R.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_FAMILY, color: R.textPrimary }}>
        <div style={{ background: R.bgCard, border: `2px solid ${R.red}`, borderRadius: 4, padding: 32, maxWidth: 520, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{"\u{1F94A}"}</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22, color: R.red, textTransform: "uppercase", letterSpacing: "0.1em" }}>Down for the Count!</h2>
          <p style={{ color: R.textSecondary, fontSize: 15, lineHeight: 1.8, margin: "0 0 20px", fontFamily: "monospace" }}>{error}</p>
          <div style={{ background: R.bg, borderRadius: 4, padding: 16, textAlign: "left", fontSize: 14, color: R.textSecondary, lineHeight: 2, border: `1px solid ${R.border}` }}>
            <div style={{ color: R.gold, fontWeight: 700, marginBottom: 4, letterSpacing: "0.08em" }}>GET BACK UP, CHAMP:</div>
            <div>1. <code style={{ color: R.goldBright }}>kubectl proxy --port=8001</code> is running</div>
            <div>2. Crossplane is installed on your cluster</div>
            <div>3. You have permissions to list XRDs and claims</div>
          </div>
          <button onClick={() => refresh()} style={{
            marginTop: 20, background: R.red, border: "none", borderRadius: 4,
            color: "#fff", padding: "12px 32px", cursor: "pointer", fontSize: 16, fontFamily: "inherit",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em",
          }}>Get Back in the Ring</button>
        </div>
      </div>
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: R.bg, fontFamily: FONT_FAMILY, color: R.textPrimary }}>
      {/* Grunge texture overlay */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.04, pointerEvents: "none", zIndex: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='512' height='512' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat", backgroundSize: "512px 512px",
      }} />

      {/* Header */}
      <header style={{
        borderBottom: `2px solid ${R.gold}40`, padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: HEADER_HEIGHT, position: "sticky", top: 0, zIndex: 50,
        background: `linear-gradient(180deg, ${R.bgCard} 0%, ${R.bg} 100%)`,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div onClick={() => setSelected(null)} style={{
            width: 40, height: 40, borderRadius: 4,
            background: `linear-gradient(135deg, ${R.red}, ${R.gold})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, border: `2px solid ${R.gold}60`,
            boxShadow: `0 0 20px ${R.red}40`, cursor: "pointer",
          }}>{"\u{1F94A}"}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: R.goldBright, textTransform: "uppercase" }}>
              Rocky XR Manager
            </div>
            <div style={{ fontSize: 12, color: R.textSecondary, letterSpacing: "0.2em", fontWeight: 400 }}>
              YO ADRIAN, I DID IT! &mdash; COMPOSITE RESOURCE CONTROL PLANE
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastRefresh && (
            <span style={{ fontSize: 12, color: R.textMuted, marginRight: 8, fontFamily: "monospace" }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => setShowLogs(v => !v)} title="Toggle Logs" style={{
            background: showLogs ? `${R.gold}20` : R.bgCard, border: `1px solid ${showLogs ? R.gold + "60" : R.border}`, borderRadius: 4,
            color: showLogs ? R.goldBright : R.textMuted, padding: "5px 12px", cursor: "pointer", fontSize: 15,
            fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
          }}>{"\u{1F4CB}"}</button>
          <button onClick={() => refresh(true)} title="Refresh" style={{
            background: R.bgCard, border: `1px solid ${R.border}`, borderRadius: 4,
            color: R.gold, padding: "5px 12px", cursor: "pointer", fontSize: 15,
            fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
            letterSpacing: "0.08em",
          }}>{"\u{1F514}"}</button>
          <StatPill label="TOTAL" value={stats.total} color={R.gold} />
          <StatPill label="READY" value={stats.ready} color={R.green} />
          <StatPill label="PAUSED" value={stats.paused} color={R.amber} />
          <StatPill label="ERROR" value={stats.error} color={R.red} />
        </div>
      </header>

      <div style={{ display: "flex", height: `calc(100vh - ${HEADER_HEIGHT}px)` }}>
        {/* Left Panel */}
        <div style={{
          width: selected ? LEFT_PANEL_WIDTH : "100%", transition: "width 0.3s ease",
          borderRight: `1px solid ${R.border}`, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Filters */}
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${R.border}`, display: "flex", gap: 10, flexWrap: "wrap", background: `${R.bgCard}80` }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: R.textMuted, fontSize: 15 }}>{"\u{1F50D}"}</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search resources, namespaces, kinds..."
                style={{
                  width: "100%", background: R.bgInput, border: `1px solid ${R.border}`,
                  borderRadius: 4, padding: "8px 12px 8px 32px", color: R.textPrimary,
                  fontSize: 14, outline: "none", fontFamily: "monospace", boxSizing: "border-box",
                }}
              />
            </div>
            <Select value={filterNs} onChange={setFilterNs} options={namespaces} prefix="NS:" />
            <Select value={filterKind} onChange={setFilterKind} options={kinds} prefix="KIND:" />
            <Select value={filterStatus} onChange={setFilterStatus}
              options={["all", "ready", "paused", "error"]} prefix="STATUS:" />
          </div>

          {selected && (
            <div style={{ padding: "6px 24px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: R.textMuted, letterSpacing: "0.06em" }}>
                CLICK TO DESELECT &middot; ESC TO LEAVE THE RING
              </span>
            </div>
          )}

          {/* Resource list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
            {entries.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: R.textMuted, marginTop: 60, fontSize: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{"\u{1F94A}"}</div>
                <div style={{ letterSpacing: "0.1em" }}>No resources found</div>
                <div style={{ fontSize: 13, marginTop: 4, fontFamily: "monospace" }}>No Crossplane claims or composite resources found on this cluster</div>
              </div>
            )}
            {filtered.length === 0 && entries.length > 0 && (
              <div style={{ textAlign: "center", color: R.textMuted, marginTop: 60, fontSize: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{"\u{1F94A}"}</div>
                <div style={{ letterSpacing: "0.1em" }}>No resources match your filters</div>
              </div>
            )}
            {filtered.map(entry => (
              <ResourceRow
                key={entry.id}
                entry={entry}
                selected={selected === entry.id}
                compact={!!selected}
                onSelect={() => setSelected(selected === entry.id ? null : entry.id)}
                onPauseToggle={() => handlePauseToggle(entry)}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Detail */}
        {selected && selectedEntry && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <DetailPanel
              entry={selectedEntry}
              xr={xrTree}
              loadingTree={loadingTree}
              onClose={() => setSelected(null)}
              onPauseToggle={() => handlePauseToggle(selectedEntry)}
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
            : `${confirmAction.label} ${confirmAction.type === "xr" ? "Composite Resource" : "Claim"}`}
          onCancel={() => { if (!actionLoading) setConfirmAction(null); }}
          onConfirm={executeAction}
          confirmLabel={actionLoading ? "Working..." : confirmAction.label}
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
                  <div style={{ fontSize: 14, fontWeight: 700, color: R.textPrimary }}>{confirmAction.resource.name}</div>
                  <div style={{ fontSize: 12, color: R.textSecondary, marginTop: 2 }}>{confirmAction.resource.kind}</div>
                </div>
              </div>
              <p style={{ color: R.textSecondary, fontSize: 15, margin: 0, fontFamily: "monospace" }}>
                {confirmAction.action === "pause"
                  ? <>Setting <code style={{ color: R.goldBright }}>{PAUSED_ANNOTATION}: "true"</code> on this managed resource. Crossplane will stop reconciling it &mdash; the cloud resource will remain as-is but drift won't be corrected.</>
                  : <>Removing the <code style={{ color: R.goldBright }}>{PAUSED_ANNOTATION}</code> annotation. Crossplane will resume reconciling this managed resource immediately.</>}
              </p>
            </div>
          ) : (
            <p style={{ color: R.textSecondary, fontSize: 15, margin: 0, fontFamily: "monospace" }}>
              {confirmAction.action === "pause"
                ? <>Are you sure you want to <strong style={{ color: R.textPrimary }}>pause</strong> reconciliation for <strong style={{ color: R.textPrimary }}>{confirmAction.entry.name}</strong>? All managed resources under this {confirmAction.type === "xr" ? "composite resource" : "claim"} will stop syncing until resumed.</>
                : <>Are you sure you want to <strong style={{ color: R.textPrimary }}>resume</strong> reconciliation for <strong style={{ color: R.textPrimary }}>{confirmAction.entry.name}</strong>? Crossplane will resume reconciling this {confirmAction.type === "xr" ? "composite resource" : "claim"} and all sub-resources.</>}
            </p>
          )}
        </Modal>
      )}

      {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 999,
          background: toast.type === "success" ? R.greenDark : toast.type === "warn" ? R.amberDark : R.redDark,
          border: `2px solid ${toast.type === "success" ? R.green : toast.type === "warn" ? R.amber : R.red}60`,
          borderRadius: 4, padding: "12px 18px",
          color: toast.type === "success" ? R.green : toast.type === "warn" ? R.amber : R.red,
          fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
          animation: "slideUp 0.2s ease", letterSpacing: "0.04em", textTransform: "uppercase",
          boxShadow: `0 4px 24px ${R.bg}`,
        }}>
          {toast.type === "success" ? "\u{1F3C6}" : toast.type === "warn" ? "\u{1F6CE}\uFE0F" : "\u{1F94A}"} {toast.msg}
        </div>
      )}

      <style>{globalStyles(R)}</style>
    </div>
  );
}
