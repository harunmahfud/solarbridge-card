# SolarBridge Card

A configurable Home Assistant power-flow card showing PV → inverter → battery / home / grid with animated direction and speed, a 24-hour battery SOC trend, and daily energy summaries from long-term statistics.

The card has no hardcoded SolarBridge entity IDs. It works with any integration exposing standard power, battery SOC, and energy sensors.

## Install with HACS

1. Open **HACS → Frontend**.
2. Select **⋮ → Custom repositories**.
3. Add `https://github.com/harunmahfud/solarbridge-card` with category **Dashboard** (Plugin/Frontend).
4. Install **SolarBridge Card** and refresh the browser.

Add the card in the dashboard UI and use its visual editor to select PV, inverter, battery, load, grid, and optional daily energy entities. No YAML is required.

If configuring manually:

```yaml
type: custom:solarbridge-card
title: Solar power flow
pv_power: sensor.solarbridge_pv1_power
inverter_power: sensor.solarbridge_inverter_power
battery_power: sensor.solarbridge_battery_power
battery_soc: sensor.solarbridge_battery_soc
load_power: sensor.solarbridge_load_power
grid_power: sensor.solarbridge_grid_power
daily_solar: sensor.solarbridge_daily_production
daily_load: sensor.solarbridge_daily_load_consumption
daily_grid_import: sensor.solarbridge_daily_energy_bought
daily_grid_export: sensor.solarbridge_daily_energy_sold
```

Positive/negative direction depends on the source integration's sign convention. If its convention differs, use a Home Assistant template sensor to invert that entity.

## Development

```bash
npm test
npm run check
```

The visual direction is original and inspired by—not copied from—the dashboards in `heavenknows1978/hass-deyecloud` and `harunmahfud/hass-deyecloud`.
