const assert = require("node:assert/strict");

function chargeAmounts(quantity, unitRate, exchangeRate, taxRate) {
  const foreignAmount = quantity * unitRate;
  const netAed = Math.round(foreignAmount * exchangeRate * 100) / 100;
  const vatAed = Math.round(netAed * taxRate) / 100;
  return { foreignAmount, netAed, vatAed, totalAed: netAed + vatAed };
}

assert.deepEqual(chargeAmounts(2, 100, 3.6725, 5), {
  foreignAmount: 200,
  netAed: 734.5,
  vatAed: 36.73,
  totalAed: 771.23
});
assert.deepEqual(chargeAmounts(4, 2000, 3.685, 0), {
  foreignAmount: 8000,
  netAed: 29480,
  vatAed: 0,
  totalAed: 29480
});
assert.deepEqual(chargeAmounts(3, 50, 1, 0), {
  foreignAmount: 150,
  netAed: 150,
  vatAed: 0,
  totalAed: 150
});

console.log("charge money tests passed");
