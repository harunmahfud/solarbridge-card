# SolarBridge Card

A configurable Home Assistant power-flow card showing PV → inverter → battery / home / grid with animated direction and speed, a 24-hour battery SOC trend, and daily energy summaries from configured entity states.

The card has no hardcoded SolarBridge entity IDs. It works with any integration exposing standard power, battery SOC, and energy sensors.

## Install with HACS

1. Open **HACS → Frontend**.
2. Select **⋮ → Custom repositories**.
3. Add `https://github.com/harunmahfud/solarbridge-card` with category **Dashboard** (Plugin/Frontend).
4. Install **SolarBridge Card** and refresh the browser.

Add the card in the dashboard UI and use its visual editor to select PV, inverter, battery, load, grid, and optional energy entities. No YAML is required.

## Presentation modes

- **Overview** (default) preserves the original flow topology, battery trend,
  and daily summaries. Existing configurations remain in this mode without
  changes.
- **System detail** keeps the same topology and adds textual flow states plus
  responsive groups for configured per-string, inverter, battery, grid/load,
  AUX, and lifetime metrics. Groups use two columns when space permits and one
  column on narrow cards. Unconfigured rows are omitted; a configured entity
  that is missing, unknown, or unavailable remains visible as `—` and is
  announced as unavailable to assistive technology.

Choose the mode in the visual editor, or set `view_mode: system` in YAML.

If configuring manually:

```yaml
type: custom:solarbridge-card
title: Solar power flow
view_mode: system
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
pv1_power: sensor.solarbridge_pv1_power
pv1_voltage: sensor.solarbridge_pv1_voltage
pv1_current: sensor.solarbridge_pv1_current
pv2_power: sensor.solarbridge_pv2_power
pv2_voltage: sensor.solarbridge_pv2_voltage
pv2_current: sensor.solarbridge_pv2_current
inverter_voltage: sensor.solarbridge_inverter_output_voltage
inverter_current: sensor.solarbridge_inverter_current
battery_voltage: sensor.solarbridge_battery_voltage
battery_current: sensor.solarbridge_battery_current
grid_voltage: sensor.solarbridge_grid_voltage
grid_current: sensor.solarbridge_grid_current
```

The inverter output voltage entity is introduced by `ha-solarbridge` PR #3;
the picker also accepts an equivalent sensor from another integration. All
System detail fields are optional. See the [complete 72-entity audit](ENTITY_AUDIT.md)
for every supported mapping and the rationale for excluding identity, raw, and
time-of-use setting entities.

Positive/negative direction depends on the source integration's sign convention. If its convention differs, use a Home Assistant template sensor to invert that entity.

## Data and calculations

The card reads numeric entity states; it does not derive a power balance or integrate power into energy. Entity unit attributes are not converted, so configure power sensors reporting **W**, daily energy sensors reporting **kWh**, and battery SOC reporting **%**.

System detail values are even more literal: each row displays the selected
entity's raw state string followed by its Home Assistant
`unit_of_measurement`. It performs no rounding or parsing. In particular,
`pv_power` is not calculated from `pv1_power` and `pv2_power`; choose the
topology entity explicitly. The current SolarBridge profile does not expose a
verified aggregate PV power register.

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

System detail also labels each topology node with an explicit state. Values
below 1 W are **Idle**, missing values are **Unavailable**, and active signed
values are described as Generating/Reverse flow, Producing/Reverse flow,
Importing/Exporting, Charging/Discharging, or Consuming/Reverse flow according
to the node. These labels follow the same sign convention as the animation and
do not transform the displayed power.

The four daily entities should already represent today's accumulating totals and reset according to their source integration. The card performs no summing, subtraction, normalization, sign adjustment, or unit conversion on them.

## Development

```bash
npm test
npm run check
```

The visual direction is original and inspired by—not copied from—the dashboards in `heavenknows1978/hass-deyecloud` and `harunmahfud/hass-deyecloud`.
