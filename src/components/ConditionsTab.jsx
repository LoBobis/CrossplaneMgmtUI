import React from "react";
import { theme as R } from "../theme";
import { Badge, InfoRow } from "./Primitives";

export function ConditionsTab({ entry }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entry.conditions.length === 0 && (
        <div style={{ color: R.textMuted, fontSize: 14 }}>No conditions reported</div>
      )}
      {entry.conditions.map((cond, i) => (
        <div key={i} style={{
          border: `1px solid ${R.border}`, borderRadius: 4, padding: "14px 18px",
          background: R.bgCard,
          borderLeft: `4px solid ${cond.status === "True" ? R.green : R.red}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: R.textPrimary, letterSpacing: "0.06em", textTransform: "uppercase" }}>{cond.type}</span>
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
            {cond.lastTransitionTime && <InfoRow label="Last Transition" value={new Date(cond.lastTransitionTime).toLocaleString()} />}
          </div>
        </div>
      ))}
    </div>
  );
}
