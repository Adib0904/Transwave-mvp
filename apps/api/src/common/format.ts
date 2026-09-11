export function decimal(value: number): string {
  return String(value);
}

export function money(value: number): string {
  return Number(value).toFixed(2);
}
