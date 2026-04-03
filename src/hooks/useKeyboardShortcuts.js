import { useEffect } from "react";

export function useKeyboardShortcuts({ onEscape }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && onEscape) onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}
