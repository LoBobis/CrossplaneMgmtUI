import { PAUSED_ANNOTATION } from "../config";

export function getCond(obj, type) {
  return (obj?.status?.conditions || obj?.conditions || []).find(c => c.type === type);
}

export function isReady(obj) {
  return getCond(obj, "Ready")?.status === "True";
}

export function isSynced(obj) {
  return getCond(obj, "Synced")?.status === "True";
}

export function isPaused(obj) {
  return obj?.metadata?.annotations?.[PAUSED_ANNOTATION] === "true";
}
