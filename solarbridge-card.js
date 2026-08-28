function numericState(hass, entityId) {
  const value = Number(hass?.states?.[entityId]?.state);
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

const ENTITY_FIELDS = [
  ["pv_power", "PV power"], ["inverter_power", "Inverter power"], ["battery_power", "Battery power"],
  ["battery_soc", "Battery SOC"], ["load_power", "Load power"], ["grid_power", "Grid power"],
  ["daily_solar", "Daily solar energy"], ["daily_load", "Daily load energy"],
  ["daily_grid_import", "Daily grid import"], ["daily_grid_export", "Daily grid export"],
];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[character]);

class SolarBridgeCard extends HTMLElement {
  setConfig(config) {
    this.config = { title: "Solar power flow", ...config };
    this._historyKey = "";
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
    this.loadHistory();
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
      const statisticIds = ENTITY_FIELDS.slice(6).map(([key]) => this.config[key]).filter(Boolean);
      if (statisticIds.length) {
        const stats = await this._hass.callWS({
          type: "recorder/statistics_during_period", start_time: `${day}T00:00:00`, end_time: new Date().toISOString(),
          statistic_ids: statisticIds, period: "day", types: ["change", "sum"],
        });
        this._statistics = stats;
      }
      this.render();
    } catch (error) {
      console.debug("SolarBridge Card history unavailable", error);
    }
  }

  value(key) { return numericState(this._hass, this.config[key]); }
  energy(key) {
    const id = this.config[key];
    const latest = this._statistics?.[id]?.at(-1);
    const stat = latest?.change ?? latest?.sum;
    const state = numericState(this._hass, id);
    const value = Number.isFinite(stat) ? stat : state;
    return value == null ? "—" : `${value.toFixed(1)} kWh`;
  }

  render() {
    if (!this.shadowRoot || !this._hass) return;
    const pv = this.value("pv_power");
    const inverter = this.value("inverter_power") ?? pv;
    const battery = this.value("battery_power");
    const soc = this.value("battery_soc");
    const load = this.value("load_power");
    const grid = this.value("grid_power");
    const flow = (kind, name, value, reverse = false) => {
      const active = value != null && Math.abs(value) >= 1;
      const backwards = active && ((value < 0) !== reverse);
      return `<div class="line ${kind} ${active ? "active" : ""} ${backwards ? "reverse" : ""}" style="--speed:${flowDuration(value)}s" aria-label="${name} ${formatPower(value)}"><i></i></div>`;
    };
    const node = (kind, title, value, icon) => `<div class="node ${kind}"><span class="icon">${icon}</span><b>${title}</b><strong>${value}</strong></div>`;

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,system-ui)}
      ha-card{display:block;overflow:hidden;padding:20px;border-radius:var(--ha-card-border-radius,12px);background:linear-gradient(145deg,var(--ha-card-background,var(--card-background-color,#fff)),color-mix(in srgb,var(--primary-color,#03a9f4) 8%,var(--ha-card-background,#fff)))}
      h2{font-size:20px;margin:0 0 18px}.flow{display:grid;grid-template-columns:1fr 54px 1fr 54px 1fr;grid-template-rows:auto 54px auto;align-items:center;gap:4px}
      .node{min-width:0;text-align:center;padding:12px 5px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:16px;background:color-mix(in srgb,var(--card-background-color,#fff) 82%,transparent);box-shadow:0 8px 25px #0001}
      .node b,.node strong{display:block;white-space:nowrap}.node b{font-size:12px;opacity:.68;margin:3px}.node strong{font-size:16px}.icon{font-size:25px}.pv{grid-column:1}.inverter{grid-column:3}.grid{grid-column:5}.battery{grid-column:1;grid-row:3}.load{grid-column:5;grid-row:3}
      .line{height:4px;position:relative;background:color-mix(in srgb,currentColor 12%,transparent);border-radius:5px;overflow:hidden}.line i{display:none;position:absolute;width:14px;height:4px;border-radius:5px;background:var(--primary-color,#03a9f4);animation:move var(--speed) linear infinite}.line.active i{display:block}.line.reverse i{animation-name:back}.pv-line{grid-column:2;grid-row:1}.grid-line{grid-column:4;grid-row:1}.battery-line{grid-column:2;grid-row:2;transform:rotate(-35deg)}.load-line{grid-column:4;grid-row:2;transform:rotate(35deg)}
      @keyframes move{from{left:-14px}to{left:100%}}@keyframes back{from{left:100%}to{left:-14px}}
      .soc{margin-top:17px;display:grid;grid-template-columns:80px 1fr;gap:12px;align-items:end}.gauge{height:10px;background:#0002;border-radius:8px;overflow:hidden}.gauge i{display:block;height:100%;width:var(--soc);background:linear-gradient(90deg,#ff7043,#66bb6a);border-radius:8px}.trendbox small{display:block;font-size:10px;opacity:.6;margin-bottom:2px}.trend{display:block;width:100%;height:38px;border-bottom:1px solid #0001}.trend polyline{fill:none;stroke:var(--primary-color,#03a9f4);stroke-width:2}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:16px}.summary div{padding:8px 4px;text-align:center;border-radius:10px;background:#00000008}.summary small,.summary b{display:block}.summary small{opacity:.65;font-size:10px}.summary b{font-size:12px;margin-top:3px}@media(max-width:450px){.summary{grid-template-columns:repeat(2,1fr)}}
    </style><ha-card>
      <h2>${escapeHtml(this.config.title)}</h2><div class="flow">
        ${node("pv","Solar",formatPower(pv),"☀️")}${flow("pv-line","PV to inverter",pv)}${node("inverter","Inverter",formatPower(inverter),"⚡")}${flow("grid-line","Grid flow",grid,true)}${node("grid","Grid",formatPower(grid),"▦")}
        ${node("battery","Battery",`${soc ?? "—"}% · ${formatPower(battery)}`,"🔋")}${flow("battery-line","Battery flow",battery)}${flow("load-line","Load flow",load)}${node("load","Home",formatPower(load),"⌂")}
      </div><div class="soc"><div><b>${soc ?? "—"}%</b><div class="gauge" style="--soc:${Math.max(0,Math.min(100,soc ?? 0))}%"><i></i></div></div><div class="trendbox"><small>Battery SOC · 24h</small><svg class="trend" viewBox="0 0 280 42" preserveAspectRatio="none" aria-label="24 hour battery SOC trend"><polyline points="${sparklinePoints(this._socHistory || [])}"/></svg></div></div>
      <div class="summary">${[["daily_solar","Solar"],["daily_load","Load"],["daily_grid_import","Imported"],["daily_grid_export","Exported"]].map(([key,label]) => `<div><small>${label} today</small><b>${this.energy(key)}</b></div>`).join("")}</div>
    </ha-card>`;
  }
}

class SolarBridgeCardEditor extends HTMLElement {
  setConfig(config) { this.config = config; this.render(); }
  set hass(hass) { this._hass = hass; this.render(); }
  render() {
    if (!this._hass) return;
    this.innerHTML = `<style>.editor{display:grid;gap:12px;padding:8px}label{font-weight:600}ha-textfield,ha-entity-picker{width:100%}</style><div class="editor"><ha-textfield label="Title" value="${escapeHtml(this.config?.title || "Solar power flow")}" data-key="title"></ha-textfield>${ENTITY_FIELDS.map(([key,label]) => `<ha-entity-picker label="${label}${key.startsWith("daily_") ? " (optional)" : ""}" data-key="${key}" value="${escapeHtml(this.config?.[key] || "")}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker>`).join("")}</div>`;
    this.querySelectorAll("ha-textfield,ha-entity-picker").forEach(field => field.addEventListener("value-changed", event => {
      const key = event.currentTarget.dataset.key;
      const value = event.detail.value;
      const config = { ...this.config };
      if (value) config[key] = value; else delete config[key];
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
    }));
  }
}

customElements.define("solarbridge-card", SolarBridgeCard);
customElements.define("solarbridge-card-editor", SolarBridgeCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "solarbridge-card", name: "SolarBridge Power Flow", description: "Animated local solar, battery, load, and grid power flow" });
