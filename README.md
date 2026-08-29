# SolarBridge Card

A configurable Home Assistant power-flow card showing PV → inverter → battery / home / grid with animated direction and speed, a 24-hour battery SOC trend, and daily energy summaries from configured entity states.

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

## Data and calculations

The card reads numeric entity states; it does not derive a power balance or integrate power into energy. Entity unit attributes are not converted, so configure power sensors reporting **W**, daily energy sensors reporting **kWh**, and battery SOC reporting **%**.

| Display | Configuration/input | Raw or calculated behavior |
| --- | --- | --- |
| Solar power | `pv_power` | Raw numeric entity state, assumed W; presentation formatting only. |
| Inverter power | `inverter_power` | Raw numeric entity state, assumed W. If it is missing or non-numeric, the raw `pv_power` value is used as a fallback. |
| Battery power | `battery_power` | Raw signed numeric entity state, assumed W; presentation formatting only. |
| Home power | `load_power` | Raw numeric entity state, assumed W; presentation formatting only. |
| Grid power | `grid_power` | Raw signed numeric entity state, assumed W; presentation formatting only. |
| Battery SOC text | `battery_soc` | Raw numeric entity state with `%` appended. The gauge width clamps this value to 0–100%; the displayed number itself is not clamped. |
| Battery SOC · 24h | Recorder history for `battery_soc` | Numeric states returned for the preceding 24 hours. Points are evenly spaced in response order and min/max-normalized to the chart height; timestamps are not used for horizontal spacing. This affects only the sparkline, not the SOC value. |
| Solar today | `daily_solar` | Raw current numeric entity state, assumed kWh, rounded to one decimal. It is not calculated from `pv_power` and does not use Recorder statistic `change` or `sum`. |
| Load today | `daily_load` | Raw current numeric entity state, assumed kWh, rounded to one decimal. |
| Imported today | `daily_grid_import` | Raw current numeric entity state, assumed kWh, rounded to one decimal. |
| Exported today | `daily_grid_export` | Raw current numeric entity state, assumed kWh, rounded to one decimal. |

Power presentation uses W rounded to the nearest whole number below 1000 W. Values with an absolute magnitude of at least 1000 W are divided by 1000 and shown in kW with one decimal. Missing, unavailable, or otherwise non-numeric states display `—`.

Flow animation is derived from each raw power value:

- A line is active when the absolute value is at least 1 W.
- The 68 px keyframe traversal takes `1800 / abs(power)` seconds, clamped to 0.45–3 seconds, so greater magnitude moves faster.
- Positive PV, battery, and load values use the forward direction; negative values reverse it. Grid direction is intentionally inverted: positive uses the reverse direction and negative uses forward.
- These signs control animation only. Displayed signed values are not adjusted.
- Reduced-motion preferences disable the moving pattern while preserving the line's active/inactive indication.

The four daily entities should already represent today's accumulating totals and reset according to their source integration. The card performs no summing, subtraction, normalization, sign adjustment, or unit conversion on them.

## Development

```bash
npm test
npm run check
```

The visual direction is original and inspired by—not copied from—the dashboards in `heavenknows1978/hass-deyecloud` and `harunmahfud/hass-deyecloud`.
