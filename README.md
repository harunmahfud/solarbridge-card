# SolarBridge Card

A configurable Home Assistant power-flow card showing PV → inverter → battery / home / grid with animated direction and speed, a 24-hour battery SOC or voltage trend, and daily energy summaries from configured entity states.

The card has no hardcoded SolarBridge entity IDs. It works with any integration exposing standard power, battery SOC, and energy sensors.

## Install with HACS

1. Open **HACS → Frontend**.
2. Select **⋮ → Custom repositories**.
3. Add `https://github.com/harunmahfud/solarbridge-card` with category **Dashboard** (Plugin/Frontend).
4. Install **SolarBridge Card** and refresh the browser.

Add the card in the dashboard UI and use its visual editor to select PV, inverter, battery, load, grid, and optional energy entities. No YAML is required.

Only configured readings are shown. Selecting a topology node, battery trend,
daily summary, or technical row opens Home Assistant's standard entity
details dialog; keyboard users can use Enter or Space. Solar is yellow, home
blue, grid purple, and battery green in both HA themes. Direction labels and
static arrows carry the meaning independently of color or animation; a negative
power reading is not a warning. Unavailable readings use muted styling and `—`,
not a measured zero. HA theme changes apply live.

## Presentation modes

| Option | Default | Behavior |
| --- | --- | --- |
| `display_mode` | `auto` | `auto` preserves legacy visibility: overview keeps the live overview, configured battery level/history and daily totals; `view_mode: system` also exposes configured technical groups. `compact` shows essential live readings and configured daily totals, without charts or technical groups. `detailed` adds the configured 24-hour voltage chart, expandable technical groups and a separate signed inverter power reading. |
| `flow_style` | `hub` | `hub` is a centered five-node diagram with curved connectors. `minimal` uses four live tiles and an incoming-power bar. `horizontal` uses four directional lanes. Every style works with every display mode. |
| `show_mode_toggle` | `false` | Enables Compact/Detailed buttons. The initial selection follows `display_mode` (Auto follows legacy `view_mode`). A runtime selection is remembered in localStorage for the same entity bindings in this browser/device; it never changes YAML or the pinned flow style. With the toggle off, stored choices are ignored. If storage is blocked, switching still works for the current card instance. |

Existing YAML needs no migration. `view_mode: overview` and `view_mode: system`
remain supported in Auto. No entity keys were renamed or made required.
Use **compact + minimal** for daily checks, or **detailed + hub** to investigate.
Omitting `flow_style` always uses Hub, including when switching modes.

Detailed has six expandable groups: Solar strings, Inverter, Battery, Grid and
load, AUX, and Lifetime energy. Independent configured rows remain visible even
with partial configuration. Missing/unknown/unavailable configured entities are
shown as `—`; unconfigured rows and empty groups are hidden. On narrow cards,
groups start collapsed and stack in one column. On wider cards, the first three
start expanded in two columns. Your expansion choices survive live updates.
Layout depends on the card's available width, not the dashboard window width.

Minimal's incoming power is **solar generation + grid import + battery
discharge** (positive contributions only). It excludes inverter power, home
load, grid export and battery charging. Missing configured sources are marked
unavailable, and the displayed subtotal is labelled **known**, rather than
pretending a complete total. Nothing forces these independent measurements to
balance. The captured 91 W solar + 608 W import − 243 W charging case shows
**699 W incoming**, **455 W home**, and **243 W charging**. Detailed retains
the separate **−153 W absorbing** inverter reading. In a new explicit mode,
the Hub center can be a topology label without an inverter power entity.

If configuring manually:

