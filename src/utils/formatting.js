const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export function computeAge(ts) {
  if (!ts) return "\u2014";
  const ms = Date.now() - new Date(ts).getTime();
  const d = Math.floor(ms / MS_PER_DAY);
  if (d > 0) return `${d}d`;
  const h = Math.floor(ms / MS_PER_HOUR);
  if (h > 0) return `${h}h`;
  return `${Math.floor(ms / MS_PER_MINUTE)}m`;
}

export function inferProvider(apiGroup) {
  if (!apiGroup) return "kubernetes";
  const g = apiGroup.toLowerCase();
  if (g.includes("aws") || g.includes("amazon")) return "aws";
  if (g.includes("azure")) return "azure";
  if (g.includes("gcp") || g.includes("google")) return "gcp";
  if (g.includes("kubernetes") || g === "") return "kubernetes";
  return g.split(".")[0];
}
