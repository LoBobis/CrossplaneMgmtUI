import React from "react";
import { theme as R } from "../theme";

export function StatusDot({ ready, synced, paused, size = 10 }) {
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

export function Badge({ children, color = R.textMuted, bg = R.bgPanel }) {
  return (
    <span style={{
      fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 3,
      color, background: bg, border: `1px solid ${color}30`,
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>{children}</span>
  );
}

export function Tag({ children }) {
  return (
    <span style={{
      fontSize: 12, padding: "1px 6px", borderRadius: 3,
      background: R.bgInput, color: R.textSecondary,
      border: `1px solid ${R.border}`, fontFamily: "monospace",
    }}>{children}</span>
  );
}

export function Spinner({ size = 16, color = R.gold }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `2px solid ${color}30`, borderTopColor: color,
      borderRadius: "50%", animation: "spin 0.6s linear infinite",
    }} />
  );
}

export function InfoRow({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: R.textMuted, letterSpacing: "0.1em", marginBottom: 2, fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 13, color: color || R.textSecondary, fontWeight: 700, wordBreak: "break-all", fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

export function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: R.gold, marginBottom: 10, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

export function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${color}12`, border: `1px solid ${color}35`,
      borderRadius: 3, padding: "4px 10px",
    }}>
      <span style={{ fontSize: 11, color: `${color}99`, letterSpacing: "0.14em", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

export function Select({ value, onChange, options, prefix }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: R.bgInput, border: `1px solid ${R.border}`, borderRadius: 4,
        padding: "7px 10px", color: value === "all" ? R.textMuted : R.textPrimary,
        fontSize: 13, outline: "none", cursor: "pointer", fontFamily: "monospace",
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

export function Modal({ title, children, onCancel, onConfirm, confirmLabel, confirmColor, confirmDisabled }) {
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
            fontSize: 14, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.06em",
            opacity: confirmDisabled ? 0.5 : 1,
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={confirmDisabled} style={{
            background: `${confirmColor}25`, border: `2px solid ${confirmColor}70`,
            borderRadius: 4, color: confirmColor, padding: "8px 18px",
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            fontSize: 14, fontFamily: "inherit", fontWeight: 800, letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: confirmDisabled ? 0.7 : 1,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
