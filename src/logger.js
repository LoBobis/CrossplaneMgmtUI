import { useState, useEffect } from "react";
import { LOG_MAX_ENTRIES } from "./config";

export const logStore = [];
let logListeners = [];

export function addLog(level, category, message, detail) {
  const entry = {
    ts: new Date(),
    level,
    category,
    message,
    detail: detail || null,
  };
  logStore.unshift(entry);
  if (logStore.length > LOG_MAX_ENTRIES) logStore.length = LOG_MAX_ENTRIES;
  logListeners.forEach(fn => fn([...logStore]));
}

export function useLogs() {
  const [logs, setLogs] = useState(() => [...logStore]);
  useEffect(() => {
    logListeners.push(setLogs);
    return () => { logListeners = logListeners.filter(fn => fn !== setLogs); };
  }, []);
  return logs;
}

export const log = {
  info:    (cat, msg, detail) => addLog("info", cat, msg, detail),
  warn:    (cat, msg, detail) => addLog("warn", cat, msg, detail),
  error:   (cat, msg, detail) => addLog("error", cat, msg, detail),
  success: (cat, msg, detail) => addLog("success", cat, msg, detail),
};
