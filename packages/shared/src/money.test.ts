import { describe, expect, it } from "vitest";
import { formatPaise, paiseToRupees, rupeesToPaise } from "./money.js";

describe("rupeesToPaise", () => {
  it("converts whole and fractional rupees", () => {
    expect(rupeesToPaise(450)).toBe(45000);
    expect(rupeesToPaise(120.5)).toBe(12050);
  });

  it("rounds float noise to the nearest paisa", () => {
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(rupeesToPaise(19.999)).toBe(2000);
  });

  it("rejects non-finite input", () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => rupeesToPaise(Infinity)).toThrow(RangeError);
  });
});

describe("paiseToRupees", () => {
  it("converts back", () => {
    expect(paiseToRupees(45000)).toBe(450);
  });

  it("rejects fractional paise", () => {
    expect(() => paiseToRupees(10.5)).toThrow(RangeError);
  });
});

describe("formatPaise", () => {
  it("uses Indian digit grouping and drops .00", () => {
    expect(formatPaise(5_000_000)).toBe("₹50,000");
    expect(formatPaise(20_000_000)).toBe("₹2,00,000");
  });

  it("keeps paise when present", () => {
    expect(formatPaise(12050)).toBe("₹120.50");
    expect(formatPaise(12005)).toBe("₹120.05");
  });

  it("formats advance balances (negative due)", () => {
    expect(formatPaise(-45000)).toBe("-₹450");
  });
});
