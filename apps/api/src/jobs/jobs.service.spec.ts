import assert from "node:assert/strict";
import test from "node:test";
import { isFullyIssuedJob } from "./jobs.service.js";

const jobId = "job-1";
const firstCharge = { id: "charge-1", job_id: jobId };
const secondCharge = { id: "charge-2", job_id: jobId };
const issuedInvoice = { id: "invoice-issued", status: "ISSUED" };
const draftInvoice = { id: "invoice-draft", status: "DRAFT" };

void test("a job without charges remains active", () => {
  assert.equal(isFullyIssuedJob(jobId, [], [], []), false);
});

void test("a job with an unallocated charge remains active", () => {
  assert.equal(isFullyIssuedJob(jobId, [firstCharge], [], []), false);
});

void test("a job linked only to a draft invoice remains active", () => {
  assert.equal(
    isFullyIssuedJob(jobId, [firstCharge], [{ job_charge_id: firstCharge.id, invoice_id: draftInvoice.id }], [draftInvoice]),
    false
  );
});

void test("a partially issued job remains active", () => {
  assert.equal(
    isFullyIssuedJob(
      jobId,
      [firstCharge, secondCharge],
      [{ job_charge_id: firstCharge.id, invoice_id: issuedInvoice.id }],
      [issuedInvoice]
    ),
    false
  );
});

void test("a job leaves the active list when every charge is on an issued invoice", () => {
  assert.equal(
    isFullyIssuedJob(
      jobId,
      [firstCharge, secondCharge],
      [
        { job_charge_id: firstCharge.id, invoice_id: issuedInvoice.id },
        { job_charge_id: secondCharge.id, invoice_id: issuedInvoice.id }
      ],
      [issuedInvoice]
    ),
    true
  );
});
