import { describe, expect, it } from "vitest";
import { matchCustomer } from "../src/capture/matchCustomer.js";

const c = (id: string, name: string, aliases: string[] = []) => ({ id, name, aliases });
const shop = [
  c("gupta", "Gupta ji", ["Gupta jee", "Suresh Gupta"]),
  c("verma", "Verma ji", ["Anil Verma"]),
  c("khan", "Khan sahab", ["Khan saab", "Imran Khan"]),
  c("meena", "Meena didi", ["Meena di"]),
];

describe("matchCustomer", () => {
  it.each([
    ["Gupta ji", "gupta"],
    ["gupta jee", "gupta"],
    ["Guptaji", "gupta"],
    ["Suresh Gupta", "gupta"],
    ["Verma", "verma"],
    ["Khan saab", "khan"],
    ["Imran Khan", "khan"],
    ["meena di", "meena"],
  ])("%s → %s", (spoken, id) => {
    const r = matchCustomer(spoken, shop);
    expect(r.kind).toBe("match");
    if (r.kind === "match") expect(r.customer.id).toBe(id);
  });

  it("asks when two customers fit equally (F1.2)", () => {
    const r = matchCustomer("Gupta ji", [c("r", "Ramesh Gupta"), c("s", "Suresh Gupta")]);
    expect(r.kind).toBe("ambiguous");
  });

  it("finds nobody for a new name", () => {
    expect(matchCustomer("Rahul bhaiya", shop).kind).toBe("none");
  });
});
