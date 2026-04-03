// ─── Application Configuration ─────────────────────────────────────────────
// All magic strings, intervals, and tunable constants live here.

export const API_BASE_PATH = "/api";
export const FIELD_MANAGER = "crossplane-xr-manager";

// Crossplane API paths
export const XRD_API_PATH = "/apis/apiextensions.crossplane.io/v1/compositeresourcedefinitions";
export const DEFAULT_VERSION_FALLBACK = "v1alpha1";

// Crossplane annotations
export const PAUSED_ANNOTATION = "crossplane.io/paused";
export const EXTERNAL_NAME_ANNOTATION = "crossplane.io/external-name";

// Refresh intervals (ms)
export const CLAIMS_REFRESH_INTERVAL_MS = 15_000;
export const TREE_REFRESH_INTERVAL_MS = 10_000;

// UI
export const EVENTS_REFRESH_INTERVAL_MS = 15_000;
export const TOAST_DURATION_MS = 3200;
export const LOG_MAX_ENTRIES = 500;
export const LEFT_PANEL_WIDTH = "42%";
export const HEADER_HEIGHT = 68;

// Resource entry source types
export const SOURCE_CLAIM = "claim";
export const SOURCE_XR = "xr";