```yaml
type: custom:solarbridge-card
title: Solar power flow
display_mode: detailed
flow_style: hub
show_mode_toggle: true
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

The redesign represents one aggregate battery, not individual packs or cells.
For compatibility, legacy BMS keys remain selectable in the editor and retain
their old Capacity-mode visibility in **Auto + `view_mode: system`** only.
Explicit Compact/Detailed omit the BMS group. Those keys are
`bms_charging_voltage`, `bms_discharge_voltage`, `bms_charge_current_limit`,
`bms_discharge_current_limit`, `bms_soc`, `bms_voltage`, `bms_current` and
`bms_temperature`. They require `ha-solarbridge` v0.1.9 or equivalent sensors.
`bms_voltage` remains distinct from aggregate `battery_voltage`.
All technical fields are optional. See the
[complete 94-entity audit](ENTITY_AUDIT.md) for every supported mapping and the
rationale for excluding identity, raw, and time-of-use setting entities.

The labels and animation directions follow the first-party SolarBridge sign
contract documented below. If another integration uses different signs, use a
Home Assistant template sensor to invert the affected entity.

### Voltage-controlled batteries

Select **Battery voltage** in the editor's Battery details. With SolarBridge's
battery-mode support, the card reads the `battery_mode` attribute from that
entity (or from Battery SOC), so it follows the inverter setting automatically.
Alternatively select **Battery operation mode**, whose state must be `Voltage`,
`Capacity`, or `No battery`. An explicitly selected mode entity takes precedence
over measurement attributes. Without either source, legacy SOC behavior is
preserved; battery chemistry and BMS SOC are never used to guess the mode.

- **Voltage:** shows battery-terminal volts to two decimals, a Voltage mode
  label, and voltage history. The percentage gauge and BMS detail group are
  hidden. No voltage-to-SOC percentage is invented.
- **Capacity:** retains configured aggregate SOC text. Auto retains the existing
  percentage gauge and SOC history when SOC is configured, falling back to
  configured voltage history otherwise. Detailed shows configured voltage
  history independently of the SOC reading; no new SOC or power trend is
  introduced in Compact/Detailed.
- **No battery:** hides the battery node, connector, and level/history section.
- **Unknown/unavailable mode:** keeps configured battery power visible, labels
  the mode unavailable, and hides the level/history rather than showing stale SOC.

Technical details can show **Battery type** and shutdown/restart/low thresholds.
Configure either or both threshold sets; only the active mode's set is shown.
Changing modes selects the matching history entity and discards late responses
for the previous source. Clicking the level/history opens the active voltage or
SOC entity, not a fixed SOC dialog.

Example additions to an existing card (use your actual entity IDs):

```yaml
battery_voltage: sensor.solarbridge_battery_voltage
battery_mode: sensor.solarbridge_battery_operation_mode
battery_type: sensor.solarbridge_battery_type
battery_shutdown_voltage: sensor.solarbridge_battery_shutdown_voltage
battery_restart_voltage: sensor.solarbridge_battery_restart_voltage
battery_low_voltage: sensor.solarbridge_battery_low_voltage
battery_shutdown_soc: sensor.solarbridge_battery_shutdown_soc
battery_restart_soc: sensor.solarbridge_battery_restart_soc
battery_low_soc: sensor.solarbridge_battery_low_soc
```

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
| Inverter power | `inverter_power` | Raw numeric entity state, assumed W. An omitted inverter entity is hidden; a configured entity that is missing, empty, unknown, unavailable, or non-numeric displays as unavailable. |
| Battery power | `battery_power` | Raw signed numeric entity state, assumed W; presentation formatting only. |
| Home power | `load_power` | Raw numeric entity state, assumed W; presentation formatting only. |
| Grid power | `grid_power` | Raw signed numeric entity state, assumed W; presentation formatting only. |
| Battery SOC text | `battery_soc` | Raw numeric entity state with `%` appended. The gauge width clamps this value to 0–100%; the displayed number itself is not clamped. |
| Battery voltage text | `battery_voltage`, when mode is `Voltage` | Raw numeric volts formatted to two decimals with `V` appended, replacing the SOC text. No percentage gauge or derived SOC. |
| Battery SOC · 24h | Recorder history for `battery_soc` | Numeric states returned for the preceding 24 hours plus the current state as a live endpoint. Samples use their actual timestamps on the horizontal axis and are min/max-normalized vertically, then rendered as a smooth 2 px curve with a translucent area fill. History refreshes hourly. This affects only the graph, not the SOC value. |
| Battery voltage · 24h | Recorder history for `battery_voltage`, when mode is `Voltage` | Same time-based plotting as SOC, using voltage samples only; the vertical normalization is not a battery capacity estimate. |
| Solar today | `daily_solar` | Raw current numeric entity state, assumed kWh, rounded to one decimal. It is not calculated from `pv_power` and does not use Recorder statistic `change` or `sum`. |
| Load today | `daily_load` | Raw current numeric entity state, assumed kWh, rounded to one decimal. |
| Imported today | `daily_grid_import` | Raw current numeric entity state, assumed kWh, rounded to one decimal. |
| Exported today | `daily_grid_export` | Raw current numeric entity state, assumed kWh, rounded to one decimal. |

Power presentation uses W rounded to the nearest whole number below 1000 W. Values with an absolute magnitude of at least 1000 W are divided by 1000 and shown in kW with one decimal. Missing, empty (including whitespace-only), unavailable, or otherwise non-numeric states display `—`.

The four essential readings show magnitudes with explicit direction labels.
Inverter power remains signed and is shown only in Detailed or legacy System
detail. Technical rows retain the original signed states and entity units.

History comes only from HA's `history/period` API for the configured battery
entity, with an actual 24-hour time window and hourly refresh. The live state
is appended as the endpoint. Unknown, unavailable and empty history samples
break both the trace and area fill, rather than being filtered out or converted
to zero. HA event history can legitimately be sparse while a value is unchanged;
elapsed time alone is not treated as an outage. Missing Recorder history shows
**No history available**. Detailed enlarges the voltage chart with voltage axes
and local-time timestamps; Compact hides history and Auto preserves its legacy
placement and active battery metric (with voltage history as a fallback when
SOC is not configured). A Capacity-mode update does not remove a configured
Detailed voltage chart or switch its source to SOC. No example trace is shipped
in the card.

Editor sections retain their open/closed state and focused controls when an
entity selection is saved back into the editor. The card's technical groups
also retain user expansion choices across live updates and configuration edits.

### Power signs and status labels

For entities from `ha-solarbridge`, the card interprets raw power states as
follows. Values with an absolute magnitude below 1 W use the zero/near-zero
label and hide the moving stripe.

| Node | Positive value | Negative value | Zero/near-zero |
| --- | --- | --- | --- |
| Solar | Generating; solar → inverter | Reverse flow; inverter → solar | Idle |
| Inverter | Supplying AC | Absorbing AC | Standby |
| Grid | Importing; grid → inverter | Exporting; inverter → grid | Idle |
| Battery | Discharging; battery → inverter | Charging; inverter → battery | Idle |
| Home/load | Consuming; inverter → home | Reverse flow; home → inverter | Idle |

`Supplying` deliberately does not imply that the inverter's energy came from
PV: it may be converting battery power or passing through grid power. Missing
values are labelled **Unavailable**. All presentations use these same raw signs
for direction, with no polarity overrides or inferred source allocations.

Flow animation is derived from each raw power value:

- A line is active when the absolute value is at least 1 W.
- A seamless 68 SVG-unit dash traversal takes `1800 / abs(power)` seconds, clamped to 0.45–3 seconds, so greater magnitude moves faster.
- Positive PV, battery, and load values use the forward direction; negative values reverse it. Grid direction is intentionally inverted: positive uses the reverse direction and negative uses forward.
- Static arrowheads and animation use the same direction decision. Minimal uses the same state labels and signs for its source contributions.
- Rates are applied to the actual current browser animation, including animations recreated after dashboard hiding/reconnection; no cached connector rate can leave charging moving in the discharging direction.
- Reduced-motion preferences disable movement while preserving static arrows, labels and active/inactive indication. Zero and unavailable power disable directional indicators.

Status labels are visible in all three styles, including Compact.

The four daily entities should already represent today's accumulating totals and reset according to their source integration. The card performs no summing, subtraction, normalization, sign adjustment, or unit conversion on them.

## Development

```bash
npm test
npm run check
```

The dependency-free browser fixture uses real headless Chrome (`CHROME_BIN`
overrides `/usr/bin/google-chrome`) with mocked HA states/history, including the
captured example. `npm test` covers both legacy views, light/dark, card widths
284–760 px, every Compact/Detailed × flow-style combination, reduced motion,
partial details, localStorage, history gaps, mode changes and animation
recreation. This is not a live Home Assistant integration test.

For visual review, serve the repository and open
`test/render-fixture.html?view=system&battery=voltage&display=detailed&style=hub&theme=dark&width=354`.
Use `display=compact`, `style=minimal|horizontal`, and
`scenario=night|export|unavailable|zero` for other fixture states. Fixture chart
data is illustrative; production always requests HA history.

The visual direction is original and inspired by—not copied from—the dashboards in `heavenknows1978/hass-deyecloud` and `harunmahfud/hass-deyecloud`.
