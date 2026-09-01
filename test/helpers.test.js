import test from "node:test";
import assert from "node:assert/strict";
import { flowDuration, formatPower, numericState, sparklinePaths } from "../helpers.js";

test("reads numeric entity state safely", () => {
  assert.equal(numericState({states:{"sensor.pv":{state:"1234"}}}, "sensor.pv"), 1234);
  assert.equal(numericState({states:{"sensor.pv":{state:"-12.5"}}}, "sensor.pv"), -12.5);
  for (const state of [undefined, "unknown", "unavailable", "", "   "]) {
    const hass = state === undefined ? { states: {} } : { states: { "sensor.pv": { state } } };
    assert.equal(numericState(hass, "sensor.pv"), null);
  }
});

test("formats power and bounds animation duration", () => {
  assert.equal(formatPower(1200), "1.2 kW");
  assert.equal(formatPower(-40), "-40 W");
  assert.equal(flowDuration(0), 0);
  assert.ok(flowDuration(10000) >= 0.45);
  assert.ok(flowDuration(1) <= 3);
});

test("creates smooth, time-based sparkline paths", () => {
  assert.deepEqual(sparklinePaths([]), { line: "", area: "" });
  const paths = sparklinePaths([
    { value: 20, time: 100 },
    { value: 30, time: 125 },
    { value: 40, time: 200 },
  ], 100, 20, 100, 200);
  assert.equal(paths.line, "M 2.0 18.0 C 11.6 18.0 16.4 10.0 26.0 10.0 C 54.8 10.0 69.2 2.0 98.0 2.0");
  assert.equal(paths.area, `${paths.line} L 98.0 20 L 2.0 20 Z`);
});
