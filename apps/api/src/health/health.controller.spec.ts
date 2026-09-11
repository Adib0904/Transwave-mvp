import assert from "node:assert/strict";
import test from "node:test";
import { HealthController } from "./health.controller.js";

void test("reports the API as live", () => {
  assert.deepEqual(new HealthController().liveness(), { status: "ok", service: "transwave-api" });
});
