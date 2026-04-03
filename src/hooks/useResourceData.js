import { useState, useCallback, useEffect } from "react";
import { CLAIMS_REFRESH_INTERVAL_MS } from "../config";
import { log } from "../logger";
import { loadAllEntries } from "../api/resources";

export function useResourceData() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    if (!quiet) log.info("refresh", "Loading all resources...");
    try {
      const data = await loadAllEntries();
      log.info("refresh", `Loaded ${data.length} resources`);
      setEntries(prev => {
        if (!prev.length) return data;
        const prevMap = {};
        for (const c of prev) prevMap[c.id] = c;
        let changed = data.length !== prev.length;
        const merged = data.map(c => {
          const old = prevMap[c.id];
          if (!old) { changed = true; return c; }
          if (old.ready !== c.ready || old.synced !== c.synced || old.paused !== c.paused ||
              old.resourceCount !== c.resourceCount || old.age !== c.age) {
            changed = true; return c;
          }
          return old;
        });
        return changed ? merged : prev;
      });
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      log.error("refresh", "Failed to load resources", e.message);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    log.info("system", "XR Manager started \u2014 connecting to cluster");
    refresh();
    const interval = setInterval(() => refresh(true), CLAIMS_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { entries, loading, error, lastRefresh, refresh };
}
