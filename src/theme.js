// ─── Rocky Theme ────────────────────────────────────────────────────────────
// Gritty Philadelphia boxing gym. Championship gold. Italian Stallion energy.

export const theme = {
  bg:            "#0a0806",
  bgCard:        "#140e08",
  bgPanel:       "#1a1209",
  bgInput:       "#110c06",
  border:        "#2a1f10",
  borderLit:     "#d4a017",
  gold:          "#d4a017",
  goldBright:    "#ffd700",
  red:           "#c41e3a",
  redDark:       "#3a0a12",
  green:         "#4ade80",
  greenDark:     "#0a2e16",
  amber:         "#e8a910",
  amberDark:     "#2a1d04",
  textPrimary:   "#f5e6c8",
  textSecondary: "#8a7a5a",
  textMuted:     "#5a4a30",
  accent:        "#c41e3a",
  accentAlt:     "#d4a017",
};

export const PROVIDER_COLORS = {
  aws: "#FF9900",
  kubernetes: "#326CE5",
  azure: "#0078D4",
  gcp: "#4285F4",
};

export const KIND_ICONS = {
  RDSInstance: "\u{1F94A}", DBSubnetGroup: "\u{1F517}", SecurityGroup: "\u{1F6E1}\uFE0F",
  DBParameterGroup: "\u2699\uFE0F", Secret: "\u{1F510}", IAMPolicy: "\u{1F4CB}", IAMRole: "\u{1F464}",
  ReplicationGroup: "\u267B\uFE0F", Bucket: "\u{1FAA3}", BucketPolicy: "\u{1F4DC}", VPC: "\u{1F310}",
  Subnet: "\u{1F50C}", InternetGateway: "\u{1F6AA}", RouteTable: "\u{1F5FA}\uFE0F", EIP: "\u{1F4CD}",
  NatGateway: "\u{1F504}", FlowLog: "\u{1F4CA}", Cluster: "\u2638\uFE0F", NodeGroup: "\u{1F4E6}",
  Addon: "\u{1F9E9}", OpenIDConnectProvider: "\u{1F511}",
};

export const FONT_FAMILY = "'Oswald', 'Impact', 'Arial Black', sans-serif";

export function globalStyles(R) {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: ${R.bg}; }
    ::-webkit-scrollbar-thumb { background: ${R.border}; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: ${R.gold}40; }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    input::placeholder { color: ${R.textMuted} !important; }
  `;
}
