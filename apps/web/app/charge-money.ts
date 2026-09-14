export type ChargeCurrency = "AED" | "USD";

export function chargeAmounts(
  quantity: number,
  unitRate: number,
  exchangeRate: number,
  taxRate: number,
) {
  const foreignAmount = quantity * unitRate;
  const netAed = Math.round(foreignAmount * exchangeRate * 100) / 100;
  const vatAed = Math.round(netAed * taxRate) / 100;
  return { foreignAmount, netAed, vatAed, totalAed: netAed + vatAed };
}

export function formatChargeRate(currency: string, value: string | number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(
    Number(value),
  );
}
