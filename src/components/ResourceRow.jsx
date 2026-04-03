import React from "react";
import { theme as R } from "../theme";
import { SOURCE_XR } from "../config";
import { StatusDot, Badge, Tag } from "./Primitives";

export function ResourceRow({ entry, selected, compact, onSelect, onPauseToggle }) {
  const readyCondition = entry.conditions.find(c => c.type === "Ready");
  const isXR = entry.sourceType === SOURCE_XR;

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
          <StatusDot ready={entry.ready} synced={entry.synced} paused={entry.paused} size={9} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: R.textPrimary, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                {entry.name}
              </span>
              <Tag>{entry.kind}</Tag>
              {isXR && <Badge color={R.gold} bg={R.bgInput}>{"\u{1F3C6}"} XR</Badge>}
            </div>
            <div style={{ fontSize: 13, color: R.textSecondary, marginTop: 2, fontFamily: "monospace" }}>
              {isXR ? "cluster-scoped" : entry.namespace}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {!compact && (
            <>
              <Badge
                color={entry.ready && !entry.paused ? R.green : entry.paused ? R.amber : R.red}
                bg={entry.ready && !entry.paused ? R.greenDark : entry.paused ? R.amberDark : R.redDark}
              >
                {entry.paused ? "PAUSED" : entry.ready ? "READY" : "NOT READY"}
              </Badge>
              {entry.resourceCount > 0 && (
                <Badge color={R.gold} bg={R.bgInput}>{entry.resourceCount} resources</Badge>
              )}
            </>
          )}
          <button
            onClick={e => { e.stopPropagation(); onPauseToggle(); }}
            title={entry.paused ? "Resume reconciliation" : "Pause reconciliation"}
            style={{
              background: entry.paused ? R.amberDark : R.redDark,
              border: `1px solid ${entry.paused ? R.amber + "60" : R.red + "60"}`,
              borderRadius: 4, color: entry.paused ? R.amber : R.red,
              padding: "4px 10px", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.08em",
              transition: "all 0.15s ease", textTransform: "uppercase",
            }}
          >
            {entry.paused ? "\u25B6 RESUME" : "\u23F8 PAUSE"}
          </button>
        </div>
      </div>

      {!compact && readyCondition?.message && (
        <div style={{
          marginTop: 10, fontSize: 13, color: R.textSecondary, fontFamily: "monospace",
          padding: "6px 10px", background: R.bg, borderRadius: 3,
          borderLeft: `3px solid ${!entry.ready ? R.red + "60" : R.green + "60"}`,
        }}>
          {readyCondition.message}
        </div>
      )}

      {!compact && (
        <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Object.entries(entry.labels).filter(([k]) => !k.startsWith("crossplane.io/")).map(([k, v]) => (
            <Tag key={k}>{k}={v}</Tag>
          ))}
          <span style={{ fontSize: 12, color: R.textMuted, marginLeft: "auto", fontFamily: "monospace" }}>age: {entry.age}</span>
        </div>
      )}
    </div>
  );
}
