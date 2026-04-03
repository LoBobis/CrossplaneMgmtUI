import React, { useState, useMemo } from "react";
import { theme as R } from "../theme";
import { Spinner } from "./Primitives";
import { toYaml, highlightYaml, cleanRaw } from "../utils/yaml";
import { applyResource } from "../api/resources";

export function YAMLEditor({ rawObj, showToast, onRefresh, compact = false }) {
  const [editing, setEditing] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [applying, setApplying] = useState(false);
  const [parseError, setParseError] = useState(null);

  const yamlView = useMemo(() => toYaml(cleanRaw(rawObj)), [rawObj]);

  const startEditing = () => {
    setJsonText(JSON.stringify(cleanRaw(rawObj), null, 2));
    setParseError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setParseError(null);
  };

  const handleApply = async () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setParseError(`Invalid JSON: ${e.message}`);
      return;
    }
    if (!parsed.apiVersion || !parsed.kind || !parsed.metadata?.name) {
      setParseError("Object must have apiVersion, kind, and metadata.name");
      return;
    }
    setApplying(true);
    setParseError(null);
    try {
      await applyResource(parsed);
      showToast(`${parsed.metadata.name} applied successfully`, "success");
      setEditing(false);
      if (onRefresh) onRefresh();
    } catch (e) {
      setParseError(`Apply failed: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  if (editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: R.amber, fontWeight: 700, letterSpacing: "0.1em" }}>
            {"\u{1F94A}"} EDITING (JSON) &mdash; MERGE-PATCH ON APPLY
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={cancelEditing} disabled={applying} style={{
              background: R.bgInput, border: `1px solid ${R.border}`, borderRadius: 4,
              color: R.textSecondary, padding: "4px 12px", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, opacity: applying ? 0.5 : 1,
            }}>Cancel</button>
            <button onClick={handleApply} disabled={applying} style={{
              background: R.greenDark, border: `1px solid ${R.green}60`, borderRadius: 4,
              color: R.green, padding: "4px 12px", fontSize: 13, cursor: applying ? "not-allowed" : "pointer",
              fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
              opacity: applying ? 0.7 : 1, letterSpacing: "0.06em",
            }}>
              {applying ? <><Spinner size={10} color={R.green} /> Applying...</> : "\u{1F3C6} Apply"}
            </button>
          </div>
        </div>
        {parseError && (
          <div style={{
            background: R.redDark, border: `1px solid ${R.red}60`, borderRadius: 4,
            padding: "8px 12px", marginBottom: 8, fontSize: 13, color: R.red,
            whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace",
          }}>{parseError}</div>
        )}
        <textarea
          value={jsonText}
          onChange={e => { setJsonText(e.target.value); setParseError(null); }}
          spellCheck={false}
          style={{
            width: "100%", minHeight: compact ? 250 : 400, background: R.bg,
            border: `1px solid ${R.gold}40`, borderRadius: 4,
            padding: 14, fontSize: 13, color: R.textPrimary, resize: "vertical",
            lineHeight: 1.6, margin: 0, fontFamily: "monospace",
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={startEditing} style={{
          background: R.bgPanel, border: `1px solid ${R.gold}40`, borderRadius: 4,
          color: R.gold, padding: "4px 12px", fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.08em",
        }}>
          {"\u{270E}"} Edit
        </button>
      </div>
      <pre style={{
        background: R.bg, border: `1px solid ${R.border}`, borderRadius: 4,
        padding: compact ? 12 : 18, fontSize: 13, color: R.textSecondary, overflowX: "auto",
        lineHeight: 1.7, margin: 0, fontFamily: "monospace",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        maxHeight: compact ? 300 : undefined,
      }}>
        {highlightYaml(yamlView)}
      </pre>
    </div>
  );
}
