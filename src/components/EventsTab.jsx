import React from "react";
import { theme as R } from "../theme";
import { Badge, InfoRow, Spinner } from "./Primitives";
import { useEvents } from "../hooks/useEvents";

function formatEventTime(event) {
  const ts = event.lastTimestamp || event.eventTime;
  if (!ts) return "\u2014";
  return new Date(ts).toLocaleString();
}

export function EventsTab({ entry }) {
  const namespace = entry.namespace || entry._raw?.metadata?.namespace || null;
  const { events, loading } = useEvents(entry.name, entry.kind, namespace);

  if (loading && events.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <Spinner size={20} />
        <div style={{ marginTop: 10, fontSize: 14, color: R.textMuted }}>Loading events...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return <div style={{ color: R.textMuted, fontSize: 14 }}>No events reported</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {events.map((event, i) => {
        const isWarning = event.type === "Warning";
        return (
          <div key={`${event.metadata?.uid || i}`} style={{
            border: `1px solid ${R.border}`, borderRadius: 4, padding: "14px 18px",
            background: R.bgCard,
            borderLeft: `4px solid ${isWarning ? R.red : R.green}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: R.textPrimary, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {event.reason || "Event"}
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {event.count > 1 && (
                  <Badge color={R.gold} bg={R.bgInput}>{event.count}x</Badge>
                )}
                <Badge
                  color={isWarning ? R.red : R.green}
                  bg={isWarning ? R.redDark : R.greenDark}
                >
                  {isWarning ? "\u{1F94A}" : "\u2705"} {event.type}
                </Badge>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {event.message && <InfoRow label="Message" value={event.message} />}
              <InfoRow label="Last Seen" value={formatEventTime(event)} />
              {event.source?.component && <InfoRow label="Source" value={event.source.component} />}
              {event.reportingComponent && !event.source?.component && <InfoRow label="Source" value={event.reportingComponent} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact events display for ManagedResourceCard.
 * Shows events as small rows with colored indicators.
 */
export function EventsCompact({ name, kind, namespace }) {
  const { events, loading } = useEvents(name, kind, namespace);

  if (loading && events.length === 0) {
    return (
      <div style={{ padding: 14, textAlign: "center" }}>
        <Spinner size={14} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ padding: 14, color: R.textMuted, fontSize: 13 }}>No events</div>
    );
  }

  return (
    <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      {events.slice(0, 20).map((event, i) => {
        const isWarning = event.type === "Warning";
        const ts = event.lastTimestamp || event.eventTime;
        const timeStr = ts ? new Date(ts).toLocaleTimeString() : "";
        return (
          <div key={`${event.metadata?.uid || i}`} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "4px 8px", borderRadius: 3,
            background: isWarning ? `${R.red}08` : "transparent",
            borderLeft: `3px solid ${isWarning ? R.red + "60" : R.green + "60"}`,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: isWarning ? R.red : R.green,
              minWidth: 80, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {event.reason || "Event"}
            </span>
            <span style={{
              fontSize: 12, color: R.textSecondary, flex: 1, fontFamily: "monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={event.message}>
              {event.message}
            </span>
            <span style={{ fontSize: 11, color: R.textMuted, flexShrink: 0, fontFamily: "monospace" }}>
              {event.count > 1 && `${event.count}x `}{timeStr}
            </span>
          </div>
        );
      })}
    </div>
  );
}
