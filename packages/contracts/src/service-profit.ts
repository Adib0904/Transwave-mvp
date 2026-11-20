/** Invoice totals are already extended amounts; only agent rates use containers. */
export function invoiceProfitTotals(customerTotal: number, vendorTotal: number | null, commissionTotal: number | null) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const totalProfit = vendorTotal === null ? null : round(customerTotal - vendorTotal);
  return {
    totalProfit,
    pureProfit: totalProfit === null || commissionTotal === null ? null : round(totalProfit - commissionTotal),
  };
}
