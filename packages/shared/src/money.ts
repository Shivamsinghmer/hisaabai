// Money is integer paise everywhere (DB and APIs). Convert only at the edges.

// Whole rupees print without decimals; anything with paise prints two digits.
const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new RangeError(`Invalid rupee amount: ${rupees}`);
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  if (!Number.isSafeInteger(paise)) throw new RangeError(`Paise must be a safe integer: ${paise}`);
  return paise / 100;
}

/** 4500000 → "₹45,000", 12050 → "₹120.50" (Indian digit grouping). */
export function formatPaise(paise: number): string {
  const rupees = paiseToRupees(paise);
  return (paise % 100 === 0 ? inrWhole : inrPaise).format(rupees);
}
