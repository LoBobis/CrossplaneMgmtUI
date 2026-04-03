import React, { useState } from "react";
import { theme as R, KIND_ICONS } from "../theme";
import { StatusDot, Tag, InfoRow } from "./Primitives";
import { YAMLEditor } from "./YAMLEditor";

export function ManagedResourceCard({ resource, onTogglePause, expanded, onToggleExpand, showToast, onRefresh }) {
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
        <span style={{ fontSize: 13, color: R.textSecondary }}>{KIND_ICONS[resource.kind] || "\u{1F94A}"}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: R.textPrimary, letterSpacing: "0.02em" }}>{resource.name}</span>
        <Tag>{resource.kind}</Tag>
        <span style={{ flex: 1 }} />
        {resource.region && <span style={{ fontSize: 12, color: R.textMuted, fontFamily: "monospace" }}>{resource.region}</span>}
        {resource._error && <span style={{ fontSize: 12, color: R.red }} title={resource._error}>&#x26A0;</span>}
        {!resource._error && (
          <button
            onClick={onTogglePause}
            style={{
              background: "none", border: `1px solid ${resource.paused ? R.amber + "40" : R.red + "40"}`,
              borderRadius: 3, color: resource.paused ? R.amber : R.red,
              padding: "2px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
            }}
          >
            {resource.paused ? "\u{1F514}" : "\u{1F6CE}\uFE0F"}
          </button>
        )}
        <button onClick={onToggleExpand} style={{
          background: "none", border: "none", color: R.textMuted,
          cursor: "pointer", fontSize: 14, padding: "2px 4px",
        }}>
          {expanded ? "\u25B2" : "\u25BC"}
        </button>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${R.border}`, background: R.bgCard }}>
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${R.border}`, padding: "0 14px" }}>
            {["info", "yaml"].map(v => (
              <button key={v} onClick={() => setActiveView(v)} style={{
                background: "none", border: "none", padding: "6px 12px", cursor: "pointer",
                fontSize: 12, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.1em",
                color: activeView === v ? R.goldBright : R.textMuted,
                borderBottom: `2px solid ${activeView === v ? R.gold : "transparent"}`,
                marginBottom: -1, textTransform: "uppercase",
              }}>
                {v === "info" ? "INFO" : "YAML"}
              </button>
            ))}
          </div>

          {activeView === "info" && (
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {resource.externalName && <InfoRow label="External Name" value={resource.externalName} />}
                <InfoRow label="Provider" value={resource.provider} />
                <InfoRow label="Region" value={resource.region || "\u2014"} />
                <InfoRow label="Ready" value={resource.ready ? "True" : "False"} color={resource.ready ? R.green : R.red} />
                <InfoRow label="Synced" value={resource.synced ? "True" : "False"} color={resource.synced ? R.green : R.red} />
                <InfoRow label="Paused" value={resource.paused ? "True" : "False"} color={resource.paused ? R.amber : R.textMuted} />
                {resource._error && <InfoRow label="Error" value={resource._error} color={R.red} />}
              </div>

              {labels.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: R.textMuted, letterSpacing: "0.1em", marginBottom: 4 }}>LABELS</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {labels.map(([k, v]) => (
                      <span key={k} style={{
                        fontSize: 12, padding: "1px 6px", borderRadius: 3,
                        background: R.bgInput, color: R.textSecondary,
                        border: `1px solid ${R.border}`, fontFamily: "monospace",
                      }}>{k}={v}</span>
                    ))}
                  </div>
                </div>
              )}

              {resource.conditions && resource.conditions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: R.textMuted, letterSpacing: "0.1em", marginBottom: 4 }}>CONDITIONS</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {resource.conditions.map((c, i) => (
                      <span key={i} style={{
                        fontSize: 12, padding: "1px 6px", borderRadius: 3,
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
