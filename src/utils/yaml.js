import React from "react";

export function toYaml(v, depth = 0) {
  const pad = "  ".repeat(depth);
  if (v == null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (v === "" || /[:\n#[\]{}|>&*!?,'"`]/.test(v) || v === "true" || v === "false" || v === "null" || !isNaN(v))
      return JSON.stringify(v);
    return v;
  }
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return v.map(item => {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const inner = Object.entries(item).filter(([, x]) => x !== undefined);
        if (!inner.length) return `${pad}- {}`;
        const first = inner[0];
        const fVal = toYaml(first[1], depth + 2);
        const fLine = fVal.includes("\n")
          ? `${first[0]}:\n${fVal}` : `${first[0]}: ${fVal}`;
        const rest = inner.slice(1).map(([k, x]) => {
          const s = toYaml(x, depth + 2);
          return s.includes("\n") ? `${pad}  ${k}:\n${s}` : `${pad}  ${k}: ${s}`;
        }).join("\n");
        return rest ? `${pad}- ${fLine}\n${rest}` : `${pad}- ${fLine}`;
      }
      return `${pad}- ${toYaml(item, depth + 1)}`;
    }).join("\n");
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!entries.length) return "{}";
  return entries.map(([key, val]) => {
    const s = toYaml(val, depth + 1);
    return s.includes("\n") ? `${pad}${key}:\n${s}` : `${pad}${key}: ${s}`;
  }).join("\n");
}

const YAML_COLORS = {
  comment: "#6a737d",
  key: "#d2a8ff",
  colon: "#8b949e",
  bool: "#ff7b72",
  null: "#6a737d",
  number: "#79c0ff",
  string: "#a5d6ff",
  text: "#c9d1d9",
  dash: "#8b949e",
};

export function highlightYaml(yamlStr) {
  return yamlStr.split("\n").map((line, i) => {
    if (/^\s*#/.test(line))
      return <div key={i}><span style={{ color: YAML_COLORS.comment }}>{line}</span></div>;

    const m = line.match(/^(\s*(?:-\s+)?)([a-zA-Z0-9_./-]+)(:)(.*)/);
    if (m) {
      const [, indent, key, colon, rest] = m;
      let valSpan = null;
      const val = rest.trim();
      if (val === "true" || val === "false") valSpan = <span style={{ color: YAML_COLORS.bool }}>{rest}</span>;
      else if (val === "null" || val === "~") valSpan = <span style={{ color: YAML_COLORS.null }}>{rest}</span>;
      else if (/^-?\d+(\.\d+)?$/.test(val)) valSpan = <span style={{ color: YAML_COLORS.number }}>{rest}</span>;
      else if (/^["']/.test(val)) valSpan = <span style={{ color: YAML_COLORS.string }}>{rest}</span>;
      else if (val) valSpan = <span style={{ color: YAML_COLORS.text }}>{rest}</span>;
      return (
        <div key={i}>
          <span>{indent}</span>
          <span style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.colon }}>{colon}</span>
          {valSpan}
        </div>
      );
    }

    const arrM = line.match(/^(\s*-\s+)(.*)/);
    if (arrM) {
      return <div key={i}><span style={{ color: YAML_COLORS.dash }}>{arrM[1]}</span><span style={{ color: YAML_COLORS.text }}>{arrM[2]}</span></div>;
    }
    return <div key={i}>{line}</div>;
  });
}

export function cleanRaw(obj) {
  if (!obj) return obj;
  const c = { ...obj };
  if (c.metadata) {
    c.metadata = { ...c.metadata };
    delete c.metadata.managedFields;
  }
  return c;
}
