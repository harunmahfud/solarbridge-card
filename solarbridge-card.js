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
function sparklinePoints(values, width = 280, height = 42) {
  if (!values.length) return "";
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index * width / (values.length - 1);
    return `${x.toFixed(1)},${(height - ((value - min) / span) * height).toFixed(1)}`;
  }).join(" ");
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
  ]],
  ["Inverter", [
    ["inverter_voltage", "Inverter output voltage"], ["inverter_current", "Inverter current"],
    ["running_status", "Running status"], ["ac_temperature", "AC temperature"], ["dc_temperature", "DC temperature"],
  ]],
  ["Battery", [
    ["battery_voltage", "Battery voltage"], ["battery_current", "Battery current"],
    ["battery_temperature", "Battery temperature"], ["daily_battery_charge", "Daily battery charge"],
    ["daily_battery_discharge", "Daily battery discharge"], ["total_battery_charge", "Total battery charge"],
    ["total_battery_discharge", "Total battery discharge"],
  ]],
  ["Grid and load", [
    ["grid_voltage", "Grid voltage"], ["grid_current", "Grid current"], ["grid_frequency", "Grid frequency"],
    ["grid_status", "Grid-connected status"], ["load_voltage", "Load voltage"], ["load_frequency", "Load frequency"],
    ["internal_ct_power", "Internal CT power"], ["external_ct_power", "External CT power"],
  ]],
  ["AUX", [["aux_power", "AUX port power"]]],
  ["Lifetime energy", [
    ["total_solar", "Total production"], ["total_load", "Total load consumption"],
    ["total_grid_import", "Total energy bought"], ["total_grid_export", "Total energy sold"],
  ]],
];
const DETAIL_FIELDS = DETAIL_GROUPS.flatMap(([, fields]) => fields);
const ENTITY_FIELDS = [...CORE_ENTITY_FIELDS, ...DETAIL_FIELDS];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[character]);

class SolarBridgeCard extends HTMLElement {
  setConfig(config) {
    const batteryEntityChanged = this.config?.battery_soc !== config.battery_soc;
    this.config = { title: "Solar power flow", ...config, view_mode: config.view_mode === "system" ? "system" : "overview" };
    if (batteryEntityChanged) this._historyKey = "";
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._stateSignature = "";
    this.scheduleRender();
  }

  set hass(hass) {
    this._hass = hass;
    const signature = ENTITY_FIELDS.map(([key]) => {
      const entityId = this.config?.[key];
      const entity = hass?.states?.[entityId];
      return `${entityId || ""}:${entity?.state || ""}:${entity?.attributes?.unit_of_measurement || ""}`;
    }).join("|");
    if (signature !== this._stateSignature) {
      this._stateSignature = signature;
      this.scheduleRender();
    }
    this.loadHistory();
  }

