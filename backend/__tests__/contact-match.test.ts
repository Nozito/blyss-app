import { describe, it, expect } from "vitest";
import { classifyContact, normalizePhone, normalizeEmail } from "../lib/contact-match";

describe("classifyContact — walk-in exact contact resolution", () => {
  it("reconnaît un email et le normalise en minuscules", () => {
    expect(classifyContact("  Alice.Martin@Example.COM ")).toEqual({
      kind: "email",
      value: "alice.martin@example.com",
    });
  });

  it("reconnaît un téléphone et retire les séparateurs", () => {
    expect(classifyContact("06 12 34 56 78")).toEqual({ kind: "phone", value: "0612345678" });
    expect(classifyContact("+33 6.12-34-56-78")).toEqual({ kind: "phone", value: "+33612345678" });
  });

  it("rejette un nom ou un fragment", () => {
    expect(classifyContact("Alice")).toBeNull();
    expect(classifyContact("Mart")).toBeNull();
    expect(classifyContact("")).toBeNull();
    expect(classifyContact("   ")).toBeNull();
  });

  it("rejette un email mal formé (fragment avec @)", () => {
    expect(classifyContact("alice@")).toBeNull();
    expect(classifyContact("@martin")).toBeNull();
  });

  it("rejette une suite de chiffres trop courte pour être un numéro", () => {
    expect(classifyContact("12345")).toBeNull();
  });

  it("rejette autre chose qu'une chaîne", () => {
    expect(classifyContact(undefined)).toBeNull();
    expect(classifyContact(42)).toBeNull();
    expect(classifyContact(null)).toBeNull();
  });

  it("normalisations exposées", () => {
    expect(normalizePhone("(06) 12-34-56-78")).toBe("0612345678");
    expect(normalizeEmail("  A@B.C ")).toBe("a@b.c");
  });
});
