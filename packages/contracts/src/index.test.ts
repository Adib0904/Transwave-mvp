import assert from "node:assert/strict";
import test from "node:test";
import { calculateLineAmounts, createDraftSchema, createManagedUserSchema, normalizeServiceName } from "./index.js";

test("calculates net, VAT and total using line-first monetary rounding", () => {
  assert.deepEqual(calculateLineAmounts("1", "3200.00", "5"), {
    netAmount: "3200.00",
    vatAmount: "160.00",
    totalAmount: "3360.00"
  });
  assert.deepEqual(calculateLineAmounts("0.333", "10.00", "5"), {
    netAmount: "3.33",
    vatAmount: "0.17",
    totalAmount: "3.50"
  });
});

test("normalizes service identity and rejects duplicate draft charge ids", () => {
  assert.equal(normalizeServiceName("  LAND   Transport "), "land transport");
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(createDraftSchema.safeParse({ jobId: id, chargeIds: [id, id] }).success, false);
});

test("validates managed portal users and strong temporary passwords", () => {
  assert.equal(createManagedUserSchema.safeParse({ email: "new@transwave.local", name: "New User", role: "OPERATIONS", temporaryPassword: "Temporary123!" }).success, true);
  assert.equal(createManagedUserSchema.safeParse({ email: "invalid", name: "N", role: "POWER_USER", temporaryPassword: "short" }).success, false);
});
