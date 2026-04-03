import {
  API_BASE_PATH, FIELD_MANAGER, XRD_API_PATH,
  DEFAULT_VERSION_FALLBACK, PAUSED_ANNOTATION,
  EXTERNAL_NAME_ANNOTATION, SOURCE_CLAIM, SOURCE_XR,
} from "../config";
import { log } from "../logger";
import { k8s, parseAV, resolveResourceInfo } from "./client";
import { getCond, isReady, isSynced, isPaused } from "../utils/conditions";
import { computeAge, inferProvider } from "../utils/formatting";

// ─── Helpers ───────────────────────────────────────────────────────────────

function getServedVersion(xrd) {
  return xrd.spec.versions?.find(v => v.served)?.name || DEFAULT_VERSION_FALLBACK;
}

function buildEntry(item, { sourceType, group, version, claimPlural, xrPlural, xr }) {
  const conditions = item.status?.conditions || [];
  const isClaimSource = sourceType === SOURCE_CLAIM;
  const xrName = isClaimSource ? (item.spec?.resourceRef?.name || null) : item.metadata.name;

  return {
    id: isClaimSource
      ? `${item.metadata.namespace}/${item.metadata.name}`
      : `xr/${item.metadata.name}`,
    sourceType,
    name: item.metadata.name,
    namespace: isClaimSource ? (item.metadata.namespace || "\u2014") : null,
    kind: item.kind,
    apiVersion: item.apiVersion,
    xrRef: xrName,
    ready: getCond(item, "Ready")?.status === "True",
    synced: getCond(item, "Synced")?.status === "True",
    paused: isPaused(item),
    age: computeAge(item.metadata.creationTimestamp),
    resourceCount: isClaimSource
      ? (xr?.spec?.resourceRefs?.length || 0)
      : (item.spec?.resourceRefs?.length || 0),
    conditions: conditions.map(c => ({
      type: c.type, status: c.status,
      reason: c.reason || "", message: c.message || "",
      lastTransitionTime: c.lastTransitionTime || "",
    })),
    labels: item.metadata.labels || {},
    annotations: item.metadata.annotations || {},
    _raw: item,
    _xrd: { group, version, claimPlural: claimPlural || null, xrPlural },
  };
}

// ─── Data Loading ──────────────────────────────────────────────────────────

export async function loadAllEntries() {
  const xrds = (await k8s(XRD_API_PATH)).items;
  log.info("refresh", `Discovered ${xrds.length} XRDs`);
  const allEntries = [];

  await Promise.allSettled(xrds.map(async (xrd) => {
    const group = xrd.spec.group;
    const ver = getServedVersion(xrd);
    const xrPlural = xrd.spec.names.plural;
    const claimNames = xrd.spec.claimNames;

    if (claimNames) {
      // Fetch claims + their XRs
      log.info("refresh", `Fetching claims: ${group}/${ver}/${claimNames.plural}`);
      try {
        const [claimData, xrData] = await Promise.all([
          k8s(`/apis/${group}/${ver}/${claimNames.plural}`),
          k8s(`/apis/${group}/${ver}/${xrPlural}`).catch(() => ({ items: [] })),
        ]);

        const xrMap = {};
        for (const xr of xrData.items) xrMap[xr.metadata.name] = xr;

        log.info("refresh", `Found ${claimData.items.length} ${claimNames.plural} claims`);
        for (const item of claimData.items) {
          const xrName = item.spec?.resourceRef?.name;
          allEntries.push(buildEntry(item, {
            sourceType: SOURCE_CLAIM, group, version: ver,
            claimPlural: claimNames.plural, xrPlural,
            xr: xrName ? xrMap[xrName] : null,
          }));
        }
      } catch (e) {
        log.error("refresh", `Failed to fetch ${group}/${claimNames.plural}`, e.message);
      }
    } else {
      // No claims — fetch standalone XRs directly
      log.info("refresh", `XRD ${xrd.metadata.name} has no claimNames, fetching XRs: ${group}/${ver}/${xrPlural}`);
      try {
        const xrData = await k8s(`/apis/${group}/${ver}/${xrPlural}`);
        log.info("refresh", `Found ${xrData.items.length} standalone ${xrPlural} XRs`);
        for (const item of xrData.items) {
          allEntries.push(buildEntry(item, {
            sourceType: SOURCE_XR, group, version: ver,
            claimPlural: null, xrPlural,
          }));
        }
      } catch (e) {
        log.error("refresh", `Failed to fetch XRs ${group}/${xrPlural}`, e.message);
      }
    }
  }));

  allEntries.sort((a, b) => a.name.localeCompare(b.name));
  return allEntries;
}

