import { describe, it, expect } from "vitest";
import { assertNoExchangeRuntime, findProhibitedExchangeRoutes } from "@aix/foundation";

describe("no Exchange runtime guard (§5.7, §11)", () => {
  it("flags prohibited exchange surfaces", () => {
    const hits = findProhibitedExchangeRoutes([
      "/foundation/health",
      "/trade/order-book",
      "/market-maker/quote",
      "/exchange/match",
    ]);
    expect(hits).toContain("/trade/order-book");
    expect(hits).toContain("/market-maker/quote");
    expect(hits).toContain("/exchange/match");
    expect(hits).not.toContain("/foundation/health");
  });

  it("passes clean foundation routes", () => {
    expect(() =>
      assertNoExchangeRuntime([
        "/foundation/health",
        "/foundation/modules",
        "/foundation/scheduler/jobs",
      ]),
    ).not.toThrow();
  });

  it("throws when an exchange route is present", () => {
    expect(() => assertNoExchangeRuntime(["/foundation/health", "/orderbook/depth"])).toThrowError(
      /MODULE_BOUNDARY_VIOLATION/,
    );
  });
});
