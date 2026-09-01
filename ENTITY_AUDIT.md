# SolarBridge entity audit

This inventory was traced against the `deye_sg05lp1_eu_sm2_p` profile in
`harunmahfud/ha-solarbridge`, the integration's generic profile-driven sensor
creation, and its English entity translations at `ha-solarbridge` v0.1.9. The
audited profile exposes 80 entities: 48 live or accumulated system metrics
supported by this card and 32 identity, raw, or time-of-use diagnostics
deliberately not offered as card fields.

The card does not depend on generated Home Assistant entity IDs. Users select
entities explicitly, so the table maps integration profile keys to card
configuration fields.

## Supported system metrics (48)

All values below are raw Home Assistant entity states. The card does not sum
PV strings, derive a power balance, adjust signs, or convert units. The
Overview presentation formats its configured numeric W/kWh/% states as
described in the README. System detail prints each configured entity state and
its `unit_of_measurement` attribute without numeric transformation.

For first-party SolarBridge power entities, positive battery power means
discharging, positive grid power means importing, and positive inverter power
means supplying AC. Negative values mean charging, exporting, and absorbing,
respectively. The README contains the complete node label/direction table.

| SolarBridge profile key | Card field | Presentation |
| --- | --- | --- |
| `running_status` | `running_status` | System detail · Inverter |
| `daily_battery_charge` | `daily_battery_charge` | System detail · Battery |
| `daily_battery_discharge` | `daily_battery_discharge` | System detail · Battery |
| `total_battery_charge` | `total_battery_charge` | System detail · Battery |
| `total_battery_discharge` | `total_battery_discharge` | System detail · Battery |
| `daily_grid_bought` | `daily_grid_import` | Overview summary (also remains visible in System detail) |
| `daily_grid_sold` | `daily_grid_export` | Overview summary (also remains visible in System detail) |
| `grid_frequency` | `grid_frequency` | System detail · Grid and load |
| `total_grid_bought` | `total_grid_import` | System detail · Lifetime energy |
| `total_grid_sold` | `total_grid_export` | System detail · Lifetime energy |
| `daily_load_consumption` | `daily_load` | Overview summary (also remains visible in System detail) |
| `total_load_consumption` | `total_load` | System detail · Lifetime energy |
| `dc_temperature` | `dc_temperature` | System detail · Inverter |
| `ac_temperature` | `ac_temperature` | System detail · Inverter |
| `total_production` | `total_solar` | System detail · Lifetime energy |
| `daily_production` | `daily_solar` | Overview summary (also remains visible in System detail) |
| `grid_voltage` | `grid_voltage` | System detail · Grid and load |
| `inverter_output_voltage` | `inverter_voltage` | System detail · Inverter |
| `load_voltage` | `load_voltage` | System detail · Grid and load |
| `grid_current` | `grid_current` | System detail · Grid and load |
| `inverter_current` | `inverter_current` | System detail · Inverter |
| `aux_port_power` | `aux_power` | System detail · AUX |
| `internal_ct_power` | `internal_ct_power` | System detail · Grid and load |
| `grid_power` | `grid_power` | Overview flow topology |
| `external_ct_power` | `external_ct_power` | System detail · Grid and load |
| `inverter_power` | `inverter_power` | Overview flow topology |
| `load_power` | `load_power` | Overview flow topology |
| `battery_temperature` | `battery_temperature` | System detail · Battery |
| `battery_voltage` | `battery_voltage` | System detail · Battery |
| `battery_soc` | `battery_soc` | Overview node, gauge, and history |
| `pv1_power` | `pv_power` and/or `pv1_power` | Overview flow topology and/or System detail · Solar strings |
| `pv2_power` | `pv2_power` | System detail · Solar strings |
| `battery_power` | `battery_power` | Overview flow topology |
| `battery_current` | `battery_current` | System detail · Battery |
| `load_frequency` | `load_frequency` | System detail · Grid and load |
| `grid_connected_status` | `grid_status` | System detail · Grid and load |
| `pv1_voltage` | `pv1_voltage` | System detail · Solar strings |
| `pv1_current` | `pv1_current` | System detail · Solar strings |
| `pv2_voltage` | `pv2_voltage` | System detail · Solar strings |
| `pv2_current` | `pv2_current` | System detail · Solar strings |
| `bms_charging_voltage` | `bms_charging_voltage` | System detail · Battery management system |
| `bms_discharge_voltage` | `bms_discharge_voltage` | System detail · Battery management system |
| `bms_charge_current_limit` | `bms_charge_current_limit` | System detail · Battery management system |
| `bms_discharge_current_limit` | `bms_discharge_current_limit` | System detail · Battery management system |
| `bms_soc` | `bms_soc` | System detail · Battery management system |
| `bms_voltage` | `bms_voltage` | System detail · Battery management system |
| `bms_current` | `bms_current` | System detail · Battery management system |
| `bms_temperature` | `bms_temperature` | System detail · Battery management system |

The BMS voltage is reported by the battery management system and is distinct
from `battery_voltage`, which is measured at the inverter battery terminals.
The card therefore exposes both as separate fields and does not substitute one
for the other.

`pv_power` is an explicitly selected topology input, not an integration
profile key. The current SolarBridge profile has separate `pv1_power` and
`pv2_power` entities but no verified aggregate PV power register. Selecting
`pv1_power` for `pv_power`, as in the example, displays only that raw string
value; the card never silently adds PV1 and PV2.

## Deliberately excluded entities (32)

| SolarBridge profile keys | Count | Reason |
| --- | ---: | --- |
| `inverter_id` | 1 | Device identity/diagnostic metadata, not a changing power-flow metric. |
| `aux_status_raw` | 1 | Uninterpreted diagnostic register; presenting it as a user-facing state would imply semantics the profile has not verified. |
| `tou_time_1`, `tou_time_2`, `tou_time_3`, `tou_time_4`, `tou_time_5`, `tou_time_6` | 6 | Time-of-use schedule settings, not current system measurements. |
| `tou_power_1`, `tou_power_2`, `tou_power_3`, `tou_power_4`, `tou_power_5`, `tou_power_6` | 6 | Time-of-use schedule targets, not current power measurements. |
| `tou_soc_1`, `tou_soc_2`, `tou_soc_3`, `tou_soc_4`, `tou_soc_5`, `tou_soc_6` | 6 | Time-of-use schedule targets, not current battery measurements. |
| `tou_1_grid_charge`, `tou_1_generator_charge`, `tou_2_grid_charge`, `tou_2_generator_charge`, `tou_3_grid_charge`, `tou_3_generator_charge`, `tou_4_grid_charge`, `tou_4_generator_charge`, `tou_5_grid_charge`, `tou_5_generator_charge`, `tou_6_grid_charge`, `tou_6_generator_charge` | 12 | Time-of-use enable flags/settings, not current system measurements. |

These entities remain available in Home Assistant for diagnostics and other
cards. Exclusion here only keeps the power-flow card focused on live and
accumulated system measurements; it does not hide or change integration
entities.
