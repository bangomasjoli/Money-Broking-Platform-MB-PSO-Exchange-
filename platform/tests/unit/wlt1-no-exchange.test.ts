/**
 * WLT-01-specific proof of the shared no-Exchange boot guard (§5.5-equivalent Exchange-Pending
 * Lock). The generic mechanism itself is already tested once in tests/unit/no-exchange.test.ts
 * (packages/foundation/src/no-exchange.ts) — this file proves two WLT-01-specific things:
 *
 *   1. `buildApp()` actually wires the guard in (covered end-to-end in wlt1-app.test.ts's
 *      "boots clean" + "registers no Exchange-runtime route surface" tests — not repeated here).
 *   2. The route-name fragments WLT-01's OWN future business surface could plausibly ever use
 *      would genuinely be caught by the shared guard if a future phase ever registered one as a
 *      real Fastify route, rather than assuming the substring match happens to line up. Mirrors
 *      tests/unit/aml1-no-exchange.test.ts's / tests/unit/clt1-no-exchange.test.ts's identical
 *      shape.
 *
 * IMPORTANT SCOPE NOTE: `findProhibitedExchangeRoutes`/`assertNoExchangeRuntime`
 * (packages/foundation/src/no-exchange.ts) match only the fixed `PROHIBITED_EXCHANGE_FRAGMENTS`
 * list — Exchange-runtime-specific terms (`order-book`, `matching-engine`, `market-making`,
 * `principal-dealing`, `spread-markup`, `maker-taker`, `client-to-client`, `exchange`). It does
 * NOT match `wallet`/`payout`/`withdraw`/`deposit`/`whitelist` — those are NOT Exchange-runtime
 * fragments and this shared guard was never designed to catch them (a legitimate future
 * `wallet_screening_status` field name or `payout_destination` route fragment would
 * false-positive otherwise). WLT-01's "no custody/no-transfer/no-ledger-posting/no-execution"
 * boundary is enforced instead by (a) Phase 0 registering no such route at all, and (b) the
 * static source greps run at implementation/review time — not by this runtime guard. Do not
 * assert wallet/payout/withdraw/deposit/whitelist fragments against this function; that would
 * test a behaviour it doesn't have.
 */
import { describe, expect, it } from "vitest";
import { findProhibitedExchangeRoutes, assertNoExchangeRuntime } from "@aix/foundation";

describe("WLT-01: shared no-Exchange guard catches WLT-01-shaped route surfaces", () => {
  it("flags the Phase 0 health route as clean", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/wlt1/health"]);
    expect(hits).toEqual([]);
  });

  it("would flag a future literal exchange-onboarding-shaped route if ever registered", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/wlt1/health", "/wlt1/destinations/exchange-onboarding"]);
    expect(hits).toContain("/wlt1/destinations/exchange-onboarding");
    expect(hits).not.toContain("/internal/wlt1/health");
  });

  it("would flag future order-book/matching-engine/market-making-shaped routes if ever registered", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/wlt1/health",
      "/wlt1/order-book-destinations",
      "/wlt1/matching-engine-check",
      "/wlt1/market-making-screen",
    ]);
    expect(hits).toContain("/wlt1/order-book-destinations");
    expect(hits).toContain("/wlt1/matching-engine-check");
    expect(hits).toContain("/wlt1/market-making-screen");
  });

  it("would flag future principal-dealing/spread-markup/maker-taker-shaped routes if ever registered", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/wlt1/health",
      "/wlt1/principal-dealing-check",
      "/wlt1/spread-markup-screen",
      "/wlt1/maker-taker-check",
    ]);
    expect(hits).toContain("/wlt1/principal-dealing-check");
    expect(hits).toContain("/wlt1/spread-markup-screen");
    expect(hits).toContain("/wlt1/maker-taker-check");
  });

  it("would flag a future client-to-client-shaped route if ever registered (Exchange client-to-client matching, distinct from WLT-01's own destination-eligibility screening)", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/wlt1/health", "/wlt1/client-to-client-check"]);
    expect(hits).toContain("/wlt1/client-to-client-check");
  });

  it("would fail closed at boot if a WLT-01-shaped Exchange route were ever registered", () => {
    expect(() =>
      assertNoExchangeRuntime(["/internal/wlt1/health", "/wlt1/exchange-onboarding"]),
    ).toThrowError(/MODULE_BOUNDARY_VIOLATION/);
  });

  it("does not flag ordinary WLT-01 vocabulary that isn't a route (wallet/payout/withdraw/deposit/whitelist terms are data/API concepts, not route paths, and are not Exchange-fragment matches at all)", () => {
    // Sanity: terms like "wallet"/"payout"/"whitelist"/"cooling_off" are request/response FIELDS
    // and future route SEGMENTS (Phase 1+), never route paths this phase — this guard only ever
    // scans the registered Fastify route table, and Phase 0 registers none of them yet (business
    // routes are explicitly out of scope this phase). Also confirms wallet/payout/withdraw/
    // deposit/whitelist wording alone does not trip this Exchange-specific guard (see file
    // header) — that constraint is enforced by never building the route, not by this function.
    const hits = findProhibitedExchangeRoutes([
      "/internal/wlt1/health",
      "/internal/wlt1/wallet-destinations",
      "/internal/wlt1/payout-destinations",
      "/internal/wlt1/destinations/evaluate-use",
    ]);
    expect(hits).toEqual([]);
  });
});
