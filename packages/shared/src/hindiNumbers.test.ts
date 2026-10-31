import { describe, expect, it } from "vitest";
import { parseAmountRupees, parseHindiNumberWords } from "./hindiNumbers.js";

describe("parseHindiNumberWords", () => {
  it.each([
    [["bees"], 20],
    [["pachees"], 25],
    [["ninyanve"], 99],
    [["ek", "sau", "bees"], 120],
    [["sau"], 100],
    [["barah", "sau"], 1200],
    [["do", "hazaar", "paanch", "sau"], 2500],
    [["dedh", "sau"], 150],
    [["dhai", "sau"], 250],
    [["sawa", "sau"], 125],
    [["saade", "teen", "sau"], 350],
    [["paune", "do", "sau"], 175],
    [["dedh", "hazaar"], 1500],
    [["saade", "das"], 10.5],
    [["ek", "lakh"], 100_000],
  ])("%j → %d", (words, expected) => {
    expect(parseHindiNumberWords(words)).toBe(expected);
  });

  it("rejects non-number words", () => {
    expect(parseHindiNumberWords(["ek", "chawal"])).toBeNull();
    expect(parseHindiNumberWords(["sawa"])).toBeNull();
  });
});

describe("parseAmountRupees — F1.2 utterances", () => {
  it.each([
    ["Gupta ji, do kilo chawal, 120 udhaar", 120],
    ["Sharma ji ne 300 jama kiye", 300],
    ["Naya customer Meena didi, 80 ka udhaar", 80],
    ["Ek sau bees Verma ji ke naam likho", 120],
  ])("%s → %d", (utterance, expected) => {
    expect(parseAmountRupees(utterance)).toBe(expected);
  });

  it("finds no amount in a delete command", () => {
    expect(parseAmountRupees("Gupta ji ka last entry hata do")).toBeNull();
  });
});

describe("parseAmountRupees — formats", () => {
  it.each([
    ["Gupta ji 450/-", 450],
    ["₹1,200 jama", 1200],
    ["rs 75 udhaar", 75],
    ["Khan sahab ne dedh sau rupaye diye", 150],
    ["Meena didi saade teen sau", 350],
    ["2 kilo aata aur 1 packet maggi, kul 140", 140],
    ["ek packet doodh aur dhai sau udhaar", 250],
    ["do rupaye", 2],
    ["Gupta ji ke saath pachas", 50],
    ["99.50 rupees", 99.5],
  ])("%s → %d", (utterance, expected) => {
    expect(parseAmountRupees(utterance)).toBe(expected);
  });

  it.each(["Gupta ji ka hisaab dikhao", "ek baat batao", "do kilo chawal"])("%s → null", (utterance) => {
    expect(parseAmountRupees(utterance)).toBeNull();
  });
});
