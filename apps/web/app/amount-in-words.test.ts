import assert from "node:assert/strict";
import test from "node:test";
import { aedAmountInWords } from "./amount-in-words";

test("writes AED totals with fils", () => {
  assert.equal(
    aedAmountInWords("75542.50"),
    "Seventy-Five Thousand Five Hundred Forty-Two Dirhams and Fifty Fils Only",
  );
});

test("handles zero and singular dirham", () => {
  assert.equal(aedAmountInWords(0), "Zero Dirhams Only");
  assert.equal(aedAmountInWords(1.01), "One Dirham and One Fils Only");
});

test("handles million values", () => {
  assert.equal(
    aedAmountInWords(1_000_000.25),
    "One Million Dirhams and Twenty-Five Fils Only",
  );
});
