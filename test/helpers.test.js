import test from "node:test";
import assert from "node:assert/strict";
import { flowDuration, formatPower, numericState, sparklinePoints } from "../helpers.js";

test("reads numeric entity state safely", () => {
  assert.equal(numericState({states:{"sensor.pv":{state:"1234"}}}, "sensor.pv"), 1234);
  assert.equal(numericState({states:{}}, "sensor.pv"), null);
});

test("formats power and bounds animation duration", () => {
  assert.equal(formatPower(1200), "1.2 kW");
  assert.equal(formatPower(-40), "-40 W");
  assert.equal(flowDuration(0), 0);
  assert.ok(flowDuration(10000) >= 0.45);
  assert.ok(flowDuration(1) <= 3);
});

test("creates bounded sparkline points", () => {
  assert.equal(sparklinePoints([]), "");
  assert.equal(sparklinePoints([20, 40], 100, 20), "0.0,20.0 100.0,0.0");
});
