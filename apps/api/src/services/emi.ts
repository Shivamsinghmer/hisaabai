// §14: standard reducing-balance EMI. Pure and unit-tested against known
// values; offers store money in paise (§10).
export function emiPaise(principalPaise: number, annualRatePct: number, months: number): number {
  if (months <= 0) return principalPaise;
  const r = annualRatePct / 12 / 100;
  if (r <= 0) return Math.round(principalPaise / months);
  const growth = Math.pow(1 + r, months);
  return Math.round((principalPaise * r * growth) / (growth - 1));
}
