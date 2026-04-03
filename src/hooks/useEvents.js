import { useState, useEffect, useCallback } from "react";
import { EVENTS_REFRESH_INTERVAL_MS } from "../config";
import { fetchEvents } from "../api/events";

export function useEvents(name, kind, namespace) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (quiet = false) => {
    if (!name || !kind) return;
    if (!quiet) setLoading(true);
    try {
      const data = await fetchEvents(name, kind, namespace);
      setEvents(data);
    } catch {
      // fetchEvents already handles errors gracefully
    } finally {
      setLoading(false);
    }
  }, [name, kind, namespace]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(true), EVENTS_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { events, loading };
}
