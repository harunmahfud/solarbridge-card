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

export function sparklinePaths(samples, width = 280, height = 42, startTime, endTime, range) {
  const points = samples
    .map(sample => ({ value: sample.value == null || String(sample.value).trim() === "" ? null : Number(sample.value), time: Number(sample.time) }))
    .filter(sample => Number.isFinite(sample.time))
    .sort((a, b) => a.time - b.time);
  const values = points.filter(point => point.value != null && Number.isFinite(point.value)).map(point => point.value);
  if (!values.length) return { line: "", area: "" };

  const minTime = Number.isFinite(startTime) ? startTime : points[0].time;
  const maxTime = Number.isFinite(endTime) ? endTime : points.at(-1).time;
  const timeSpan = maxTime - minTime || 1;
  const minValue = range?.[0] ?? Math.min(...values);
  const valueSpan = (range?.[1] ?? Math.max(...values)) - minValue;
  const padding = 2;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const coordinates = points.map(point => point.value == null || !Number.isFinite(point.value) ? null : ({
    x: padding + Math.max(0, Math.min(1, (point.time - minTime) / timeSpan)) * plotWidth,
    y: valueSpan ? padding + (1 - (point.value - minValue) / valueSpan) * plotHeight : height / 2,
  }));
  const format = value => value.toFixed(1);
  let line = "", area = "", segment = "", first = null, previous = null;
  const closeSegment = () => {
    if (previous) area += `${area ? " " : ""}${segment} L ${format(previous.x)} ${height} L ${format(first.x)} ${height} Z`;
    segment = "";
    previous = null;
  };
  for (let index = 0; index < coordinates.length; index += 1) {
    const point = coordinates[index];
    if (!point) { closeSegment(); continue; }
    let command;
    if (!previous) {
      first = point;
      command = `M ${format(point.x)} ${format(point.y)}`;
    } else {
      const control = (point.x - previous.x) * 0.4;
      command = ` C ${format(previous.x + control)} ${format(previous.y)} ${format(point.x - control)} ${format(point.y)} ${format(point.x)} ${format(point.y)}`;
    }
    line += `${!previous && line ? " " : ""}${command}`;
    segment += command;
    previous = point;
  }
  closeSegment();
  return { line, area };
}
