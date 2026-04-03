import { API_BASE_PATH } from "../config";
import { log } from "../logger";

const resourceInfoCache = {};

export async function k8s(path) {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_PATH}${path}`);
    const elapsed = Math.round(performance.now() - start);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const errMsg = `${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`;
      log.error("api", `GET ${path} \u2192 ${res.status} (${elapsed}ms)`, errMsg);
      throw new Error(errMsg);
    }
    log.info("api", `GET ${path} \u2192 ${res.status} (${elapsed}ms)`);
    return res.json();
  } catch (e) {
    if (!e.message.match(/^\d{3}/)) {
      log.error("api", `GET ${path} \u2192 FAILED`, e.message);
    }
    throw e;
  }
}

export async function resolveResourceInfo(group, version, kind) {
  const key = `${group}/${version}`;
  if (!resourceInfoCache[key]) {
    const path = group ? `/apis/${group}/${version}` : `/api/${version}`;
    const data = await k8s(path);
    resourceInfoCache[key] = {};
    for (const r of data.resources) {
      if (!r.name.includes("/")) {
        resourceInfoCache[key][r.kind] = { plural: r.name, namespaced: r.namespaced };
      }
    }
  }
  return resourceInfoCache[key]?.[kind];
}

export function parseAV(apiVersion) {
  const p = (apiVersion || "").split("/");
  return p.length === 2 ? { group: p[0], version: p[1] } : { group: "", version: p[0] };
}
