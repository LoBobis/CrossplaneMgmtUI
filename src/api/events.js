import { k8s } from "./client";
import { log } from "../logger";

/**
 * Fetch Kubernetes events for a specific resource.
 * Uses namespaced endpoint for namespaced resources, cluster-wide otherwise.
 */
export async function fetchEvents(name, kind, namespace) {
  const fieldSelector = encodeURIComponent(`involvedObject.name=${name},involvedObject.kind=${kind}`);
  const path = namespace
    ? `/v1/namespaces/${namespace}/events?fieldSelector=${fieldSelector}`
    : `/v1/events?fieldSelector=${fieldSelector}`;

  try {
    const data = await k8s(path);
    const events = (data.items || []).sort((a, b) => {
      const tsA = a.lastTimestamp || a.eventTime || "";
      const tsB = b.lastTimestamp || b.eventTime || "";
      return tsB.localeCompare(tsA); // most recent first
    });
    return events;
  } catch (e) {
    log.warn("api", `Failed to fetch events for ${kind}/${name}`, e.message);
    return [];
  }
}
