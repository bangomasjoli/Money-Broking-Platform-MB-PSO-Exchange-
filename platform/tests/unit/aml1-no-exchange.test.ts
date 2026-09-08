/**
 * AML-01-specific proof of the shared no-Exchange boot guard (§5.5 Exchange-Pending Lock). The
 * generic mechanism itself is already tested once in tests/unit/no-exchange.test.ts
 * (packages/foundation/src/no-exchange.ts) — this file proves two AML-01-specific things:
 *
 *   1. `buildApp()` actually wires the guard in (covered end-to-end in aml1-app.test.ts's
 *      "boots clean" + "registers no Exchange-runtime route surface" tests — not repeated here).
 *   2. The route-name fragments AML-01's OWN future business surface could plausibly ever use
 *      would genuinely be caught by the shared guard if a future phase ever registered one as a
 *      real Fastify route, rather than assuming the substring match happens to line up. Mirrors
 *      tests/unit/clt1-no-exchange.test.ts's / tests/unit/cfg1-no-exchange.test.ts's identical
 *      shape.
 *
 * IMPORTANT SCOPE NOTE: `findProhibitedExchangeRoutes`/`assertNoExchangeRuntime`
 * (packages/foundation/src/no-exchange.ts) match only the fixed `PROHIBITED_EXCHANGE_FRAGMENTS`
 * list — Exchange-runtime-specific terms (`order-book`, `matching-engine`, `market-making`,
 * `principal-dealing`, `spread-markup`, `maker-taker`, `client-to-client`, `exchange`). It does
 * NOT match `wallet`/`deposit`/`withdraw`/`trading`/`settlement` — those are NOT Exchange-runtime
 * fragments and this shared guard was never designed to catch them (a legitimate future
 * `wallet_screening_status` field name or `trading_halt_check` capability would false-positive
 * otherwise). AML-01's "no wallet/deposit/withdrawal/trading/settlement capability" constraint is
 * enforced instead by (a) Phase 0 registering no such route at all, and (b) the static source
 * greps run at implementation/review time — not by this runtime guard. Do not assert
 * wallet/deposit/withdrawal/trading/settlement fragments against this function; that would test a
 * behaviour it doesn't have.
 */
import { describe, expect, it } from "vitest";
import { findProhibitedExchangeRoutes, assertNoExchangeRuntime } from "@aix/foundation";

describe("AML-01: shared no-Exchange guard catches AML-01-shaped route surfaces", () => {
  it("flags the Phase 0 health route as clean", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/aml1/health"]);
    expect(hits).toEqual([]);
  });

  it("would flag a future literal exchange-onboarding-shaped route if ever registered", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/aml1/health", "/aml1/screening/exchange-onboarding"]);
    expect(hits).toContain("/aml1/screening/exchange-onboarding");
    expect(hits).not.toContain("/internal/aml1/health");
  });

  it("would flag future order-book/matching-engine/market-making-shaped routes if ever registered", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/aml1/health",
      "/aml1/order-book-screening",
      "/aml1/matching-engine-check",
      "/aml1/market-making-screen",
    ]);
    expect(hits).toContain("/aml1/order-book-screening");
    expect(hits).toContain("/aml1/matching-engine-check");
    expect(hits).toContain("/aml1/market-making-screen");
  });

  it("would flag future principal-dealing/spread-markup/maker-taker-shaped routes if ever registered", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/aml1/health",
      "/aml1/principal-dealing-check",
      "/aml1/spread-markup-screen",
      "/aml1/maker-taker-check",
    ]);
    expect(hits).toContain("/aml1/principal-dealing-check");
    expect(hits).toContain("/aml1/spread-markup-screen");
    expect(hits).toContain("/aml1/maker-taker-check");
  });

  it("would flag a future client-to-client-shaped route if ever registered (Exchange client-to-client matching, distinct from AML-01's own client-vs-list screening)", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/aml1/health", "/aml1/client-to-client-check"]);
    expect(hits).toContain("/aml1/client-to-client-check");
  });

  it("would fail closed at boot if an AML-01-shaped Exchange route were ever registered", () => {
    expect(() =>
      assertNoExchangeRuntime(["/internal/aml1/health", "/aml1/exchange-onboarding"]),
    ).toThrowError(/MODULE_BOUNDARY_VIOLATION/);
  });

  it("does not flag ordinary AML-01 vocabulary that isn't a route (sanctions/PEP/adverse-media/screening/wallet/trading terms are data/API concepts, not route paths, and several are not even Exchange-fragment matches at all)", () => {
    // Sanity: terms like "sanctions"/"pep"/"adverse_media"/"screening" are request/response
    // FIELDS (Phase 1+), never route paths — this guard only ever scans the registered Fastify
    // route table, and Phase 0 registers none of them yet (business routes are explicitly out of
    // scope this phase). Also confirms wallet/deposit/withdrawal/trading/settlement wording alone
    // does not trip this Exchange-specific guard (see file header) — that constraint is enforced
    // by never building the route, not by this function.
    const hits = findProhibitedExchangeRoutes([
      "/internal/aml1/health",
      "/internal/aml1/wallet-screening-status",
      "/internal/aml1/trading-halt-status",
    ]);
    expect(hits).toEqual([]);
  });
});
