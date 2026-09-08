/**
 * KYC-01-specific proof of the shared no-Exchange boot guard (§5.5 Exchange-Pending Lock). The
 * generic mechanism itself is already tested once in tests/unit/no-exchange.test.ts
 * (packages/foundation/src/no-exchange.ts) — this file proves two KYC-01-specific things, mirrors
 * tests/unit/aml1-no-exchange.test.ts's identical shape:
 *
 *   1. `buildApp()` actually wires the guard in (covered end-to-end in kyc1-app.test.ts's
 *      "boots clean" + "registers no Exchange-runtime route surface" tests — not repeated here).
 *   2. The route-name fragments KYC-01's OWN future business surface could plausibly ever use
 *      would genuinely be caught by the shared guard if a future phase ever registered one as a
 *      real Fastify route.
 *
 * IMPORTANT SCOPE NOTE (same as every prior module's own file): `findProhibitedExchangeRoutes`/
 * `assertNoExchangeRuntime` match only the fixed `PROHIBITED_EXCHANGE_FRAGMENTS` list — it does
 * NOT match `wallet`/`deposit`/`withdraw`/`trading`/`settlement`/`vendor`/`ubo`/`biometric` — those
 * are NOT Exchange-runtime fragments and this shared guard was never designed to catch them.
 * KYC-01's own "no wallet/vendor/UBO/biometric this phase" constraint is enforced instead by (a)
 * Phase 0/1 registering no such route at all, and (b) the static source greps run at
 * implementation/review time — not by this runtime guard.
 */
import { describe, expect, it } from "vitest";
import { findProhibitedExchangeRoutes, assertNoExchangeRuntime } from "@aix/foundation";

describe("KYC-01: shared no-Exchange guard catches KYC-01-shaped route surfaces", () => {
  it("flags the Phase 0+1 route surface as clean", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/kyc1/health",
      "/internal/kyc1/readiness",
      "/internal/kyc1/handoffs",
      "/internal/kyc1/cases/:case_id",
    ]);
    expect(hits).toEqual([]);
  });

  it("would flag a future literal exchange-onboarding-shaped route if ever registered", () => {
    const hits = findProhibitedExchangeRoutes(["/internal/kyc1/health", "/kyc1/cases/exchange-onboarding"]);
    expect(hits).toContain("/kyc1/cases/exchange-onboarding");
    expect(hits).not.toContain("/internal/kyc1/health");
  });

  it("would flag future order-book/matching-engine/market-making-shaped routes if ever registered", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/kyc1/health",
      "/kyc1/order-book-check",
      "/kyc1/matching-engine-check",
      "/kyc1/market-making-check",
    ]);
    expect(hits).toContain("/kyc1/order-book-check");
    expect(hits).toContain("/kyc1/matching-engine-check");
    expect(hits).toContain("/kyc1/market-making-check");
  });

  it("would fail closed at boot if a KYC-01-shaped Exchange route were ever registered", () => {
    expect(() =>
      assertNoExchangeRuntime(["/internal/kyc1/health", "/kyc1/exchange-onboarding"]),
    ).toThrowError(/MODULE_BOUNDARY_VIOLATION/);
  });

  it("does not flag ordinary KYC-01 vocabulary that isn't a route (wallet/vendor/ubo/biometric terms are data/API concepts, not route paths, and are not even Exchange-fragment matches at all)", () => {
    const hits = findProhibitedExchangeRoutes([
      "/internal/kyc1/health",
      "/internal/kyc1/wallet-screening-status",
      "/internal/kyc1/vendor-reliance-status",
      "/internal/kyc1/ubo-lookthrough-status",
    ]);
    expect(hits).toEqual([]);
  });
});
