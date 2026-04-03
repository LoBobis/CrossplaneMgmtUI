import React from "react";
import { theme as R } from "../theme";
import { SectionTitle } from "./Primitives";

export function LabelsTab({ entry }) {
  const labels = Object.entries(entry.labels);
  const annotations = Object.entries(entry.annotations);
  return (
    <div>
      <SectionTitle>Labels</SectionTitle>
      {labels.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {labels.map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 3, overflow: "hidden", fontSize: 13 }}>
              <span style={{ background: R.bgPanel, padding: "4px 8px", color: R.textSecondary }}>{k}</span>
              <span style={{ background: R.bgInput, padding: "4px 8px", color: R.textPrimary, border: `1px solid ${R.border}` }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: R.textMuted, fontSize: 14, marginBottom: 20 }}>No labels</div>}

      <SectionTitle>Annotations</SectionTitle>
      {annotations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {annotations.map(([k, v]) => (
            <div key={k} style={{ display: "flex", borderRadius: 3, overflow: "hidden", fontSize: 13 }}>
              <span style={{ background: R.bgPanel, padding: "4px 8px", color: R.textSecondary, minWidth: 140 }}>{k}</span>
              <span style={{ background: R.bgInput, padding: "4px 8px", color: R.textPrimary, border: `1px solid ${R.border}`, flex: 1, fontFamily: "monospace", wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div style={{ color: R.textMuted, fontSize: 14 }}>No annotations</div>}
    </div>
  );
}
