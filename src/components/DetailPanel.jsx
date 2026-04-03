import React, { useState } from "react";
import { theme as R } from "../theme";
import { SOURCE_XR } from "../config";
import { StatusDot, Tag, Spinner } from "./Primitives";
import { ResourceTree } from "./ResourceTree";
import { ConditionsTab } from "./ConditionsTab";
import { LabelsTab } from "./LabelsTab";
import { YAMLEditor } from "./YAMLEditor";

export function DetailPanel({ entry, xr, loadingTree, onClose, onPauseToggle, onToggleResourcePause, expandedResources, setExpandedResources, showToast, onRefresh }) {
  const [activeTab, setActiveTab] = useState("tree");
  const isXR = entry.sourceType === SOURCE_XR;
  const pauseLabel = isXR ? "XR" : "CLAIM";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${R.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: `${R.bgCard}80` }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusDot ready={entry.ready} synced={entry.synced} paused={entry.paused} size={12} />
            <span style={{ fontSize: 18, fontWeight: 700, color: R.goldBright, letterSpacing: "0.06em", textTransform: "uppercase" }}>{entry.name}</span>
            <Tag>{entry.kind}</Tag>
          </div>
          <div style={{ fontSize: 13, color: R.textSecondary, marginTop: 4, fontFamily: "monospace" }}>
            {entry.apiVersion} &middot; {isXR ? "cluster-scoped" : entry.namespace} &middot; {entry.age} in the ring
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onPauseToggle}
            style={{
              background: entry.paused ? R.amberDark : R.redDark,
              border: `1px solid ${entry.paused ? R.amber + "60" : R.red + "60"}`,
              borderRadius: 4, color: entry.paused ? R.amber : R.red,
              padding: "6px 14px", fontSize: 14, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            {entry.paused ? `\u25B6 RESUME ${pauseLabel}` : `\u23F8 PAUSE ${pauseLabel}`}
          </button>
          <button onClick={onClose} title="Back (Esc)" style={{
            background: R.bgInput, border: `1px solid ${R.border}`, borderRadius: 4,
            color: R.textSecondary, padding: "6px 14px", cursor: "pointer",
            fontSize: 13, fontFamily: "inherit", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.08em",
          }}>&larr; BACK</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${R.border}`, padding: "0 24px" }}>
        {["tree", "conditions", "labels", "yaml"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
            fontSize: 14, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.1em",
            color: activeTab === tab ? R.goldBright : R.textMuted,
            borderBottom: `3px solid ${activeTab === tab ? R.gold : "transparent"}`,
            marginBottom: -1, transition: "all 0.15s ease", textTransform: "uppercase",
          }}>
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {activeTab === "tree" && (
          loadingTree ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
              <Spinner size={20} /><div style={{ marginTop: 10, fontSize: 14 }}>Loading resource tree...</div>
            </div>
          ) : (
            <ResourceTree
              xr={xr} entry={entry}
              onToggleResourcePause={onToggleResourcePause}
              expandedResources={expandedResources}
              setExpandedResources={setExpandedResources}
              showToast={showToast}
              onRefresh={onRefresh}
            />
          )
        )}
        {activeTab === "conditions" && <ConditionsTab entry={entry} />}
        {activeTab === "labels" && <LabelsTab entry={entry} />}
        {activeTab === "yaml" && <YAMLEditor rawObj={entry._raw} showToast={showToast} onRefresh={onRefresh} />}
      </div>
    </div>
  );
}
