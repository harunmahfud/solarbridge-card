export function numericState(hass, entityId) {
  const state = hass?.states?.[entityId]?.state;
  if (state == null || (typeof state === "string" && state.trim() === "")) return null;
  const value = Number(state);
  return Number.isFinite(value) ? value : null;
}

export function formatPower(value) {
  if (value == null) return "—";
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)} kW`;
  return `${Math.round(value)} W`;
}

export function flowDuration(value) {
  if (!value) return 0;
  return Math.max(0.45, Math.min(3, 1800 / Math.abs(value)));
}

export function sparklinePoints(values, width = 280, height = 42) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index * width / (values.length - 1);
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
