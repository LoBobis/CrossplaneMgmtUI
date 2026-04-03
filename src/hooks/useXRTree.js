import { useState, useCallback, useEffect } from "react";
import { TREE_REFRESH_INTERVAL_MS } from "../config";
import { log } from "../logger";
import { loadXRTree } from "../api/resources";

export function useXRTree(selected, entries) {
  const [xrTree, setXrTree] = useState(null);
  const [loadingTree, setLoadingTree] = useState(false);

  const refreshTree = useCallback(async (entry, quiet = false) => {
    if (!entry?.xrRef && entry?.sourceType !== "xr") return;
    if (!quiet) { setLoadingTree(true); log.info("refresh", `Loading resource tree for ${entry.name}...`); }
    try {
      const tree = await loadXRTree(entry);
      setXrTree(tree);
      if (!quiet) log.info("refresh", `Resource tree loaded: ${tree?.children?.length || 0} managed resources`);
    } catch (e) {
      log.error("refresh", `Failed to load tree for ${entry.name}`, e.message);
    } finally {
      setLoadingTree(false);
    }
  }, []);

  useEffect(() => {
    setXrTree(null);
    if (!selected) return;
    const entry = entries.find(c => c.id === selected);
    if (!entry?.xrRef && entry?.sourceType !== "xr") return;

    let cancelled = false;
    refreshTree(entry);
    const interval = setInterval(() => {
      if (!cancelled) refreshTree(entry, true);
    }, TREE_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selected, entries, refreshTree]);

  return { xrTree, setXrTree, loadingTree, setLoadingTree };
}
