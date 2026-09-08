import { describe, it, expect } from "vitest";
import { fingerprint } from "@aix/foundation";

describe("idempotency fingerprint (§3.7)", () => {
  it("is stable regardless of key order", () => {
    const a = fingerprint({ amount: 100, currency: "USD", to: "acc_1" });
    const b = fingerprint({ to: "acc_1", currency: "USD", amount: 100 });
    expect(a).toBe(b);
  });

  it("differs when payload differs", () => {
    const a = fingerprint({ amount: 100, currency: "USD" });
    const b = fingerprint({ amount: 101, currency: "USD" });
    expect(a).not.toBe(b);
  });

  it("handles nested + array structures deterministically", () => {
    const a = fingerprint({ items: [{ x: 1 }, { y: 2 }], meta: { a: 1, b: 2 } });
    const b = fingerprint({ meta: { b: 2, a: 1 }, items: [{ x: 1 }, { y: 2 }] });
    expect(a).toBe(b);
  });
});
