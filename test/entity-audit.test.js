import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const supported = [
  "running_status", "daily_battery_charge", "daily_battery_discharge", "total_battery_charge",
  "total_battery_discharge", "daily_grid_bought", "daily_grid_sold", "grid_frequency",
  "total_grid_bought", "total_grid_sold", "daily_load_consumption", "total_load_consumption",
  "dc_temperature", "ac_temperature", "total_production", "daily_production", "grid_voltage",
  "inverter_output_voltage", "load_voltage", "grid_current", "inverter_current", "aux_port_power",
  "internal_ct_power", "grid_power", "external_ct_power", "inverter_power", "load_power",
  "battery_temperature", "battery_voltage", "battery_soc", "pv1_power", "pv2_power", "battery_power",
  "battery_current", "load_frequency", "grid_connected_status", "pv1_voltage", "pv1_current",
  "pv2_voltage", "pv2_current", "bms_charging_voltage", "bms_discharge_voltage",
  "bms_charge_current_limit", "bms_discharge_current_limit", "bms_soc", "bms_voltage", "bms_current",
  "bms_temperature",
];

const excluded = [
  "inverter_id", "aux_status_raw",
  ...Array.from({ length: 6 }, (_, index) => `tou_time_${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `tou_power_${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `tou_soc_${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => [`tou_${index + 1}_grid_charge`, `tou_${index + 1}_generator_charge`]).flat(),
];

test("entity audit accounts for the complete SolarBridge profile", async () => {
  const audit = await readFile(new URL("../ENTITY_AUDIT.md", import.meta.url), "utf8");
  const inventory = [...supported, ...excluded];

  assert.equal(supported.length, 48);
  assert.equal(excluded.length, 32);
  assert.equal(new Set(inventory).size, 80);
  for (const key of inventory) assert.match(audit, new RegExp(`\\b${key}\\b`), `${key} is documented`);
});