  connectedCallback() {
    this._intersecting = true;
    this._visibilityHandler = () => this.syncAnimationPlayback();
    document.addEventListener("visibilitychange", this._visibilityHandler);
    if ("IntersectionObserver" in window) {
      this._observer = new IntersectionObserver(([entry]) => {
        this._intersecting = entry.isIntersecting;
        this.syncAnimationPlayback();
      });
      this._observer.observe(this);
    }
  }

  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this._visibilityHandler);
    this._observer?.disconnect();
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

  async loadHistory() {
    if (!this._hass || !this.config?.battery_soc) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `${this.config.battery_soc}:${day}`;
    if (key === this._historyKey) return;
    this._historyKey = key;
    try {
      const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const history = await this._hass.callApi("GET", `history/period/${start}?filter_entity_id=${encodeURIComponent(this.config.battery_soc)}&minimal_response`);
      this._socHistory = (history?.[0] || []).map(item => Number(item.state)).filter(Number.isFinite);
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
      :host{--sb-surface:var(--ha-card-background,var(--card-background-color,#fff));--sb-text:var(--primary-text-color,#212121);--sb-muted:var(--secondary-text-color,#616161);--sb-accent:var(--primary-color,#03a9f4);display:block;color:var(--sb-text);font-family:var(--paper-font-body1_-_font-family,system-ui)}
      ha-card{display:block;overflow:hidden;padding:20px;border-radius:var(--ha-card-border-radius,12px);background:radial-gradient(circle at 50% 12%,color-mix(in srgb,var(--sb-accent) 7%,transparent),transparent 58%),var(--sb-surface)}
      h2{font-size:20px;margin:0 0 18px}.flow{display:grid;grid-template-columns:1fr 54px 1fr 54px 1fr;grid-template-rows:auto 54px auto;align-items:center;gap:4px}
      [hidden]{display:none!important}.entity-item{cursor:pointer}.entity-item:focus-visible{outline:2px solid var(--sb-accent);outline-offset:2px}
      .node{min-width:0;text-align:center;padding:12px 5px;border:1px solid color-mix(in srgb,var(--sb-text) 14%,transparent);border-radius:16px;background:color-mix(in srgb,var(--sb-text) 9%,var(--sb-surface));box-shadow:0 8px 25px #0001}
      .node b,.node strong{display:block;white-space:nowrap}.node b{font-size:12px;color:var(--sb-muted);margin:3px}.node strong{font-size:16px}.icon{font-size:25px}.pv{grid-column:1}.inverter{grid-column:3}.grid{grid-column:5}.battery{grid-column:1;grid-row:3}.load{grid-column:5;grid-row:3}
      [data-value-tone="positive"]{color:var(--success-color,#2e7d32)}[data-value-tone="negative"]{color:var(--warning-color,#e65100)}[data-value-tone="unavailable"]{color:var(--sb-muted)}
      .battery strong{display:flex;flex-wrap:wrap;justify-content:center;column-gap:.25em;white-space:normal}.battery strong>span{white-space:nowrap}
      .flow-state{display:none;margin-top:4px;color:var(--sb-muted);font-size:10px}.system-mode .flow-state{display:block}
      .line{height:4px;position:relative;background:color-mix(in srgb,var(--sb-text) 22%,var(--sb-surface));border-radius:5px;overflow:hidden}.line[hidden]{display:block!important;visibility:hidden}.line i{visibility:hidden;position:absolute;top:0;bottom:0;left:-68px;width:calc(100% + 68px);border-radius:inherit;background:repeating-linear-gradient(90deg,var(--sb-accent) 0 14px,transparent 14px 34px);animation:flow 1s linear infinite;will-change:transform}.line.active i{visibility:visible}.pv-line{grid-column:2;grid-row:1}.grid-line{grid-column:4;grid-row:1}.battery-line{grid-column:2;grid-row:2;transform:rotate(-35deg)}.load-line{grid-column:4;grid-row:2;transform:rotate(35deg)}
      @keyframes flow{to{transform:translateX(68px)}}
      .soc{margin-top:17px;display:grid;grid-template-columns:80px 1fr;gap:12px;align-items:end}.gauge{height:10px;background:color-mix(in srgb,var(--sb-text) 18%,var(--sb-surface));border-radius:8px;overflow:hidden}.gauge i{display:block;height:100%;width:var(--soc);background:linear-gradient(90deg,#ff7043,#66bb6a);border-radius:8px}.trendbox small{display:block;font-size:10px;color:var(--sb-muted);margin-bottom:2px}.trend{display:block;width:100%;height:38px;border-bottom:1px solid color-mix(in srgb,var(--sb-text) 14%,transparent)}.trend polyline{fill:none;stroke:var(--sb-accent);stroke-width:2}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:16px}.summary div{padding:9px 4px;text-align:center;border:1px solid color-mix(in srgb,var(--sb-text) 10%,transparent);border-radius:10px;background:color-mix(in srgb,var(--sb-text) 6%,var(--sb-surface))}.summary small,.summary b{display:block}.summary small{color:var(--sb-muted);font-size:10px}.summary b{font-size:12px;margin-top:3px}@media(max-width:450px){.summary{grid-template-columns:repeat(2,1fr)}}@media(prefers-reduced-motion:reduce){.line i{animation:none}}
      .details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.details[hidden],.metric-group[hidden]{display:none}.metric-group{min-width:0;padding:10px;border:1px solid color-mix(in srgb,var(--sb-text) 10%,transparent);border-radius:12px;background:color-mix(in srgb,var(--sb-text) 5%,var(--sb-surface))}.metric-group h3{font-size:13px;margin:0 0 7px}.metric-group dl{margin:0}.metric-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:11px}.metric-row dt{min-width:0;color:var(--sb-muted)}.metric-row dd{margin:0;white-space:nowrap;font-weight:600}.metric-row.unavailable dd{color:var(--sb-muted)}
      @media(max-width:450px){.details{grid-template-columns:1fr}}
    </style><ha-card>
      <h2></h2><div class="flow">
        <div class="node pv entity-item" data-key="pv_power" aria-label="Solar"><span class="icon">☀️</span><b>Solar</b><strong></strong><small class="flow-state"></small></div><div class="line pv-line" role="img"><i></i></div><div class="node inverter entity-item" data-key="inverter_power" aria-label="Inverter"><span class="icon">⚡</span><b>Inverter</b><strong></strong><small class="flow-state"></small></div><div class="line grid-line" role="img"><i></i></div><div class="node grid entity-item" data-key="grid_power" aria-label="Grid"><span class="icon">▦</span><b>Grid</b><strong></strong><small class="flow-state"></small></div>
        <div class="node battery entity-item" data-key="battery_power" data-fallback-key="battery_soc" aria-label="Battery"><span class="icon">🔋</span><b>Battery</b><strong><span class="battery-soc"><span class="battery-soc-value"></span> <span aria-hidden="true">·</span></span><span class="battery-power"></span></strong><small class="flow-state"></small></div><div class="line battery-line" role="img"><i></i></div><div class="line load-line" role="img"><i></i></div><div class="node load entity-item" data-key="load_power" aria-label="Home"><span class="icon">⌂</span><b>Home</b><strong></strong><small class="flow-state"></small></div>
      </div><div class="soc entity-item" data-key="battery_soc"><div><b></b><div class="gauge"><i></i></div></div><div class="trendbox"><small>Battery SOC · 24h</small><svg class="trend" viewBox="0 0 280 42" preserveAspectRatio="none" aria-label="24 hour battery SOC trend"><polyline/></svg></div></div>
      <div class="summary">${[["daily_solar","Solar"],["daily_load","Load"],["daily_grid_import","Imported"],["daily_grid_export","Exported"]].map(([key,label]) => `<div class="entity-item" data-key="${key}"><small>${label} today</small><b></b></div>`).join("")}</div>
      <section class="details" aria-label="System details" hidden>${DETAIL_GROUPS.map(([group, fields]) => `<section class="metric-group" data-group="${escapeHtml(group)}"><h3>${escapeHtml(group)}</h3><dl>${fields.map(([key,label]) => `<div class="metric-row entity-item" data-key="${key}" hidden><dt>${label}</dt><dd></dd></div>`).join("")}</dl></section>`).join("")}</section>
    </ha-card>`;
    if (!this._elements) this.cacheElements();

    const pv = this.value("pv_power");
    const inverter = this.value("inverter_power");
    const battery = this.value("battery_power");
    const soc = this.value("battery_soc");
    const load = this.value("load_power");
    const grid = this.value("grid_power");
    const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };
    const systemMode = this.config.view_mode === "system";
    this._elements.card.classList.toggle("system-mode", systemMode);
    this._elements.details.hidden = !systemMode;
    text(this._elements.title, this.config.title);
    text(this._elements.pv, formatPower(pv));
    text(this._elements.inverter, formatPower(inverter));
    text(this._elements.grid, formatPower(grid));
    text(this._elements.batterySoc, `${soc ?? "—"}%`);
    text(this._elements.batteryPower, formatPower(battery));
    text(this._elements.load, formatPower(load));
    for (const [key, value] of Object.entries({ pv, inverter, grid, batteryPower: battery, batterySoc: soc, soc, load })) {
      this.updateValueTone(this._elements.values[key], value);
    }
    this._elements.batterySocGroup.hidden = !this.config.battery_soc;
    this._elements.batteryPower.hidden = !this.config.battery_power;
    text(this._elements.flowStates.pv, this.flowState(pv, "Generating", "Reverse flow"));
    text(this._elements.flowStates.inverter, this.flowState(inverter, "Supplying", "Absorbing", "Standby"));
    text(this._elements.flowStates.grid, this.flowState(grid, "Importing", "Exporting"));
    text(this._elements.flowStates.battery, this.flowState(battery, "Discharging", "Charging"));
    text(this._elements.flowStates.load, this.flowState(load, "Consuming", "Reverse flow"));
    text(this._elements.soc, `${soc ?? "—"}%`);
    this._elements.gauge.style.setProperty("--soc", `${Math.max(0, Math.min(100, soc ?? 0))}%`);
    this._elements.trend.setAttribute("points", sparklinePoints(this._socHistory || []));
    for (const [key] of CORE_ENTITY_FIELDS.slice(6)) text(this._elements.energy[key], this.energy(key));
    for (const item of this._elements.entityItems) this.updateEntityItem(item, item.dataset.key, item.dataset.fallbackKey);
    this._elements.summary.hidden = !CORE_ENTITY_FIELDS.slice(6).some(([key]) => this.config[key]);
    this._elements.lines[0].hidden = !this.entityId("pv_power") || !this.entityId("inverter_power");
    this._elements.lines[1].hidden = !this.entityId("grid_power") || !this.entityId("inverter_power");
    this._elements.lines[2].hidden = !this.entityId("battery_power") || !this.entityId("inverter_power");
    this._elements.lines[3].hidden = !this.entityId("load_power") || !this.entityId("inverter_power");
    this.updateFlow(this._elements.lines[0], "PV to inverter", pv);
    this.updateFlow(this._elements.lines[1], "Grid flow", grid, true);
    this.updateFlow(this._elements.lines[2], "Battery flow", battery);
    this.updateFlow(this._elements.lines[3], "Load flow", load);
    if (systemMode) this.updateDetails(text);
    this.syncAnimationPlayback();
  }

  flowState(value, positive, negative, idle = "Idle") {
    if (value == null) return "Unavailable";
    if (Math.abs(value) < 1) return idle;
    return value > 0 ? positive : negative;
  }

  updateDetails(text) {
    for (const group of this._elements.detailGroups) {
      let visible = 0;
      for (const { key, label, row, output } of group.rows) {
        const entityId = this.config[key];
        row.hidden = !entityId;
        if (!entityId) continue;
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
    }
  }

  cacheElements() {
    const select = selector => this.shadowRoot.querySelector(selector);
    this._elements = {
      card: select("ha-card"), details: select(".details"), summary: select(".summary"), title: select("h2"),
      pv: select(".pv strong"), inverter: select(".inverter strong"),
      grid: select(".grid strong"), batterySoc: select(".battery-soc-value"),
      batterySocGroup: select(".battery-soc"), batteryPower: select(".battery-power"),
      load: select(".load strong"), soc: select(".soc>div>b"),
      gauge: select(".gauge"), trend: select(".trend polyline"), lines: [...this.shadowRoot.querySelectorAll(".line")],
      flowStates: Object.fromEntries(["pv", "inverter", "grid", "battery", "load"].map(key => [key, select(`.${key} .flow-state`)])),
      energy: Object.fromEntries(CORE_ENTITY_FIELDS.slice(6).map(([key]) => [key, select(`.summary [data-key="${key}"] b`)])),
      entityItems: [...this.shadowRoot.querySelectorAll(".entity-item")],
      detailGroups: DETAIL_GROUPS.map(([group, fields]) => ({
        element: select(`.metric-group[data-group="${group}"]`),
        rows: fields.map(([key, label]) => {
          const row = select(`.metric-row[data-key="${key}"]`);
          return { key, label, row, output: row.querySelector("dd") };
        }),
      })),
    };
    this._elements.values = {
      pv: this._elements.pv, inverter: this._elements.inverter, grid: this._elements.grid,
      batteryPower: this._elements.batteryPower, batterySoc: this._elements.batterySoc,
      soc: this._elements.soc, load: this._elements.load,
    };
    const openDetails = event => {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest?.(".entity-item");
      if (!item || item.hidden) return;
      if (event.type === "keydown") event.preventDefault();
      const entityId = this.entityId(item.dataset.key, item.dataset.fallbackKey);
      if (entityId) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
    };
    this.shadowRoot.addEventListener("click", openDetails);
    this.shadowRoot.addEventListener("keydown", openDetails);
  }

  updateFlow(line, name, value, reverse = false) {
    const active = value != null && Math.abs(value) >= 1;
    const backwards = active && ((value < 0) !== reverse);
    line.classList.toggle("active", active);
    line.setAttribute("aria-label", `${name} ${formatPower(value)}`);
    const animation = line.querySelector("i").getAnimations()[0];
    if (!active || !animation) return;
    const playbackRate = (backwards ? -1 : 1) / flowDuration(value);
    if (line._playbackRate !== playbackRate) {
      if (playbackRate < 0 && animation.currentTime < 1_000_000_000) animation.currentTime += 1_000_000_000;
      animation.updatePlaybackRate(playbackRate);
      line._playbackRate = playbackRate;
    }
  }

  syncAnimationPlayback() {
    const shouldRun = !document.hidden && this._intersecting !== false;
    for (const line of this._elements?.lines || []) {
      const animation = line.querySelector("i").getAnimations()[0];
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
    const picker = ([key,label], optional = false) => `<ha-entity-picker label="${label}${optional ? " (optional)" : ""}" data-key="${key}" value="${escapeHtml(this.config?.[key] || "")}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker>`;
    const mode = this.config?.view_mode === "system" ? "system" : "overview";
    this.innerHTML = `<style>.editor{display:grid;gap:12px;padding:8px}label{display:grid;gap:5px;font-weight:600}select{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--divider-color,#ccc);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#212121)}ha-textfield,ha-entity-picker{width:100%}details{border:1px solid var(--divider-color,#ddd);border-radius:8px;padding:8px}summary{cursor:pointer;font-weight:600}.fields{display:grid;gap:10px;margin-top:10px}</style><div class="editor"><label>Presentation mode<select data-key="view_mode"><option value="overview"${mode === "overview" ? " selected" : ""}>Overview</option><option value="system"${mode === "system" ? " selected" : ""}>System detail</option></select></label><ha-textfield label="Title" value="${escapeHtml(this.config?.title || "Solar power flow")}" data-key="title"></ha-textfield>${CORE_ENTITY_FIELDS.map(field => picker(field, field[0].startsWith("daily_"))).join("")}${DETAIL_GROUPS.map(([group,fields]) => `<details><summary>${group} details</summary><div class="fields">${fields.map(field => picker(field, true)).join("")}</div></details>`).join("")}</div>`;
    this.querySelectorAll("ha-entity-picker").forEach(picker => { picker.hass = this._hass; });
    this.querySelectorAll("ha-textfield,ha-entity-picker").forEach(field => field.addEventListener("value-changed", event => {
      const key = event.currentTarget.dataset.key;
      const value = event.detail.value;
      const config = { ...this.config };
      if (value) config[key] = value; else delete config[key];
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
    }));
    this.querySelector("select").addEventListener("change", event => {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this.config, view_mode: event.currentTarget.value } }, bubbles: true, composed: true }));
    });
  }
}

customElements.define("solarbridge-card", SolarBridgeCard);
customElements.define("solarbridge-card-editor", SolarBridgeCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "solarbridge-card", name: "SolarBridge Power Flow", description: "Animated local solar, battery, load, and grid power flow" });
