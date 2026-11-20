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

test("history gaps break both trace and fill without inventing zero volts", () => {
  const paths = sparklinePaths([
    { value: 48, time: 0 }, { value: 52, time: 20 },
    { value: null, time: 40 }, { value: "unavailable", time: 50 },
    { value: 50, time: 80 }, { value: 49, time: 100 },
  ], 104, 24, 0, 100);
  assert.equal(paths.line, "M 2.0 22.0 C 10.0 22.0 14.0 2.0 22.0 2.0 M 82.0 12.0 C 90.0 12.0 94.0 17.0 102.0 17.0");
  assert.equal((paths.area.match(/ Z/g) || []).length, 2);
  assert.deepEqual(sparklinePaths([{ value: null, time: 0 }, { value: "", time: 1 }]), { line: "", area: "" });
});
