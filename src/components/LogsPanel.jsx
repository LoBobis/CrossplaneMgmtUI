import React, { useState, useMemo, useRef } from "react";
import { theme as R } from "../theme";
import { logStore, addLog, useLogs } from "../logger";

const LOG_LEVEL_STYLE = {
  info:    { color: "#79c0ff", icon: "\u2139\uFE0F" },
  warn:    { color: R.amber,   icon: "\u26A0\uFE0F" },
  error:   { color: R.red,     icon: "\u274C" },
  success: { color: R.green,   icon: "\u2705" },
};

const LOG_CAT_LABEL = {
  api: "API", action: "ACTION", refresh: "REFRESH", system: "SYSTEM",
};

const FILTER_LEVELS = ["all", "info", "warn", "error", "success"];
const FILTER_CATEGORIES = ["all", "api", "action", "refresh"];

export function LogsPanel({ onClose }) {
  const logs = useLogs();
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const bottomRef = useRef(null);

  const filtered = useMemo(() => logs.filter(l => {
    if (filterLevel !== "all" && l.level !== filterLevel) return false;
    if (filterCat !== "all" && l.category !== filterCat) return false;
    return true;
  }), [logs, filterLevel, filterCat]);

  const clearLogs = () => {
    logStore.length = 0;
    addLog("info", "system", "Logs cleared");
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      height: 280, background: R.bg, borderTop: `2px solid ${R.gold}40`,
      display: "flex", flexDirection: "column",
      animation: "slideUp 0.15s ease",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
        borderBottom: `1px solid ${R.border}`, background: R.bgCard, flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: R.goldBright, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {"\u{1F4CB}"} Logs
        </span>
        <span style={{ fontSize: 12, color: R.textMuted, fontFamily: "monospace" }}>
          ({filtered.length}/{logs.length})
        </span>

        <div style={{ display: "flex", gap: 4, marginLeft: 16 }}>
          {FILTER_LEVELS.map(lvl => (
            <button key={lvl} onClick={() => setFilterLevel(lvl)} style={{
              background: filterLevel === lvl ? `${(LOG_LEVEL_STYLE[lvl]?.color || R.gold)}20` : "transparent",
              border: `1px solid ${filterLevel === lvl ? (LOG_LEVEL_STYLE[lvl]?.color || R.gold) + "60" : R.border}`,
              borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer",
              color: filterLevel === lvl ? (LOG_LEVEL_STYLE[lvl]?.color || R.goldBright) : R.textMuted,
              fontFamily: "inherit", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
            }}>{lvl}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {FILTER_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)} style={{
              background: filterCat === cat ? `${R.gold}15` : "transparent",
              border: `1px solid ${filterCat === cat ? R.gold + "60" : R.border}`,
              borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer",
              color: filterCat === cat ? R.goldBright : R.textMuted,
              fontFamily: "inherit", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
            }}>{LOG_CAT_LABEL[cat] || cat}</button>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        <button onClick={clearLogs} style={{
          background: "transparent", border: `1px solid ${R.border}`, borderRadius: 3,
          color: R.textMuted, padding: "2px 8px", fontSize: 11, cursor: "pointer",
          fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.06em",
        }}>CLEAR</button>
        <button onClick={onClose} style={{
          background: "transparent", border: "none", color: R.textMuted,
          cursor: "pointer", fontSize: 16, padding: "2px 6px",
        }}>{"\u2715"}</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0", fontFamily: "monospace", fontSize: 12 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 16, color: R.textMuted, textAlign: "center" }}>No log entries</div>
        )}
        {filtered.map((entry, i) => {
          const s = LOG_LEVEL_STYLE[entry.level] || LOG_LEVEL_STYLE.info;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 16px",
              background: i % 2 === 0 ? "transparent" : `${R.bgCard}60`,
              borderLeft: `3px solid ${s.color}40`,
            }}>
              <span style={{ color: R.textMuted, flexShrink: 0, fontSize: 11, minWidth: 72 }}>
                {entry.ts.toLocaleTimeString()}
              </span>
              <span style={{ fontSize: 11, flexShrink: 0, width: 14, textAlign: "center" }}>{s.icon}</span>
              <span style={{
                flexShrink: 0, fontSize: 10, padding: "1px 5px", borderRadius: 2, minWidth: 52, textAlign: "center",
                background: `${s.color}15`, color: s.color, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                {LOG_CAT_LABEL[entry.category] || entry.category}
              </span>
              <span style={{ color: R.textPrimary, flex: 1 }}>{entry.message}</span>
              {entry.detail && (
                <span style={{ color: R.textMuted, fontSize: 11, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={entry.detail}>
                  {entry.detail}
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