export async function loadXRTree(entry) {
  const { group, version, xrPlural } = entry._xrd;

  let xr;
  if (entry.sourceType === SOURCE_XR) {
    // For standalone XRs, re-fetch for freshness
    xr = await k8s(`/apis/${group}/${version}/${xrPlural}/${entry.name}`);
  } else {
    // For claims, fetch via xrRef
    if (!entry.xrRef) return null;
    xr = await k8s(`/apis/${group}/${version}/${xrPlural}/${entry.xrRef}`);
  }

  const refs = xr.spec?.resourceRefs || [];

  const children = await Promise.allSettled(refs.map(async (ref) => {
    const { group: rg, version: rv } = parseAV(ref.apiVersion);
    const info = await resolveResourceInfo(rg, rv, ref.kind);
    if (!info) throw new Error(`Unknown kind ${ref.kind}`);
    const nsPath = info.namespaced && ref.namespace ? `/namespaces/${ref.namespace}` : "";
    const base = rg ? `/apis/${rg}/${rv}` : `/api/${rv}`;
    const mr = await k8s(`${base}${nsPath}/${info.plural}/${ref.name}`);
    return {
      name: mr.metadata.name, kind: mr.kind,
      provider: inferProvider(rg),
      ready: isReady(mr), synced: isSynced(mr), paused: isPaused(mr),
      externalName: mr.metadata?.annotations?.[EXTERNAL_NAME_ANNOTATION] || "",
      region: mr.spec?.forProvider?.region || "",
      labels: mr.metadata?.labels || {},
      annotations: mr.metadata?.annotations || {},
      conditions: (mr.status?.conditions || []).map(c => ({
        type: c.type, status: c.status, reason: c.reason || "", message: c.message || "",
      })),
      apiVersion: ref.apiVersion, _raw: mr,
    };
  }));

  return {
    name: xr.metadata.name, kind: xr.kind,
    ready: isReady(xr), synced: isSynced(xr), paused: isPaused(xr),
    children: children.map((r, i) =>
      r.status === "fulfilled" ? r.value : {
        name: refs[i].name, kind: refs[i].kind,
        provider: inferProvider(parseAV(refs[i].apiVersion).group),
        ready: false, synced: false, paused: false,
        externalName: "", region: "", apiVersion: refs[i].apiVersion,
        _error: r.reason?.message,
      }
    ),
    _raw: xr,
  };
}

export async function patchPause(apiVersion, plural, name, namespace, pause) {
  const action = pause ? "pause" : "resume";
  log.info("action", `${action.toUpperCase()} ${name} (${plural})`);
  const { group, version } = parseAV(apiVersion);
  const nsPath = namespace ? `/namespaces/${namespace}` : "";
  const base = group ? `/apis/${group}/${version}` : `/api/${version}`;
  const url = `${API_BASE_PATH}${base}${nsPath}/${plural}/${name}?fieldManager=${FIELD_MANAGER}`;
  const body = {
    metadata: {
      annotations: pause
        ? { [PAUSED_ANNOTATION]: "true" }
        : { [PAUSED_ANNOTATION]: null },
    },
  };
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/merge-patch+json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = `${res.status} ${await res.text().catch(() => "")}`;
    log.error("action", `Failed to ${action} ${name}`, errText);
    throw new Error(errText);
  }
  log.success("action", `${name} ${action}d successfully`);
  return res.json();
}

export async function applyResource(obj) {
  const name = obj.metadata?.name;
  log.info("action", `APPLY ${name || "unknown"} (${obj.kind})`);
  const { group, version } = parseAV(obj.apiVersion);
  const info = await resolveResourceInfo(group, version, obj.kind);
  if (!info) throw new Error(`Unknown resource kind: ${obj.kind}`);
  const ns = obj.metadata?.namespace;
  const nsPath = ns ? `/namespaces/${ns}` : "";
  const base = group ? `/apis/${group}/${version}` : `/api/${version}`;
  if (!name) throw new Error("Resource must have metadata.name");
  const url = `${API_BASE_PATH}${base}${nsPath}/${info.plural}/${name}?fieldManager=${FIELD_MANAGER}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/merge-patch+json" },
    body: JSON.stringify(obj),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error("action", `Failed to apply ${name}`, `${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  }
  log.success("action", `${name} applied successfully`);
  return res.json();
}
