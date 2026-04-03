import React from "react";
import { theme as R, PROVIDER_COLORS } from "../theme";
import { SOURCE_XR } from "../config";
import { StatusDot, Badge, Tag } from "./Primitives";
import { ManagedResourceCard } from "./ManagedResourceCard";

export function ResourceTree({ xr, entry, onToggleResourcePause, expandedResources, setExpandedResources, showToast, onRefresh }) {
  const isXR = entry.sourceType === SOURCE_XR;

  if (!xr) return (
    <div style={{ color: R.textMuted, fontSize: 15 }}>
      {entry.xrRef || isXR ? "No XR data loaded yet." : "No composite resource reference found on this resource."}
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
      <div style={{
        border: `1px solid ${R.border}`, borderRadius: 4, padding: "14px 18px", marginBottom: 20,
        background: R.bgCard,
        borderLeft: `4px solid ${xr.paused ? R.amber : xr.ready ? R.gold : R.red}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot ready={xr.ready} synced={xr.synced} paused={xr.paused} size={10} />
          <span style={{ fontSize: 16, fontWeight: 700, color: R.goldBright, letterSpacing: "0.04em", textTransform: "uppercase" }}>{xr.name}</span>
          <Tag>{xr.kind}</Tag>
          <Badge color={R.gold} bg={R.bgInput}>{"\u{1F3C6}"} COMPOSITE</Badge>
        </div>
        <div style={{ fontSize: 13, color: R.textMuted, marginTop: 6, fontFamily: "monospace" }}>
          {isXR
            ? "\u2191 Standalone Composite Resource (no claim)"
            : `\u2191 Claim: ${entry.name} / ${entry.namespace}`}
        </div>
      </div>

      {Object.entries(groups).map(([prov, resources]) => (
        <div key={prov} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ height: 2, width: 16, background: PROVIDER_COLORS[prov] || R.textMuted }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: PROVIDER_COLORS[prov] || R.textSecondary }}>
              PROVIDER: {prov.toUpperCase()}
            </span>
            <div style={{ flex: 1, height: 1, background: R.border }} />
            <span style={{ fontSize: 12, color: R.textMuted }}>{resources.length} resources</span>
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
