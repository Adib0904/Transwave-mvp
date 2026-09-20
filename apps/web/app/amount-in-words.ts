const small = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(value: number): string {
  const words: string[] = [];
  if (value >= 100) {
    words.push(`${small[Math.floor(value / 100)]} Hundred`);
    value %= 100;
  }
  if (value >= 20) {
    const remainder = value % 10;
    words.push(`${tens[Math.floor(value / 10)]}${remainder ? `-${small[remainder]}` : ""}`);
  } else if (value > 0) {
    words.push(small[value]);
  }
  return words.join(" ");
}

function integerInWords(value: number): string {
  if (value === 0) return small[0];
  const scales = [
    { value: 1_000_000_000, name: "Billion" },
    { value: 1_000_000, name: "Million" },
    { value: 1_000, name: "Thousand" },
  ];
  const words: string[] = [];
  for (const scale of scales) {
    if (value >= scale.value) {
      words.push(`${belowThousand(Math.floor(value / scale.value))} ${scale.name}`);
      value %= scale.value;
    }
  }
  if (value) words.push(belowThousand(value));
  return words.join(" ");
}

export function aedAmountInWords(value: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "Amount unavailable";
  const filsTotal = Math.round(numeric * 100);
  const dirhams = Math.floor(filsTotal / 100);
  const fils = filsTotal % 100;
  const dirhamLabel = dirhams === 1 ? "Dirham" : "Dirhams";
  const filsText = fils ? ` and ${integerInWords(fils)} Fils` : "";
  return `${integerInWords(dirhams)} ${dirhamLabel}${filsText} Only`;
}
