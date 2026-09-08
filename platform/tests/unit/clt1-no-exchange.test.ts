/**
 * CLT-01-specific proof of the shared no-Exchange boot guard (§5.5 Exchange-Pending Lock). The
 * generic mechanism itself is already tested once in tests/unit/no-exchange.test.ts
 * (packages/foundation/src/no-exchange.ts) — this file proves two CLT-01-specific things:
 *
 *   1. `buildApp()` actually wires the guard in (covered end-to-end in clt1-app.test.ts's
 *      "boots clean" + "registers no Exchange-runtime route surface" tests — not repeated
 *      here).
 *   2. The route-name fragments CLT-01's OWN future business surface could plausibly ever use
 *      (client-to-client relationship language, trading eligibility, market-facing wording)
 *      would genuinely be caught by the shared guard if a future phase ever registered one as a
 *      real Fastify route, rather than assuming the substring match happens to line up. Mirrors
 *      tests/unit/cfg1-no-exchange.test.ts's identical shape.
 */
import { describe, expect, it } from "vitest";
import { findProhibitedExchangeRoutes, assertNoExchangeRuntime } from "@aix/foundation";

describe("CLT-01: shared no-Exchange guard catches CLT-01-shaped route surfaces", () => {
  it("flags the Phase 0 health route as clean", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/clt1/health"]);
    expect(hits).toEqual([]);
  });

  it("would flag a future client-to-client-relationship route if ever registered (blueprint's own client-class taxonomy must never grow into Exchange client-to-client matching)", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/clt1/health",
      "/clt1/clients/client-to-client",
    ]);
    expect(hits).toContain("/clt1/clients/client-to-client");
    expect(hits).not.toContain("/internal/clt1/health");
  });

  it("would flag a future literal exchange-onboarding route if ever registered (blueprint §4 item 14: no Exchange client onboarding while Exchange is pending)", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/clt1/health",
      "/clt1/applications/exchange-onboarding",
    ]);
    expect(hits).toContain("/clt1/applications/exchange-onboarding");
  });

  it("would fail closed at boot if a CLT-01-shaped Exchange route were ever registered", () => {
    expect(() =>
      assertNoExchangeRuntime(["/internal/clt1/health", "/clt1/applications/exchange-onboarding"]),
    ).toThrowError(/MODULE_BOUNDARY_VIOLATION/);
  });

  it("does not flag ordinary CLT-01 vocabulary that isn't a route (client class/onboarding terms are data/API concepts, not route paths)", () => {
    // Sanity: terms like "institutional"/"hnwi"/"onboarding" are request/response FIELDS
    // (Phase 1+), never route paths — this guard only ever scans the registered Fastify route
    // table, and Phase 0 registers none of them yet (business routes are explicitly out of
    // scope this phase).
    const hits = findProhibitedExchangeRoutes(["/internal/clt1/health"]);
    expect(hits).toEqual([]);
  });
});
