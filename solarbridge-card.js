function numericState(hass, entityId) {
  const state = hass?.states?.[entityId]?.state;
  if (state == null || (typeof state === "string" && state.trim() === "")) return null;
  const value = Number(state);
  return Number.isFinite(value) ? value : null;
}
function formatPower(value) {
  if (value == null) return "—";
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)} kW` : `${Math.round(value)} W`;
}
function flowDuration(value) {
  return value ? Math.max(0.45, Math.min(3, 1800 / Math.abs(value))) : 0;
}
function sparklinePaths(samples, width = 280, height = 42, startTime, endTime) {
  const points = samples.map(sample => ({ value: sample.value == null || String(sample.value).trim() === "" ? null : Number(sample.value), time: Number(sample.time) }))
    .filter(sample => Number.isFinite(sample.time)).sort((a, b) => a.time - b.time);
  const values = points.filter(point => point.value != null && Number.isFinite(point.value)).map(point => point.value);
  if (!values.length) return { line: "", area: "" };
  const minTime = Number.isFinite(startTime) ? startTime : points[0].time;
  const maxTime = Number.isFinite(endTime) ? endTime : points.at(-1).time;
  const timeSpan = maxTime - minTime || 1;
  const minValue = Math.min(...values);
  const valueSpan = Math.max(...values) - minValue;
  const padding = 2, plotWidth = width - padding * 2, plotHeight = height - padding * 2;
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
  for (const point of coordinates) {
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

const CORE_ENTITY_FIELDS = [
  ["pv_power", "PV power"], ["inverter_power", "Inverter power"], ["battery_power", "Battery power"],
  ["battery_soc", "Battery SOC"], ["load_power", "Load power"], ["grid_power", "Grid power"],
  ["daily_solar", "Daily solar energy"], ["daily_load", "Daily load energy"],
  ["daily_grid_import", "Daily grid import"], ["daily_grid_export", "Daily grid export"],
];
const DETAIL_GROUPS = [
  ["Solar strings", [
    ["pv1_power", "PV1 power"], ["pv1_voltage", "PV1 voltage"], ["pv1_current", "PV1 current"],
    ["pv2_power", "PV2 power"], ["pv2_voltage", "PV2 voltage"], ["pv2_current", "PV2 current"],
  ], ["pv1_power", "pv2_power"]],
  ["Inverter", [
    ["inverter_voltage", "Inverter output voltage"], ["inverter_current", "Inverter current"],
    ["running_status", "Running status"], ["ac_temperature", "AC temperature"], ["dc_temperature", "DC temperature"],
  ], ["running_status", "ac_temperature"]],
  ["Battery", [
    ["battery_mode", "Battery operation mode"], ["battery_type", "Battery type"],
    ["battery_voltage", "Battery voltage"], ["battery_current", "Battery current"],
    ["battery_temperature", "Battery temperature"], ["daily_battery_charge", "Daily battery charge"],
    ["daily_battery_discharge", "Daily battery discharge"], ["total_battery_charge", "Total battery charge"],
    ["total_battery_discharge", "Total battery discharge"],
    ["battery_shutdown_voltage", "Shutdown voltage"], ["battery_restart_voltage", "Restart voltage"],
    ["battery_low_voltage", "Low battery voltage"], ["battery_shutdown_soc", "Shutdown SOC"],
    ["battery_restart_soc", "Restart SOC"], ["battery_low_soc", "Low battery SOC"],
  ], ["battery_mode", "battery_voltage"]],
  ["Battery management system", [
    ["bms_charging_voltage", "BMS charging voltage"], ["bms_discharge_voltage", "BMS discharge voltage"],
    ["bms_charge_current_limit", "BMS charge current limit"], ["bms_discharge_current_limit", "BMS discharge current limit"],
    ["bms_soc", "BMS SOC"], ["bms_voltage", "BMS voltage"], ["bms_current", "BMS current"],
    ["bms_temperature", "BMS temperature"],
  ], ["bms_soc", "bms_voltage"]],
  ["Grid and load", [
    ["grid_voltage", "Grid voltage"], ["grid_current", "Grid current"], ["grid_frequency", "Grid frequency"],
    ["grid_status", "Grid-connected status"], ["load_voltage", "Load voltage"], ["load_frequency", "Load frequency"],
    ["internal_ct_power", "Internal CT power"], ["external_ct_power", "External CT power"],
  ], ["grid_status", "grid_frequency"]],
  ["AUX", [["aux_power", "AUX port power"]]],
  ["Lifetime energy", [
    ["total_solar", "Total production"], ["total_load", "Total load consumption"],
    ["total_grid_import", "Total energy bought"], ["total_grid_export", "Total energy sold"],
  ], ["total_solar", "total_load"]],
  ...[1, 2, 3, 4, 5, 6].map(slot => [`Time of use ${slot}`, [
    [`tou_time_${slot}`, "Start time"], [`tou_power_${slot}`, "Power target"],
    [`tou_voltage_${slot}`, "Voltage target"], [`tou_soc_${slot}`, "SOC target"],
    [`tou_${slot}_grid_charge`, "Grid charging"], [`tou_${slot}_generator_charge`, "Generator charging"],
  ], [`tou_time_${slot}`, `tou_soc_${slot}`, `tou_voltage_${slot}`, `tou_power_${slot}`]]),
];
const DETAIL_FIELDS = DETAIL_GROUPS.flatMap(([, fields]) => fields);
const ENTITY_FIELDS = [...CORE_ENTITY_FIELDS, ...DETAIL_FIELDS];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[character]);

class SolarBridgeCard extends HTMLElement {
  setConfig(config) {
    this.config = { title: "Solar power flow", display_mode: "auto", flow_style: "hub", show_mode_toggle: false, ...config, view_mode: config.view_mode === "system" ? "system" : "overview" };
    this._runtimeMode = null;
    if (this.config.show_mode_toggle) {
      try {
        const saved = localStorage.getItem(this.modeStorageKey);
        if (["compact", "detailed"].includes(saved)) this._runtimeMode = saved;
      } catch { /* Storage can be disabled in embedded dashboards. */ }
    }
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._stateSignature = "";
    this.scheduleRender();
  }

  get modeStorageKey() {
    // Presentation settings never change the identity of this entity configuration.
    return `solarbridge-card:mode:${JSON.stringify(ENTITY_FIELDS.map(([key]) => this.config[key] || ""))}`;
  }

  get displayMode() {
    return this._runtimeMode || (["compact", "detailed"].includes(this.config.display_mode) ? this.config.display_mode : "auto");
  }

  get detailed() {
    return this.displayMode === "detailed" || (this.displayMode === "auto" && this.config.view_mode === "system");
  }

  set hass(hass) {
    this._hass = hass;
    if (typeof hass?.themes?.darkMode === "boolean") this.style.colorScheme = hass.themes.darkMode ? "dark" : "light";
    const signature = ENTITY_FIELDS.map(([key]) => {
      const entityId = this.config?.[key];
      const entity = hass?.states?.[entityId];
      return `${entityId || ""}:${entity?.state || ""}:${entity?.attributes?.unit_of_measurement || ""}:${entity?.attributes?.battery_mode || ""}`;
    }).join("|");
    if (signature !== this._stateSignature) {
      this._stateSignature = signature;
      this.scheduleRender();
    }
    this.loadHistory();
  }

  connectedCallback() {
    this._intersecting = true;
    this._resizeObserver?.observe(this);
    if (this._elements) this._resizeObserver?.observe(this._elements.trend);
    this._historyOutsideHandler = event => {
      if (!event.composedPath().includes(this._elements?.trend)) this.hideHistoryTooltip();
    };
    document.addEventListener("pointerdown", this._historyOutsideHandler);
    this._visibilityHandler = () => {
      this.scheduleRender();
      this.syncAnimationPlayback();
    };
    document.addEventListener("visibilitychange", this._visibilityHandler);
    if ("IntersectionObserver" in window) {
      this._observer = new IntersectionObserver(([entry]) => {
        this._intersecting = entry.isIntersecting;
        if (entry.isIntersecting) this.scheduleRender();
        this.syncAnimationPlayback();
      });
      this._observer.observe(this);
    }
    this.scheduleRender();
  }

  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this._visibilityHandler);
    document.removeEventListener("pointerdown", this._historyOutsideHandler);
    this.hideHistoryTooltip();
    this._observer?.disconnect();
    this._resizeObserver?.disconnect();
    if (this._renderFrame) cancelAnimationFrame(this._renderFrame);
    clearTimeout(this._renderTimer);
    this._renderFrame = null;
    this._renderTimer = null;
  }

  scheduleRender() {
    if (!this._hass || this._renderFrame || this._renderTimer) return;
    const render = () => {
      if (!this._renderFrame && !this._renderTimer) return;
      if (this._renderFrame) cancelAnimationFrame(this._renderFrame);
      clearTimeout(this._renderTimer);
      this._renderFrame = null;
      this._renderTimer = null;
      this.render();
    };
    this._renderFrame = requestAnimationFrame(render);
    this._renderTimer = setTimeout(render, 50);
  }

  getCardSize() { return 6; }
  static getConfigElement() { return document.createElement("solarbridge-card-editor"); }
  static getStubConfig() { return {}; }

  get batteryMode() {
    if (this.config.battery_mode) return this._hass?.states?.[this.config.battery_mode]?.state;
    return this._hass?.states?.[this.config.battery_voltage]?.attributes?.battery_mode
      ?? this._hass?.states?.[this.config.battery_soc]?.attributes?.battery_mode
      ?? "Capacity";
  }

  get batteryMetricKey() {
    if (this.batteryMode === "Voltage") return "battery_voltage";
    return this.batteryMode === "Capacity" ? "battery_soc" : null;
  }

  get historyMetricKey() {
    const metric = this.batteryMetricKey;
    if (!metric) return null;
    const fallback = metric === "battery_soc" ? "battery_voltage" : "battery_soc";
    return this.config[metric] ? metric : this.config[fallback] ? fallback : null;
  }

  async loadHistory() {
    if (!this._hass || !this.config) return;
    const entityId = this.config[this.historyMetricKey];
    if (entityId !== this._historyEntity) {
      this._historyEntity = entityId;
      this._batteryHistory = [];
      this._historyKey = "";
    }
    if (!entityId) return;
    const now = Date.now();
    const key = `${entityId}:${Math.floor(now / (60 * 60 * 1000))}`;
    if (key === this._historyKey) return;
    this._historyKey = key;
    try {
      const start = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const end = new Date(now).toISOString();
      const history = await this._hass.callApi("GET", `history/period/${start}?filter_entity_id=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(end)}&minimal_response`);
      if (this._historyKey !== key || this.config[this.historyMetricKey] !== entityId) return;
      this._batteryHistory = (history?.[0] || []).map(item => ({
        value: item.state == null || String(item.state).trim() === "" || !Number.isFinite(Number(item.state)) ? null : Number(item.state),
        time: new Date(item.last_changed || item.last_updated).getTime(),
      })).filter(item => Number.isFinite(item.time));
      this.scheduleRender();
    } catch (error) {
      console.debug("SolarBridge Card history unavailable", error);
    }
  }

  value(key) { return numericState(this._hass, this.config[key]); }
  energy(key) {
    const value = numericState(this._hass, this.config[key]);
    return value == null ? "—" : `${value.toFixed(1)} kWh`;
  }

  entityId(key, fallbackKey) {
    return this.config[key] || (fallbackKey ? this.config[fallbackKey] : undefined);
  }

  updateEntityItem(element, key, fallbackKey) {
    const entityId = this.entityId(key, fallbackKey);
    element.hidden = !entityId;
    element.tabIndex = entityId ? 0 : -1;
    if (entityId) element.setAttribute("role", "button");
    else element.removeAttribute("role");
  }

  updateValueTone(element, value) {
    element.dataset.valueTone = value == null ? "unavailable" : value > 0 ? "positive" : value < 0 ? "negative" : "idle";
  }

  render() {
    if (!this.shadowRoot || !this._hass) return;
    if (!this.shadowRoot.querySelector("ha-card")) this.shadowRoot.innerHTML = `<style>
      :host{--sb-surface:var(--ha-card-background,var(--card-background-color,#fff));--sb-text:var(--primary-text-color,#212121);--sb-muted:var(--secondary-text-color,#616161);--sb-border:var(--divider-color,color-mix(in srgb,var(--sb-text) 16%,transparent));--sb-accent:var(--primary-color,#1976d2);--sb-solar:var(--solarbridge-solar-color,light-dark(#916d00,#f2c230));--sb-home:var(--solarbridge-home-color,light-dark(#1f74c9,#4a9df0));--sb-grid:var(--solarbridge-grid-color,light-dark(#7a4fd0,#b18af2));--sb-battery:var(--solarbridge-battery-color,light-dark(#187c49,#3fbf7f));display:block;container-type:inline-size;color:var(--sb-text);font:14px/1.4 var(--paper-font-body1_-_font-family,system-ui)}
      *{box-sizing:border-box}[hidden]{display:none!important}ha-card{display:block;padding:16px;border-radius:var(--ha-card-border-radius,12px);background:var(--sb-surface);border:1px solid var(--sb-border)}
      .header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}h2{font-size:16px;line-height:1.4;margin:0;overflow-wrap:anywhere}.mode-toggle{display:flex;border:1px solid var(--sb-border);border-radius:8px;overflow:hidden;flex-shrink:0}.mode-toggle button{font:inherit;font-size:12px;min-height:36px;padding:4px 10px;border:0;color:var(--sb-muted);background:transparent;cursor:pointer}.mode-toggle button[aria-pressed=true]{background:var(--sb-border);color:var(--sb-text)}
      .entity-item{cursor:pointer}.entity-item:focus-visible,.trend:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--sb-accent);outline-offset:3px}
      .flow{position:relative;max-width:420px;aspect-ratio:360/320;margin:auto}.flow-connectors{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
      .pv,.pv-line{--node-color:var(--sb-solar)}.grid,.grid-line{--node-color:var(--sb-grid)}.load,.load-line{--node-color:var(--sb-home)}.battery,.battery-line{--node-color:var(--sb-battery)}.inverter{--node-color:var(--sb-muted)}
      .node{position:absolute;display:flex;flex-direction:column;justify-content:center;align-items:center;width:80px;height:80px;border:2px solid var(--node-color);border-radius:50%;background:var(--sb-surface);text-align:center;transform:translate(-50%,-50%)}
      .node b,.node strong{display:block;white-space:nowrap}.node b{font-size:12px;font-weight:400;color:var(--sb-muted)}.node strong{font-size:15px;font-weight:600;line-height:1.3}.icon{height:20px;color:var(--node-color);font-size:19px;line-height:1}.icon svg{width:19px;height:19px;stroke:currentColor;stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round}
      .node.pv{left:50%;top:15.625%}.node.grid{left:13.889%;top:46.875%}.node.inverter{left:50%;top:46.875%;width:86px;height:86px}.node.load{left:86.111%;top:46.875%}.node.battery{left:50%;top:78.125%;width:100px;height:88px;border-radius:16px}
      .battery strong{display:flex;flex-direction:column}.battery-soc{font-size:12px;color:var(--sb-muted)}.battery-soc>[aria-hidden]{display:none}.battery-mode{display:none}.flow-state{position:absolute;top:-24px;white-space:nowrap;font-size:12px;color:var(--node-color);font-weight:600}.battery .flow-state{top:100%;margin-top:4px}.battery .icon{display:none}
      [data-value-tone=unavailable],.node[data-unavailable=true] .flow-state{color:var(--sb-muted)}.node[data-unavailable=true]{border-color:var(--sb-muted)}
      .line{fill:none;stroke:var(--node-color);stroke-width:2.5;stroke-linecap:round}.line .track{opacity:.22}.line .pulse{visibility:hidden;stroke-dasharray:14 20;animation:flow 1s linear infinite}.line.active .pulse{visibility:visible}.line[hidden] .pulse{visibility:hidden}.line .arrow{display:none;fill:var(--node-color);stroke:none}.line.active .arrow{display:block}.line[data-unavailable=true]{stroke:var(--sb-muted)}
      @keyframes flow{to{stroke-dashoffset:-68}}@media(prefers-reduced-motion:reduce){.line .pulse{animation:none}}
      .line[hidden]{display:inline!important;visibility:hidden}.battery-mode{display:block;color:var(--sb-muted);font-size:10px}.inverter-reading{font-size:13px;color:var(--sb-muted);margin-top:12px}.inverter .flow-state{position:static;margin-top:2px;font-size:11px}.system-mode .inverter .icon{display:none}
      .lane-hub{display:none}.distribution{margin-top:14px}.bar-label{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--sb-muted)}.bar-label b{color:var(--sb-text)}.track-bar{display:flex;height:14px;background:var(--sb-border);border-radius:7px;overflow:hidden;margin:5px 0}.track-bar span{background:var(--node-color)}.legend{display:flex;gap:6px 14px;flex-wrap:wrap;color:var(--sb-muted);font-size:12px}.legend span:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--node-color);margin-right:5px}.battery-indicator{padding:8px 10px;margin-top:10px;border-radius:8px;background:color-mix(in srgb,var(--sb-battery) 12%,transparent);font-size:13px}
      [data-style=minimal] .flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;max-width:none;aspect-ratio:auto}[data-style=minimal] .flow-connectors,[data-style=minimal] .inverter{display:none}[data-style=minimal] .node{position:static;transform:none;width:auto;height:auto;min-width:0;border:1px solid var(--sb-border);border-left:4px solid var(--node-color);border-radius:10px;padding:10px;align-items:flex-start;text-align:left}[data-style=minimal] .pv{order:0}[data-style=minimal] .grid{order:1}[data-style=minimal] .load{order:2}[data-style=minimal] .battery{order:3}[data-style=minimal] .icon{display:none}[data-style=minimal] .node strong{font-size:22px}[data-style=minimal] .flow-state{position:static;font-size:12px;margin-top:3px}[data-style=minimal] .battery-soc{display:none}
      [data-style=horizontal] .flow{max-width:560px;aspect-ratio:360/320}[data-style=horizontal] .node,[data-style=horizontal] .lane-hub{width:28%;height:64px;border-radius:8px;left:14%;transform:translate(-50%,-50%);align-items:flex-start;padding:8px;text-align:left;border-width:1px}[data-style=horizontal] .pv{top:12.5%}[data-style=horizontal] .grid{top:37.5%}[data-style=horizontal] .battery{top:62.5%}[data-style=horizontal] .load{top:87.5%}[data-style=horizontal] .node .icon,[data-style=horizontal] .battery-soc,[data-style=horizontal] .inverter{display:none}[data-style=horizontal] .flow-state{top:50%;left:100%;transform:translateY(6px);width:157%;font-size:11px;text-align:center}[data-style=horizontal] .lane-hub{display:flex;position:absolute;flex-direction:column;justify-content:center;left:86%;border:1px solid var(--sb-border);font-size:12px;color:var(--sb-muted)}[data-style=horizontal] .lane-hub strong{font-size:15px;color:var(--sb-text)}
      .soc{margin-top:18px;display:grid;grid-template-columns:80px 1fr;gap:12px;align-items:end;--node-color:var(--sb-battery)}.gauge{height:8px;background:var(--sb-border);border-radius:8px;overflow:hidden}.gauge i{display:block;height:100%;width:var(--soc);background:var(--sb-battery)}.trendbox small{display:block;font-size:12px;color:var(--sb-muted);margin-bottom:6px}.trend{display:block;width:100%;height:42px;overflow:visible}.trend-line{fill:none;stroke:var(--sb-battery);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.trend-area{fill:color-mix(in srgb,var(--sb-battery) 9%,transparent)}.chart-axes{display:none;fill:var(--sb-muted);font:11px system-ui}.chart-axes line{stroke:var(--sb-border);stroke-width:.5}.chart-axes .threshold{stroke:var(--sb-muted);stroke-dasharray:3 3}.chart-empty{font-size:12px;fill:var(--sb-muted)}.system-mode .soc{display:block}.system-mode .soc>div:first-child{display:none}.system-mode .trend{height:auto;aspect-ratio:600/210}.system-mode .chart-axes{display:block}
      .trendbox{position:relative}.trend{touch-action:pan-y;cursor:crosshair;outline:none}.chart-point{fill:var(--sb-battery);stroke:var(--sb-surface);stroke-width:2;pointer-events:none}.chart-tooltip{position:absolute;z-index:1;display:grid;gap:1px;max-width:100%;padding:5px 8px;border:1px solid var(--sb-border);border-radius:6px;background:var(--sb-surface);color:var(--sb-text);box-shadow:0 2px 8px #0003;font-size:12px;line-height:1.25;pointer-events:none}.chart-tooltip span{font-size:11px;color:var(--sb-muted)}
      .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:18px}.summary div{min-width:0;padding:9px;border:1px solid var(--sb-border);border-radius:8px}.summary small,.summary b{display:block}.summary small{color:var(--sb-muted);font-size:12px}.summary b{font-size:17px;font-weight:600;margin-top:2px;white-space:nowrap}
      .details{margin-top:18px}.details-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.details h3{margin:0;font-size:13px;font-weight:600}.details-toolbar h3{color:var(--sb-muted)}.details-actions{display:flex;gap:6px}.details-actions button{font:inherit;font-size:12px;color:var(--sb-text);background:transparent;border:1px solid var(--sb-border);border-radius:6px;min-height:36px;padding:4px 10px;cursor:pointer}.detail-groups{columns:2;column-gap:8px}.metric-group{break-inside:avoid;min-width:0;padding:8px 10px;border:1px solid var(--sb-border);border-radius:8px;margin-bottom:8px}.metric-group summary{cursor:pointer;font-size:13px;font-weight:600;min-height:28px;align-content:center;overflow-wrap:anywhere}.detail-brief{display:block;font-size:12px;font-weight:400;color:var(--sb-muted);margin-top:3px}.metric-group[open] .detail-brief{display:none}.metric-group dl{margin:8px 0 2px}.metric-row{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:13px}.metric-row dt{min-width:0;color:var(--sb-muted)}.metric-row dd{margin:0;text-align:right;overflow-wrap:anywhere;max-width:60%}.metric-row.unavailable dd{color:var(--sb-muted)}
      .detail-tiles,.detail-panel-title,.detail-hint{display:none}.detail-tile{font:inherit;color:var(--sb-text);background:transparent;border:1px solid var(--sb-border);border-radius:8px;padding:10px;text-align:left;cursor:pointer;min-width:0;overflow-wrap:anywhere}.detail-tile[aria-expanded=true]{border-color:var(--sb-accent);box-shadow:inset 0 0 0 1px var(--sb-accent)}.tile-name{display:block;font-size:12px;font-weight:600;margin-bottom:6px}.tile-value{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px;font-size:12px;margin-top:3px}.tile-value small{color:var(--sb-muted);font-size:11px}.tile-value b{font-weight:500}.tile-value:nth-child(2) b{font-size:16px;font-weight:600}.tile-count{display:block;color:var(--sb-muted);font-size:11px;margin-top:8px}
      @container(max-width:480px){.details-actions{display:none}.detail-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.detail-groups{columns:auto}.details .detail-panel-title{display:block;margin:12px 0 0;padding:10px 12px;border:1px solid var(--sb-accent);border-bottom:0;border-radius:8px 8px 0 0}.metric-group{display:none;margin:0;border-color:var(--sb-accent);border-top:0;border-radius:0 0 8px 8px;padding:0 12px 10px}.metric-group.selected{display:block}.metric-group summary{display:none}.metric-group dl{margin:0}.detail-hint{display:block;color:var(--sb-muted);font-size:12px;margin:10px 0 0}}
      @container(max-width:480px){ha-card{padding:12px}.summary,[data-style=minimal] .flow{grid-template-columns:repeat(2,minmax(0,1fr))}.header{flex-wrap:wrap}.flow{max-width:360px}[data-style=hub] .flow{aspect-ratio:360/350}[data-style=hub] .node{width:72px;height:72px}[data-style=hub] .node.inverter{width:78px;height:78px}[data-style=hub] .node.battery{width:92px;height:80px}.inverter .icon,.inverter .icon svg{height:16px;width:16px}.inverter .flow-state{font-size:10px}.metric-row{padding:5px 0}.summary b{font-size:17px}}
      @container(max-width:320px){[data-style=hub] .flow{aspect-ratio:360/400}.node strong{font-size:13px}[data-style=hub] .node.battery{width:88px;height:80px}.flow-state{font-size:11px}[data-style=horizontal] .node,[data-style=horizontal] .lane-hub{padding:5px}[data-style=horizontal] .flow-state{font-size:10px}.summary b{font-size:15px}}
    </style><ha-card>
      <div class="header"><h2></h2><div class="mode-toggle" role="group" aria-label="Display mode" hidden><button type="button" data-mode="compact">Compact</button><button type="button" data-mode="detailed">Detailed</button></div></div><div class="flow">
        <svg class="flow-connectors" viewBox="0 0 360 320" preserveAspectRatio="none" aria-label="Power flow">${["pv", "grid", "battery", "load"].map(name => `<g class="line ${name}-line" role="img"><path class="track"/><path class="pulse"/><path class="arrow" d="M-4 -4 L3 0 L-4 4 Z"/></g>`).join("")}</svg>
        <div class="node pv entity-item" data-key="pv_power" aria-label="Solar"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></svg></span><b>Solar</b><strong></strong><small class="flow-state"></small></div>
        <div class="node inverter entity-item" data-key="inverter_power" aria-label="Inverter"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m13 6-5 7h7l-4 5"/></svg></span><b>Inverter</b><strong></strong><small class="flow-state"></small></div>
        <div class="node grid entity-item" data-key="grid_power" aria-label="Grid"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 2-7 20m7-20 7 20M8 6h8M6 12h12M4 18h16M8 12l8 6m0-6-8 6"/></svg></span><b>Grid</b><strong></strong><small class="flow-state"></small></div>
        <div class="node battery entity-item" data-key="battery_power" data-fallback-key="battery_soc" aria-label="Battery"><b>Battery</b><small class="battery-mode" hidden></small><strong><span class="battery-soc"><span class="battery-soc-value"></span></span><span class="battery-power"></span></strong><small class="flow-state"></small></div>
        <div class="node load entity-item" data-key="load_power" aria-label="Home"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m2 11 10-9 10 9M5 9v12h14V9M10 21v-7h4v7"/></svg></span><b>Home</b><strong></strong><small class="flow-state"></small></div>
        ${[12.5, 37.5, 62.5, 87.5].map(top => `<div class="lane-hub" style="top:${top}%">Inverter</div>`).join("")}
      </div>
      <div class="inverter-reading entity-item" data-key="inverter_power" hidden></div>
      <div class="distribution" hidden><div class="bar-label"><span>Incoming power</span><b></b></div><div class="track-bar" role="img" aria-label="Incoming power by source">${["pv", "grid", "battery"].map(name => `<span class="${name}"></span>`).join("")}</div><div class="legend">${["pv", "grid", "battery"].map(name => `<span class="${name}"></span>`).join("")}</div></div>
      <div class="battery-indicator" hidden></div>
      <div class="summary">${[["daily_solar","Solar"],["daily_load","Load"],["daily_grid_import","Imported"],["daily_grid_export","Exported"]].map(([key,label]) => `<div class="entity-item" data-key="${key}"><small>${label} today</small><b></b></div>`).join("")}</div>
      <div class="soc entity-item" data-key="battery_soc"><div><b></b><div class="gauge"><i></i></div></div><div class="trendbox"><small>Battery SOC · 24h</small><svg class="trend" viewBox="0 0 280 42" tabindex="0" role="img" aria-describedby="history-tooltip" aria-label="24 hour battery SOC trend"><g class="chart-axes"></g><path class="trend-area"/><path class="trend-line"/><text class="chart-empty" x="50%" y="50%" text-anchor="middle" hidden>No history available</text><circle class="chart-point" r="4" hidden aria-hidden="true"/></svg><div class="chart-tooltip" id="history-tooltip" role="tooltip" aria-live="polite" hidden><b></b><span></span></div></div></div>
      <section class="details" aria-label="System details" hidden>
        <div class="details-toolbar"><h3>Technical details</h3><div class="details-actions"><button type="button" data-expand="true">Expand all</button><button type="button" data-expand="false">Collapse all</button></div></div>
        <div class="detail-tiles">${DETAIL_GROUPS.map(([group]) => `<button type="button" class="detail-tile" data-group="${escapeHtml(group)}" aria-expanded="false" aria-controls="technical-readings" hidden><span class="tile-name">${escapeHtml(group)}</span><span class="tile-value"><small></small><b></b></span><span class="tile-value"><small></small><b></b></span><span class="tile-count"></span></button>`).join("")}</div>
        <div class="detail-groups" id="technical-readings" role="region" aria-label="Technical readings"><h3 class="detail-panel-title" hidden></h3>${DETAIL_GROUPS.map(([group, fields]) => `<details class="metric-group" data-group="${escapeHtml(group)}" open><summary>${escapeHtml(group)}<small class="detail-brief"></small></summary><dl>${fields.map(([key,label]) => `<div class="metric-row entity-item" data-key="${key}" hidden><dt>${label}</dt><dd></dd></div>`).join("")}</dl></details>`).join("")}</div>
        <p class="detail-hint">Choose a group to see all its readings.</p>
      </section>
    </ha-card>`;
    if (!this._elements) this.cacheElements();

    const pv = this.value("pv_power");
    const inverter = this.value("inverter_power");
    const battery = this.value("battery_power");
    const mode = this.batteryMode;
    const metricKey = this.batteryMetricKey;
    const soc = metricKey ? this.value(metricKey) : null;
    const historyMetric = this.historyMetricKey;
    const historyVoltage = historyMetric === "battery_voltage";
    const historyValue = historyMetric ? this.value(historyMetric) : null;
    const batteryValue = mode === "Voltage" ? `${soc == null ? "—" : soc.toFixed(2)} V` : `${soc ?? "—"}%`;
    const load = this.value("load_power");
    const grid = this.value("grid_power");
    const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };
    const systemMode = this.detailed;
    const style = ["minimal", "horizontal"].includes(this.config.flow_style) ? this.config.flow_style : "hub";
    this._elements.card.dataset.style = style;
    this._elements.card.classList.toggle("system-mode", systemMode);
    this._elements.card.classList.toggle("voltage-mode", mode === "Voltage");
    this._elements.details.hidden = !systemMode;
    this._elements.toggle.hidden = !this.config.show_mode_toggle;
    for (const button of this._elements.toggle.querySelectorAll("button")) button.setAttribute("aria-pressed", String((button.dataset.mode === "detailed") === systemMode));
    text(this._elements.title, this.config.title);
    const magnitude = value => formatPower(value == null ? null : Math.abs(value));
    text(this._elements.pv, magnitude(pv));
    text(this._elements.inverter, formatPower(inverter));
    this._elements.inverter.hidden = !systemMode || !this.config.inverter_power;
    this._elements.flowStates.inverter.hidden = !systemMode || !this.config.inverter_power;
    text(this._elements.grid, magnitude(grid));
    text(this._elements.batterySoc, batteryValue);
    text(this._elements.batteryMode, mode === "Voltage" ? "Voltage mode" : mode === "Capacity" ? "" : mode === "No battery" ? "No battery" : "Mode unavailable");
    this._elements.batteryMode.hidden = mode === "Capacity";
    text(this._elements.batteryPower, magnitude(battery));
    text(this._elements.load, magnitude(load));
    for (const [key, value] of Object.entries({ pv, inverter, grid, batteryPower: battery, batterySoc: soc, soc: historyValue, load })) {
      this.updateValueTone(this._elements.values[key], value);
    }
    this._elements.batterySocGroup.hidden = !this.config[metricKey];
    this._elements.batteryPower.hidden = !this.config.battery_power;
    text(this._elements.flowStates.pv, this.flowState(pv, "Generating", "Reverse flow"));
    text(this._elements.flowStates.inverter, this.flowState(inverter, "Supplying", "Absorbing", "Standby"));
    text(this._elements.flowStates.grid, this.flowState(grid, "Importing", "Exporting"));
    text(this._elements.flowStates.battery, this.flowState(battery, "Discharging", "Charging"));
    text(this._elements.flowStates.load, this.flowState(load, "Consuming", "Reverse flow"));
    for (const [name, value] of Object.entries({ pv, grid, battery, load })) {
      const node = this.shadowRoot.querySelector(`.node.${name}`);
      node.dataset.unavailable = String(value == null);
      node.setAttribute("aria-label", `${node.querySelector("b").textContent}: ${magnitude(value)}, ${this._elements.flowStates[name].textContent}${name === "battery" && this.config[metricKey] ? `, ${batteryValue}` : ""}`);
    }
    this.shadowRoot.querySelector(".inverter").setAttribute("aria-label", systemMode && this.config.inverter_power ? `Inverter: ${formatPower(inverter)}, ${this._elements.flowStates.inverter.textContent}` : "Inverter");
    const sources = [["pv", "pv_power", "Solar", pv], ["grid", "grid_power", "Grid import", grid], ["battery", "battery_power", "Battery discharge", mode === "No battery" ? 0 : battery]];
    this._elements.distribution.hidden = style !== "minimal" || !sources.some(([name, key]) => this.config[key] && !(name === "battery" && mode === "No battery"));
    const total = sources.reduce((sum, [, , , value]) => sum + Math.max(value ?? 0, 0), 0);
    const complete = sources.every(([, key, , value]) => value != null || !this.config[key]);
    text(this._elements.distribution.querySelector(".bar-label b"), `${magnitude(total)}${complete ? "" : " known"}`);
    for (const [name, key, label, value] of sources) {
      const configured = !!this.config[key] && !(name === "battery" && mode === "No battery");
      const segment = this._elements.distribution.querySelector(`.track-bar .${name}`);
      segment.style.width = `${total ? Math.max(value ?? 0, 0) / total * 100 : 0}%`;
      const legend = this._elements.distribution.querySelector(`.legend .${name}`);
      legend.hidden = !configured;
      text(legend, `${label} ${value == null ? "unavailable" : magnitude(Math.max(value, 0))}`);
    }
    this._elements.distribution.querySelector(".track-bar").setAttribute("aria-label", this._elements.distribution.querySelector(".legend").textContent);
    this._elements.batteryIndicator.hidden = !["minimal", "horizontal"].includes(style) || mode === "No battery" || !(this.config.battery_power || this.config[metricKey]);
    text(this._elements.batteryIndicator, `Battery ${this.flowState(battery, "discharging", "charging", "idle").toLowerCase()}${battery != null && Math.abs(battery) >= 1 ? ` at ${magnitude(battery)}` : ""}${this.config[metricKey] ? ` · ${batteryValue}` : ""}${mode !== "Capacity" ? ` · ${this._elements.batteryMode.textContent}` : ""}`);
    text(this._elements.soc, historyVoltage ? `${historyValue == null ? "—" : historyValue.toFixed(2)} V` : `${historyValue ?? "—"}%`);
    this._elements.gauge.hidden = !historyMetric || historyVoltage;
    text(this._elements.trendLabel, historyVoltage ? "Battery voltage · 24h" : "Battery SOC · 24h");
    this._elements.trend.setAttribute("aria-label", historyVoltage ? "24 hour battery voltage trend" : "24 hour battery SOC trend");
    this._elements.gauge.style.setProperty("--soc", `${Math.max(0, Math.min(100, historyValue ?? 0))}%`);
    this.loadHistory();
    for (const [key] of CORE_ENTITY_FIELDS.slice(6)) text(this._elements.energy[key], this.energy(key));
    this._elements.batteryNode.dataset.fallbackKey = metricKey || "";
    this._elements.batteryMetric.dataset.key = historyMetric || "";
    for (const item of this._elements.entityItems) this.updateEntityItem(item, item.dataset.key, item.dataset.fallbackKey);
    if (mode === "No battery") this._elements.batteryNode.hidden = true;
    this._elements.batteryMetric.hidden ||= this.displayMode === "compact";
    // The hub is a topology anchor, not an inferred inverter measurement.
    if (style === "hub" && this.displayMode !== "auto") this.shadowRoot.querySelector(".inverter").hidden = false;
    const inverterReading = this.shadowRoot.querySelector(".inverter-reading");
    inverterReading.hidden = !systemMode || style === "hub" || !this.config.inverter_power;
    text(inverterReading, `Inverter power: ${formatPower(inverter)} · ${this._elements.flowStates.inverter.textContent}`);
    for (const lane of this.shadowRoot.querySelectorAll(".lane-hub")) lane.textContent = "Inverter";
    this._elements.summary.hidden = !CORE_ENTITY_FIELDS.slice(6).some(([key]) => this.config[key]);
    const missingHub = this.displayMode === "auto" && !this.entityId("inverter_power");
    this._elements.lines[0].hidden = !this.entityId("pv_power") || missingHub;
    this._elements.lines[1].hidden = !this.entityId("grid_power") || missingHub;
    this._elements.lines[2].hidden = mode === "No battery" || !this.entityId("battery_power") || missingHub;
    this._elements.lines[3].hidden = !this.entityId("load_power") || missingHub;
    this.updateFlow(this._elements.lines[0], "PV to inverter", pv);
    this.updateFlow(this._elements.lines[1], "Grid flow", grid, true);
    this.updateFlow(this._elements.lines[2], "Battery flow", battery);
    this.updateFlow(this._elements.lines[3], "Load flow", load);
    this.updateDetails(text);
    this.updateHistoryChart(historyValue);
    this._renderedWidth = this.clientWidth;
    this.syncAnimationPlayback();
  }

  updateHistoryChart(current) {
    const now = Date.now(), start = now - 24 * 3600000;
    const samples = [...(this._batteryHistory || []), { value: current, time: now }].sort((a, b) => a.time - b.time);
    const detailed = this.detailed;
    // Measure after visibility/layout changes. A fixed 280×42 viewBox makes
    // SVG's default aspect-ratio scaling letterbox (or shrink) the Auto trace.
    const width = this._elements.trend.getBoundingClientRect().width;
    if (!width) {
      this._historyChart = null;
      this.hideHistoryTooltip();
      return;
    }
    const height = detailed ? (this.clientWidth <= 480 ? 200 : 210) : 42;
    const left = detailed ? 48 : 0, top = detailed ? 12 : 0;
    const plotWidth = width - left - (detailed ? 12 : 0), plotHeight = height - top - (detailed ? 44 : 0);
    const trend = sparklinePaths(samples, plotWidth, plotHeight, start, now);
    this._elements.trend.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this._elements.trend.style.aspectRatio = `${width}/${height}`;
    for (const path of [this._elements.trendLine, this._elements.trendArea]) path.setAttribute("transform", `translate(${left} ${top})`);
    this._elements.trendLine.setAttribute("d", trend.line);
    this._elements.trendArea.setAttribute("d", trend.area);
    this.shadowRoot.querySelector(".chart-empty").toggleAttribute("hidden", samples.some(sample => sample.value != null && Number.isFinite(sample.value) && sample.time < now));
    const values = samples.filter(sample => sample.value != null && Number.isFinite(sample.value)).map(sample => sample.value);
    const min = Math.min(...values), max = Math.max(...values);
    const unit = this.historyMetricKey === "battery_voltage" ? "V" : "%";
    const axes = this.shadowRoot.querySelector(".chart-axes");
    const time = timestamp => new Date(timestamp).toLocaleTimeString(this._hass.locale?.language, { hour: "2-digit", minute: "2-digit" });
    const date = timestamp => new Date(timestamp).toLocaleDateString(this._hass.locale?.language, { month: "short", day: "numeric" });
    const ticks = this.clientWidth <= 480 ? [0, .5, 1] : [0, .25, .5, .75, 1];
    axes.innerHTML = detailed ? [0, .5, 1].map(fraction => {
      const y = top + 2 + (1 - fraction) * (plotHeight - 4);
      const value = min + (max - min) * fraction;
      return `<line x1="${left}" x2="${width - 12}" y1="${y}" y2="${y}"/><text x="${left - 7}" y="${y + 4}" text-anchor="end">${Number.isFinite(value) ? value.toFixed(1) : "—"} ${unit}</text>`;
    }).join("") + ticks.map(fraction => {
      const x = left + 2 + fraction * (plotWidth - 4), timestamp = start + fraction * (now - start);
      return `<text x="${x}" y="${height - 22}" text-anchor="${fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}">${escapeHtml(time(timestamp))}${fraction === 0 || fraction === 1 ? `<tspan x="${x}" dy="14">${escapeHtml(date(timestamp))}</tspan>` : ""}</text>`;
    }).join("") : "";
    const entityId = this.config[this.historyMetricKey];
    const selected = this._historyChart?.entityId === entityId && samples.find(sample => sample.time === this._historySelection?.time && sample.value != null);
    this._historyChart = { entityId, samples, start, now, width, left, top, plotWidth, plotHeight, min, max, unit };
    if (selected) this.showHistorySample(selected);
    else this.hideHistoryTooltip();
  }

  hideHistoryTooltip() {
    this._historySelection = null;
    if (!this._elements) return;
    this._elements.chartPoint.toggleAttribute("hidden", true);
    this._elements.chartTooltip.hidden = true;
  }

  inspectHistory(event) {
    const chart = this._historyChart;
    if (!chart) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(this._elements.trend.getScreenCTM().inverse());
    const fraction = (point.x - chart.left - 2) / (chart.plotWidth - 4);
    if (fraction < 0 || fraction > 1 || point.y < chart.top || point.y > chart.top + chart.plotHeight) return this.hideHistoryTooltip();
    const timestamp = chart.start + fraction * (chart.now - chart.start);
    const index = chart.samples.findIndex(sample => sample.time >= timestamp);
    const next = chart.samples[index];
    const previous = next?.time === timestamp ? next : chart.samples[index - 1];
    // Only inspect a drawn segment, never snap across unavailable history.
    if (previous?.value == null || next?.value == null) return this.hideHistoryTooltip();
    this.showHistorySample(timestamp - previous.time < next.time - timestamp ? previous : next);
  }

  showHistorySample(sample) {
    const chart = this._historyChart;
    const x = chart.left + 2 + Math.max(0, Math.min(1, (sample.time - chart.start) / (chart.now - chart.start))) * (chart.plotWidth - 4);
    const y = chart.top + (chart.max === chart.min ? chart.plotHeight / 2 : 2 + (1 - (sample.value - chart.min) / (chart.max - chart.min)) * (chart.plotHeight - 4));
    this._historySelection = sample;
    const { chartPoint, chartTooltip, trend, trendBox } = this._elements;
    // Paths round their coordinates to tenths of a pixel too.
    chartPoint.setAttribute("cx", x.toFixed(1));
    chartPoint.setAttribute("cy", y.toFixed(1));
    chartPoint.toggleAttribute("hidden", false);
    chartTooltip.querySelector("b").textContent = `${sample.value.toFixed(2)} ${chart.unit}`;
    chartTooltip.querySelector("span").textContent = new Date(sample.time).toLocaleString(this._hass.locale?.language, { ...(this.detailed ? { month: "short", day: "numeric" } : {}), hour: "2-digit", minute: "2-digit" });
    chartTooltip.hidden = false;
    const matrix = trend.getScreenCTM();
    const screen = new DOMPoint(x, y).matrixTransform(matrix);
    const plotTop = new DOMPoint(0, chart.top).matrixTransform(matrix).y;
    const plotBottom = new DOMPoint(0, chart.top + chart.plotHeight).matrixTransform(matrix).y;
    const box = trendBox.getBoundingClientRect();
    const beside = screen.x - box.left + 10;
    const labelX = beside + chartTooltip.offsetWidth <= box.width ? beside : screen.x - box.left - chartTooltip.offsetWidth - 10;
    chartTooltip.style.left = `${Math.max(0, Math.min(box.width - chartTooltip.offsetWidth, labelX))}px`;
    chartTooltip.style.top = `${Math.max(plotTop - box.top, Math.min(plotBottom - box.top - chartTooltip.offsetHeight, screen.y - box.top - chartTooltip.offsetHeight / 2))}px`;
  }

  flowState(value, positive, negative, idle = "Idle") {
    if (value == null) return "Unavailable";
    if (Math.abs(value) < 1) return idle;
    return value > 0 ? positive : negative;
  }

  updateDetails(text) {
    const mode = this.batteryMode;
    const thresholdUnit = mode === "Voltage" ? "voltage" : mode === "Capacity" ? "soc" : null;
    const narrow = this.clientWidth <= 480;
    for (const group of this._elements.detailGroups) {
      let visible = 0;
      for (const { key, label, row, output } of group.rows) {
        const entityId = this.config[key];
        const threshold = key.match(/^battery_(shutdown|restart|low)_(voltage|soc)$/);
        const touTarget = key.match(/^tou_(voltage|soc)_\d+$/);
        const inactive = (group.name === "Battery management system" && (mode !== "Capacity" || this.displayMode !== "auto"))
          || (threshold && threshold[2] !== thresholdUnit)
          || (touTarget && touTarget[1] !== thresholdUnit);
        row.hidden = !entityId || inactive;
        if (row.hidden) continue;
        visible += 1;
        const state = this._hass?.states?.[entityId];
        const unavailable = !state || state.state === "unknown" || state.state === "unavailable"
          || (typeof state.state === "string" && state.state.trim() === "");
        const unit = state?.attributes?.unit_of_measurement;
        const value = unavailable ? "—" : `${state.state}${unit ? ` ${unit}` : ""}`;
        row.classList.toggle("unavailable", unavailable);
        text(output, value);
        output.setAttribute("aria-label", unavailable ? `${label}: Unavailable` : `${label}: ${value}`);
      }
      group.element.hidden = visible === 0;
      group.tile.hidden = visible === 0;
      const available = group.rows.filter(({ row }) => !row.hidden);
      const preferred = group.priority.flatMap(key => available.filter(row => row.key === key));
      const featured = [...new Set([...preferred, ...available])].slice(0, 2);
      text(group.element.querySelector(".detail-brief"), featured.map(({ label, output }) => `${label}: ${output.textContent}`).join(" · "));
      for (const [index, element] of [...group.tile.querySelectorAll(".tile-value")].entries()) {
        const reading = featured[index];
        element.hidden = !reading;
        if (!reading) continue;
        text(element.querySelector("small"), reading.label);
        text(element.querySelector("b"), reading.output.textContent);
      }
      text(group.tile.querySelector(".tile-count"), `${visible} ${visible === 1 ? "reading" : "readings"}`);
      const selected = visible > 0 && group.name === this._detailState.selected;
      group.tile.setAttribute("aria-expanded", String(narrow && selected));
      group.element.classList.toggle("selected", selected);
      group.element.open = narrow ? selected : (this._detailState.open[group.name] ?? true);
    }
    const selected = this._elements.detailGroups.find(group => !group.element.hidden && group.name === this._detailState.selected);
    const title = this.shadowRoot.querySelector(".detail-panel-title");
    title.parentElement.setAttribute("aria-label", narrow && selected ? selected.name : "Technical readings");
    text(title, selected?.name || "");
    title.hidden = !selected;
    this.shadowRoot.querySelector(".detail-hint").hidden = !!selected;
    this._elements.details.hidden = !this.detailed || !this._elements.detailGroups.some(group => !group.element.hidden);
  }

  saveDetailState() {
    try { localStorage.setItem("solarbridge-card:technical-details", JSON.stringify(this._detailState)); }
    catch { /* Preferences still work in memory when storage is unavailable. */ }
  }

  cacheElements() {
    const select = selector => this.shadowRoot.querySelector(selector);
    this._detailState = { open: {}, selected: null };
    try {
      const saved = JSON.parse(localStorage.getItem("solarbridge-card:technical-details"));
      for (const [name] of DETAIL_GROUPS) {
        if (typeof saved?.open?.[name] === "boolean") this._detailState.open[name] = saved.open[name];
        if (saved?.selected === name) this._detailState.selected = name;
      }
    } catch { /* Ignore missing, corrupt or blocked browser storage. */ }
    this._elements = {
      card: select("ha-card"), details: select(".details"), summary: select(".summary"), title: select("h2"),
      toggle: select(".mode-toggle"), distribution: select(".distribution"), batteryIndicator: select(".battery-indicator"),
      pv: select(".pv strong"), inverter: select(".inverter strong"),
      grid: select(".grid strong"), batterySoc: select(".battery-soc-value"),
      batteryNode: select(".battery"), batteryMode: select(".battery-mode"), batteryMetric: select(".soc"),
      batterySocGroup: select(".battery-soc"), batteryPower: select(".battery-power"),
      load: select(".load strong"), soc: select(".soc>div>b"),
      gauge: select(".gauge"), trend: select(".trend"), trendLabel: select(".trendbox small"),
      trendBox: select(".trendbox"), chartPoint: select(".chart-point"), chartTooltip: select(".chart-tooltip"),
      trendLine: select(".trend-line"), trendArea: select(".trend-area"),
      lines: [...this.shadowRoot.querySelectorAll(".line")],
      flowStates: Object.fromEntries(["pv", "inverter", "grid", "battery", "load"].map(key => [key, select(`.${key} .flow-state`)])),
      energy: Object.fromEntries(CORE_ENTITY_FIELDS.slice(6).map(([key]) => [key, select(`.summary [data-key="${key}"] b`)])),
      entityItems: [...this.shadowRoot.querySelectorAll(".entity-item")],
      detailGroups: DETAIL_GROUPS.map(([group, fields, priority = []]) => ({
        name: group,
        priority,
        element: select(`.metric-group[data-group="${group}"]`),
        tile: select(`.detail-tile[data-group="${group}"]`),
        rows: fields.map(([key, label]) => {
          const row = select(`.metric-row[data-key="${key}"]`);
          return { key, label, row, output: row.querySelector("dd") };
        }),
      })),
    };
    for (const group of this._elements.detailGroups) {
      group.element.querySelector("summary").addEventListener("click", event => {
        event.preventDefault();
        this._detailState.open[group.name] = !group.element.open;
        group.element.open = this._detailState.open[group.name];
        this.saveDetailState();
      });
      group.tile.addEventListener("click", () => {
        this._detailState.selected = this._detailState.selected === group.name ? null : group.name;
        this.saveDetailState();
        this.scheduleRender();
      });
    }
    select(".details-actions").addEventListener("click", event => {
      const action = event.target.closest("button")?.dataset.expand;
      if (!action) return;
      for (const group of this._elements.detailGroups.filter(group => !group.element.hidden)) {
        this._detailState.open[group.name] = action === "true";
        group.element.open = action === "true";
      }
      this.saveDetailState();
    });
    this._elements.values = {
      pv: this._elements.pv, inverter: this._elements.inverter, grid: this._elements.grid,
      batteryPower: this._elements.batteryPower, batterySoc: this._elements.batterySoc,
      soc: this._elements.soc, load: this._elements.load,
    };
    const openDetails = event => {
      if (event.target.closest?.(".trend")) return;
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest?.(".entity-item");
      if (!item || item.hidden) return;
      if (event.type === "keydown") event.preventDefault();
      const entityId = this.entityId(item.dataset.key, item.dataset.fallbackKey);
      if (entityId) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
    };
    this.shadowRoot.addEventListener("click", openDetails);
    this.shadowRoot.addEventListener("keydown", openDetails);
    const trend = this._elements.trend;
    for (const type of ["pointermove", "pointerdown"]) trend.addEventListener(type, event => this.inspectHistory(event));
    trend.addEventListener("pointerleave", event => { if (event.pointerType !== "touch") this.hideHistoryTooltip(); });
    for (const type of ["pointercancel", "blur"]) trend.addEventListener(type, () => this.hideHistoryTooltip());
    trend.addEventListener("focus", () => {
      if (!trend.matches(":focus-visible") || this._historySelection) return;
      const sample = this._historyChart?.samples.findLast(sample => sample.value != null);
      if (sample) this.showHistorySample(sample);
    });
    trend.addEventListener("keydown", event => {
      if (event.key === "Escape") return this.hideHistoryTooltip();
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const samples = this._historyChart?.samples.filter(sample => sample.value != null) || [];
      const index = samples.indexOf(this._historySelection);
      const next = event.key === "Home" ? 0 : event.key === "End" ? samples.length - 1 : index + (event.key === "ArrowLeft" ? -1 : 1);
      if (samples.length) this.showHistorySample(samples[Math.max(0, Math.min(samples.length - 1, next))]);
    });
    this._elements.toggle.addEventListener("click", event => {
      const mode = event.target.closest("button")?.dataset.mode;
      if (!mode) return;
      this._runtimeMode = mode;
      try { localStorage.setItem(this.modeStorageKey, mode); } catch { /* Runtime switching still works without storage. */ }
      this.scheduleRender();
    });
    if ("ResizeObserver" in window) {
      this._resizeObserver = new ResizeObserver(() => {
        // A render can itself resize/show the SVG. Late notifications for
        // geometry we already drew must not cause another full card render.
        if (this.clientWidth !== this._renderedWidth || trend.getBoundingClientRect().width !== (this._historyChart?.width || 0)) this.scheduleRender();
      });
      this._resizeObserver.observe(this);
      this._resizeObserver.observe(trend);
    }
  }

  updateFlow(line, name, value, reverse = false) {
    const active = value != null && Math.abs(value) >= 1;
    const backwards = active && ((value < 0) !== reverse);
    line.classList.toggle("active", active);
    line.toggleAttribute("hidden", line.hidden);
    line.dataset.unavailable = String(value == null);
    line.setAttribute("aria-label", `${name} ${formatPower(value)}`);
    const index = this._elements.lines.indexOf(line);
    const hubPaths = ["M180 50 C180 95 145 105 180 150", "M180 150 C135 150 95 185 50 150", "M180 250 C180 210 215 190 180 150", "M180 150 C225 150 265 115 310 150"];
    const y = [40, 120, 200, 280][index];
    const horizontal = this.config.flow_style === "horizontal";
    const path = horizontal ? (index === 1 || index === 3 ? `M260 ${y} L100 ${y}` : `M100 ${y} L260 ${y}`) : hubPaths[index];
    for (const element of line.querySelectorAll(".track,.pulse")) element.setAttribute("d", path);
    const pulse = line.querySelector(".pulse");
    const midpoint = pulse.getTotalLength() / 2;
    const point = pulse.getPointAtLength(midpoint), next = pulse.getPointAtLength(midpoint + 1);
    const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI + (backwards ? 180 : 0);
    line.querySelector(".arrow").setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
    const animation = pulse.getAnimations()[0];
    if (!active || !animation) return;
    const playbackRate = (backwards ? -1 : 1) / flowDuration(value);
    if (animation.playbackRate !== playbackRate) {
      if (playbackRate < 0 && animation.currentTime < 1_000_000_000) animation.currentTime += 1_000_000_000;
      animation.playbackRate = playbackRate;
    }
  }

  syncAnimationPlayback() {
    const shouldRun = !document.hidden && this._intersecting !== false;
    for (const line of this._elements?.lines || []) {
      const animation = line.querySelector(".pulse").getAnimations()[0];
      if (!animation) continue;
      if (shouldRun && animation.playState === "paused") animation.play();
      if (!shouldRun && animation.playState === "running") animation.pause();
    }
  }
}

class SolarBridgeCardEditor extends HTMLElement {
  setConfig(config) { this.config = config; this.render(); }
  set hass(hass) {
    this._hass = hass;
    if (!this.querySelector(".editor")) this.render();
    this.querySelectorAll("ha-entity-picker").forEach(picker => { picker.hass = hass; });
  }
  render() {
    if (!this._hass) return;
    if (this.querySelector(".editor")) {
      // HA echoes config-changed through setConfig. Keep the controls and native
      // details nodes alive so an entity selection cannot reset focus or folds.
      const values = { ...this.config,
        title: this.config?.title || "Solar power flow",
        view_mode: this.config?.view_mode === "system" ? "system" : "overview",
        display_mode: this.config?.display_mode ?? "auto",
        flow_style: this.config?.flow_style ?? "hub",
        show_mode_toggle: this.config?.show_mode_toggle ?? false };
      this.querySelectorAll("ha-textfield,ha-entity-picker,select").forEach(field => {
        const value = String(values[field.dataset.key] ?? "");
        if (field.value !== value) field.value = value;
      });
      return;
    }
    const picker = ([key,label], optional = false) => `<ha-entity-picker label="${label}${optional ? " (optional)" : ""}" data-key="${key}" value="${escapeHtml(this.config?.[key] || "")}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker>`;
    const mode = this.config?.view_mode === "system" ? "system" : "overview";
    this.innerHTML = `<style>.editor{display:grid;gap:12px;padding:8px}label{display:grid;gap:5px;font-weight:600}select{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--divider-color,#ccc);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#212121)}ha-textfield,ha-entity-picker{width:100%}details{border:1px solid var(--divider-color,#ddd);border-radius:8px;padding:8px}summary{cursor:pointer;font-weight:600}.fields{display:grid;gap:10px;margin-top:10px}</style><div class="editor"><label>Presentation mode<select data-key="view_mode"><option value="overview"${mode === "overview" ? " selected" : ""}>Overview</option><option value="system"${mode === "system" ? " selected" : ""}>System detail</option></select></label><ha-textfield label="Title" value="${escapeHtml(this.config?.title || "Solar power flow")}" data-key="title"></ha-textfield>${CORE_ENTITY_FIELDS.map(field => picker(field, field[0].startsWith("daily_"))).join("")}${DETAIL_GROUPS.map(([group,fields]) => `<details><summary>${group} details</summary><div class="fields">${fields.map(field => picker(field, true)).join("")}</div></details>`).join("")}</div>`;
    const select = (key, label, options, fallback) => `<label>${label}<select data-key="${key}">${options.map(([value, text]) => `<option value="${value}"${String(this.config?.[key] ?? fallback) === value ? " selected" : ""}>${text}</option>`).join("")}</select></label>`;
    this.querySelector(".editor").insertAdjacentHTML("afterbegin", [
      select("display_mode", "Display mode", [["auto", "Auto (legacy visibility)"], ["compact", "Compact"], ["detailed", "Detailed"]], "auto"),
      select("flow_style", "Flow style", [["hub", "Centered energy hub"], ["minimal", "Minimal power distribution"], ["horizontal", "Horizontal lanes"]], "hub"),
      select("show_mode_toggle", "Show device-local mode toggle", [["false", "Off"], ["true", "On"]], false),
    ].join(""));
    this.querySelector('[data-key="view_mode"]').parentElement.firstChild.textContent = "Legacy Auto visibility";
    this.querySelectorAll("ha-entity-picker").forEach(picker => { picker.hass = this._hass; });
    this.querySelectorAll("ha-textfield,ha-entity-picker").forEach(field => field.addEventListener("value-changed", event => {
      const key = event.currentTarget.dataset.key;
      const value = event.detail.value;
      const config = { ...this.config };
      if (value) config[key] = value; else delete config[key];
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
    }));
    this.querySelectorAll("select").forEach(field => field.addEventListener("change", event => {
      const { dataset: { key }, value } = event.currentTarget;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this.config, [key]: key === "show_mode_toggle" ? value === "true" : value } }, bubbles: true, composed: true }));
    }));
  }
}

customElements.define("solarbridge-card", SolarBridgeCard);
customElements.define("solarbridge-card-editor", SolarBridgeCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "solarbridge-card", name: "SolarBridge Power Flow", description: "Animated local solar, battery, load, and grid power flow" });
