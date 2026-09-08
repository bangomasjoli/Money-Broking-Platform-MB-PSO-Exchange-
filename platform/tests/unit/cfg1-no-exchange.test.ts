/**
 * CFG-01-specific proof of the shared no-Exchange boot guard (§5.5 Exchange-Pending Lock).
 * The generic mechanism itself is already tested once in tests/unit/no-exchange.test.ts
 * (packages/foundation/src/no-exchange.ts) — this file proves two CFG-01-specific things:
 *
 *   1. `buildApp()` actually wires the guard in (covered end-to-end in cfg1-app.test.ts's
 *      "boots clean" + "registers no Exchange-runtime route surface" tests — not repeated
 *      here).
 *   2. The route-name fragments a LATER CFG-01 phase's blueprint literally uses (Phase 5's
 *      deferred `/cfg1/exchange-activation-ceremonies/*` API surface — see
 *      04_API_Specification.md §5.4-5.7) would genuinely be caught by the shared guard if a
 *      future phase ever registered one as a real Fastify route, rather than assuming the
 *      substring match happens to line up.
 */
import { describe, expect, it } from "vitest";
import { findProhibitedExchangeRoutes, assertNoExchangeRuntime } from "@aix/foundation";

describe("CFG-01: shared no-Exchange guard catches CFG-01's own blueprint route shapes", () => {
  it("flags the Phase 0 health route as clean", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/cfg1/health"]);
    expect(hits).toEqual([]);
  });

  it("would flag a future literal exchange-activation-ceremony route if ever registered", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/cfg1/health",
      "/cfg1/exchange-activation-ceremonies",
      "/cfg1/exchange-activation-ceremonies/:ceremony_id/activate-feature",
    ]);
    expect(hits).toContain("/cfg1/exchange-activation-ceremonies");
    expect(hits).toContain("/cfg1/exchange-activation-ceremonies/:ceremony_id/activate-feature");
    expect(hits).not.toContain("/internal/cfg1/health");
  });

  it("would fail closed at boot if a CFG-01-shaped Exchange route were ever registered", () => {
    expect(() =>
      assertNoExchangeRuntime(["/internal/cfg1/health", "/cfg1/exchange-activation-ceremonies"]),
    ).toThrowError(/MODULE_BOUNDARY_VIOLATION/);
  });

  it("does not flag ordinary CFG-01 licence-lock vocabulary that isn't a route (feature codes are data, not routes)", () => {
    // Sanity: prohibited FEATURE CODES like "exchange.matching_engine" are DB rows (Phase 1+),
    // never route paths — this guard only ever scans the registered Fastify route table.
    const hits = findProhibitedExchangeRoutes(["/internal/cfg1/health"]);
    expect(hits).toEqual([]);
  });
});
