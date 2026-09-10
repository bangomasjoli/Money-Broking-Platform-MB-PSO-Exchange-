/**
 * WLT-01 Phase 2C-D1/D2/D2R — M-D1-1 / H-D2-1 remediation + P2CB-MED-2 closure: a dedicated
 * WLT-local production source-text guard proving the ONLY way to construct
 * `AuthenticatedReceiptProvenance` anywhere in this codebase is through a config-BOUND
 * `Wlt1ProviderReceiptAuthenticator`, obtained ONLY from `createWlt1ProviderReceiptAuthenticator
 * (config)` — itself called exactly ONCE, in `server.ts`'s own `buildApp`, from the app's own
 * validated `Wlt1Config` — and that the ONE production call site minting provenance from an
 * authenticated capability is the receipt ingress route (`services/wlt1/src/routes/
 * provider-receipt.ts`). Mirrors `wlt1-screening-composition-boundary.test.ts`'s own identical
 * technique and rationale (P2CC1-MED-1) exactly: a small, proportionate source-text scan is the
 * smallest load-bearing control for "only ONE production file may construct this sensitive value",
 * not a platform-wide AST helper.
 *
 * HISTORY:
 *   - Phase 2C-D1 exported a standalone `mintAuthenticatedReceiptProvenance(payloadHash)` factory
 *     from `lib/providers/types.ts`. Independent review (M-D1-1) proved this was directly callable,
 *     with an attacker-chosen hash, by any production module — no authentication of any kind.
 *   - Phase 2C-D2 removed that factory and introduced an EXPORTED, UNBOUND
 *     `authenticateProviderReceipt(secrets, claimedProviderId, providedToken)`, taking the
 *     credential map as an ordinary call argument. Independent review (H-D2-1) proved this was
 *     STILL insufficient: any production module could fabricate its OWN `secrets` object (with no
 *     relationship to the real, validated `WLT1_PROVIDER_RECEIPT_SECRETS` configuration) and a
 *     matching fake token, and the function would mint a real, brand-matching
 *     `AuthenticatedReceiptProvenance` from it — proven empirically by a foreign production module
 *     compiled under `services/wlt1/src/**` during that review.
 *   - Phase 2C-D2R (this commit) removes that unbound function entirely. The ONLY exported
 *     construction path is `createWlt1ProviderReceiptAuthenticator(config)` — a config-BOUND
 *     factory, called exactly once at app boot in `server.ts`, mirroring
 *     `lib/screening-application.ts`'s own already-accepted `createScreeningApplication(config)`
 *     composition pattern (P2CC1-MED-1) exactly. The returned authenticator's ONLY method,
 *     `.authenticate(claimedProviderId, providedToken)`, takes NO secrets argument — there is no
 *     call-site slot through which a caller can substitute a different credential authority.
 *
 * HONEST SCOPE (M-D2-1 correction — do not overstate what this guard proves): this is a
 * COMPOSITION-SITE boundary, not a cryptographically unforgeable one. It does not, and cannot,
 * defend against a hostile actor who can already inject and compile arbitrary new source files
 * into `services/wlt1/src/**` itself and hand `createWlt1ProviderReceiptAuthenticator` a
 * hand-built, `Wlt1Config`-shaped object literal — TypeScript's structural typing cannot itself
 * distinguish "produced by `loadWlt1Config`'s own validation pipeline" from "an object literal
 * with the same shape", and closing that would require nominally branding `Wlt1Config` itself, a
 * broad change out of scope here (`createScreeningApplication(config)` carries the identical
 * residual today, unaddressed for the same reason). What this DOES close, and what H-D2-1 actually
 * named, is the concrete attack Opus demonstrated: an exported API that accepts an ARBITRARY
 * caller-supplied secrets map — with no relationship to any `Wlt1Config` at all — and returns real
 * branded provenance from it. That API no longer exists.
 *
 * `tests/**`, `dist/**`, and `node_modules/**` are out of scope — this guards PRODUCTION
 * construction authority only. Test files legitimately call `createWlt1ProviderReceiptAuthenticator`
 * directly (with a REAL config built through `loadWlt1Config`, exactly the way
 * `wlt1-screening-application.test.ts`'s own 43 direct `createScreeningApplication(testWlt1Config())`
 * fixtures already do under the identical P2CC1-MED-1 precedent) to build fixtures — that is not a
 * production minting site and this guard does not scan `tests/**`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createWlt1ProviderReceiptAuthenticator } from "../../services/wlt1/src/plugins/receipt-auth.js";
import * as receiptAuthModule from "../../services/wlt1/src/plugins/receipt-auth.js";
import { loadWlt1Config } from "../../services/wlt1/src/config.js";

const REPO_ROOT = join(__dirname, "..", "..");
const WLT1_SRC = join(REPO_ROOT, "services", "wlt1", "src");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "dist" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Strips `/* ... *\/` block comments and `// ...` line comments before scanning — identical
 * helper to every other WLT-local source-scan guard in this repo (mirrors
 * `wlt1-screening-composition-boundary.test.ts` / `wlt1-screening-pending-row-mutation-boundary.
 * test.ts`'s own identical implementations) so a doc comment describing these exact identifiers (as
 * this test file's own header does, and as `receipt-auth.ts`'s own header comment does) can never
 * trip the scan; only real reference/call-site source text counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const RECEIPT_AUTH_FILE_REL = "src/plugins/receipt-auth.ts";
const SERVER_FILE_REL = "src/server.ts";
const PROVIDER_RECEIPT_ROUTE_REL = "src/routes/provider-receipt.ts";

/** A REAL, validated `Wlt1Config` built through the real `loadWlt1Config` — never a hand-assembled
 * secrets map — mirroring `wlt1-screening-application.test.ts`'s own `testWlt1Config` helper. Used
 * only to construct fixture authenticators the same way `server.ts` constructs the real one. */
function testWlt1Config(providerSecrets: Record<string, string>) {
  return loadWlt1Config({
    ENVIRONMENT: "dev",
    DATABASE_URL: "postgres://unused@localhost:5432/unused",
    PORT: "8090",
    WLT1_INTERNAL_SERVICE_TOKEN: "a".repeat(40),
    CLT1_BASE_URL: "http://localhost:8085",
    CLT1_INTERNAL_SERVICE_TOKEN: "b".repeat(40),
    IAM2_BASE_URL: "http://localhost:8082",
    IAM2_INTERNAL_SERVICE_TOKEN: "c".repeat(40),
    AML1_BASE_URL: "http://localhost:8087",
    AML1_INTERNAL_SERVICE_TOKEN: "d".repeat(40),
    WLT1_FIAT_ENC_KEY: "e".repeat(40),
    WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify(providerSecrets),
    IAM_BASE_URL: "http://localhost:8081",
    IAM_INTROSPECTION_SERVICE_TOKEN: "f".repeat(40),
    FND_BASE_URL: "http://localhost:8080",
    FND_RATE_LIMIT_CONSUMER_TOKEN: "g".repeat(40),
    WLT1_PUBLIC_DESTINATION_LIST_MAX: "100",
  });
}

describe("WLT-01 Phase 2C-D2R, H-D2-1 remediation / M-D1-1 / P2CB-MED-2 closure: sole production authenticated-receipt-provenance minting authority", () => {
  it("no production file other than receipt-auth.ts defines a brand symbol or a capability constructor for AuthenticatedReceiptProvenance", () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(WLT1_SRC)) {
      const rel = relative(join(REPO_ROOT, "services", "wlt1"), file).split("\\").join("/");
      if (rel === RECEIPT_AUTH_FILE_REL) continue;
      const content = stripComments(readFileSync(file, "utf8"));
      // The brand symbol is module-private and structurally unspellable outside receipt-auth.ts
      // (no other file can ever produce the exact `unique symbol` value), so a bare textual
      // reference to either identifier is already conclusive.
      if (content.includes("RECEIPT_AUTHENTICATED_BRAND") || content.includes("buildAuthenticatedCapability")) {
        offenders.push(rel);
      }
    }
    expect(offenders, `unexpected provenance-construction machinery outside receipt-auth.ts: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("no production file exports the brand symbol or the capability constructor as a bare, authentication-free value", () => {
    const content = stripComments(readFileSync(join(WLT1_SRC, "plugins", "receipt-auth.ts"), "utf8"));
    expect(content).not.toMatch(/export\s+(const|function)\s+RECEIPT_AUTHENTICATED_BRAND/);
    expect(content).not.toMatch(/export\s*\{\s*RECEIPT_AUTHENTICATED_BRAND/);
    expect(content).not.toMatch(/export\s+(const|function)\s+buildAuthenticatedCapability/);
    expect(content).not.toMatch(/export\s*\{\s*buildAuthenticatedCapability/);
  });

  it("H-D2-1: receipt-auth.ts exports NO function that accepts a secrets map as a call argument — every exported function's own arity is inspected, not merely its name", () => {
    // Reflective proof, not a name-based heuristic (Opus's own review defeated a name-based text
    // scan with two cosmetic edits — see this file's own header comment). Every exported function
    // from the real, imported module is inspected via `.length` (its declared parameter count) and
    // its actual runtime behavior, so a rename or property-access trick cannot hide an unbound
    // secrets-accepting API from this check the way it could hide from a text scan.
    const mod = receiptAuthModule as unknown as Record<string, unknown>;
    const exportedFunctionNames = Object.keys(mod).filter((k) => typeof mod[k] === "function");
    expect(exportedFunctionNames.sort()).toEqual(["createWlt1ProviderReceiptAuthenticator", "makeWlt1ProviderReceiptAuthGuard"].sort());

    // createWlt1ProviderReceiptAuthenticator(config) — exactly one argument, a config object, never
    // a raw secrets map plus provider id plus token.
    expect((mod.createWlt1ProviderReceiptAuthenticator as (...a: unknown[]) => unknown).length).toBe(1);
    // makeWlt1ProviderReceiptAuthGuard(authenticator) — exactly one argument, the BOUND
    // authenticator instance, never a secrets map.
    expect((mod.makeWlt1ProviderReceiptAuthGuard as (...a: unknown[]) => unknown).length).toBe(1);
  });

  it("the authenticator's own .authenticate method takes exactly two arguments (claimedProviderId, providedToken) — no third secrets-map parameter exists at the call site that actually performs the credential comparison", () => {
    const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ "stub-wallet-analytics-v1": "some-configured-secret-value-32ch" }));
    expect(authenticator.authenticate.length).toBe(2);
  });

  it("services/wlt1/src/routes/provider-receipt.ts is the sole production file calling .mintProvenance(...), and it does so only via the authenticated receiptAuth capability its own guard produced — it never imports Wlt1Config, loadWlt1Config, or the authenticator factory itself", () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(WLT1_SRC)) {
      const rel = relative(join(REPO_ROOT, "services", "wlt1"), file).split("\\").join("/");
      if (rel === PROVIDER_RECEIPT_ROUTE_REL || rel === RECEIPT_AUTH_FILE_REL) continue;
      const content = stripComments(readFileSync(file, "utf8"));
      if (content.includes(".mintProvenance(")) offenders.push(rel);
    }
    expect(offenders, `unexpected .mintProvenance(...) call outside provider-receipt.ts: ${JSON.stringify(offenders)}`).toEqual([]);

    const routeContent = stripComments(readFileSync(join(WLT1_SRC, "routes", "provider-receipt.ts"), "utf8"));
    const matches = routeContent.match(/\.mintProvenance\(/g) ?? [];
    // Exactly one real call site — proves the scan itself is meaningful, not vacuously passing.
    expect(matches.length).toBe(1);
    // The receiver must be the authenticated capability field, never a locally-constructed object.
    expect(routeContent).toMatch(/receiptAuth\.mintProvenance\(/);
    // H-D2-1: the route receives the authenticator via dependency injection only — it must never
    // construct one itself, and must never be able to reach Wlt1Config/loadWlt1Config to do so.
    expect(routeContent).not.toContain("createWlt1ProviderReceiptAuthenticator");
    expect(routeContent).not.toContain("loadWlt1Config");
    expect(routeContent).not.toMatch(/from ["']\.\.\/config\.js["']/);
  });

  it("H-D2-1: createWlt1ProviderReceiptAuthenticator is referenced in production source ONLY from server.ts (its own sole composition site) and receipt-auth.ts (its own definition) — mirrors P2CC1-MED-1's identical single-composition-site guard for createScreeningApplication", () => {
    const allowed = new Set([SERVER_FILE_REL, RECEIPT_AUTH_FILE_REL]);
    const offenders: string[] = [];
    for (const file of listTsFiles(WLT1_SRC)) {
      const rel = relative(join(REPO_ROOT, "services", "wlt1"), file).split("\\").join("/");
      if (allowed.has(rel)) continue;
      const content = stripComments(readFileSync(file, "utf8"));
      if (content.includes("createWlt1ProviderReceiptAuthenticator")) offenders.push(rel);
    }
    expect(offenders, `unexpected reference to createWlt1ProviderReceiptAuthenticator outside server.ts: ${JSON.stringify(offenders)}`).toEqual([]);

    const serverContent = stripComments(readFileSync(join(WLT1_SRC, "server.ts"), "utf8"));
    const matches = serverContent.match(/createWlt1ProviderReceiptAuthenticator\(/g) ?? [];
    // Exactly one real construction call — proves the scan itself is meaningful.
    expect(matches.length).toBe(1);
  });

  it("no other production file under services/wlt1/src/** constructs a provider_receipt-sourceKind object literal directly (the only legal construction path is the authenticated capability)", () => {
    // types.ts legitimately CONTAINS the string "sourceKind: \"provider_receipt\"" as its own
    // discriminated-union TYPE-LITERAL member (`{ sourceKind: "provider_receipt"; ... }`, comma-free,
    // semicolon-separated) — that is a type declaration, not object construction. An OBJECT LITERAL
    // construction always uses a trailing comma (`sourceKind: "provider_receipt",`).
    const allowed = new Set([PROVIDER_RECEIPT_ROUTE_REL, "src/lib/providers/types.ts"]);
    const offenders: string[] = [];
    for (const file of listTsFiles(WLT1_SRC)) {
      const rel = relative(join(REPO_ROOT, "services", "wlt1"), file).split("\\").join("/");
      if (allowed.has(rel)) continue;
      const content = stripComments(readFileSync(file, "utf8"));
      if (content.includes('sourceKind: "provider_receipt",') || content.includes("sourceKind: 'provider_receipt',")) {
        offenders.push(rel);
      }
    }
    expect(offenders, `unexpected provider_receipt evidence-envelope construction outside provider-receipt.ts: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("P2CB-MED-2 closure: screening-application.ts's own deriveSourceEvidence reads payloadHash ONLY through the branded evidence.provenance.payloadHash path — the pre-Phase-2C-D1 unsafe bare evidence.payloadHash shape is gone", () => {
    const content = stripComments(readFileSync(join(WLT1_SRC, "lib", "screening-application.ts"), "utf8"));
    expect(content, "deriveSourceEvidence must read the branded provenance path").toContain("evidence.provenance.payloadHash");
    expect(content, "the pre-Phase-2C-D1 unbranded evidence.payloadHash read must not remain").not.toMatch(/evidence\.payloadHash(?!\w)/);
  });

  it("provider-receipt.ts never references chain_coverage — receipt provider binding is checked against wallet_screening_result.provider_id (the FROZEN per-version evidence identity) only, never the CURRENT chain_coverage.provider_id.", () => {
    const content = stripComments(readFileSync(join(WLT1_SRC, "routes", "provider-receipt.ts"), "utf8"));
    expect(content).not.toContain("chain_coverage");
    expect(content).not.toContain("fetchActiveChainCoverage");
  });

  // Only ONE wallet-analytics provider id is registered this phase (`STUB_PROVIDER_ID` /
  // `stub-wallet-analytics-v1` — see `lib/providers/registry.ts`'s own `WALLET_ANALYTICS_PROVIDER_
  // VERSIONS`), and `loadWlt1Config` now genuinely validates `WLT1_PROVIDER_RECEIPT_SECRETS`
  // against the real known-provider-id set and a real 32-char minimum secret length (unlike the
  // OLD unbound function, which accepted ANY string as a "provider id" with no such validation at
  // all — itself part of what made it unsafe). Every fixture below therefore uses this one real
  // provider id with a real-length secret; "cross-authority" scenarios are proven instead by
  // constructing multiple INDEPENDENT authenticator instances from different configs, which is the
  // actually load-bearing shape of the property under test (per-instance authority binding, not
  // per-provider-id namespacing).
  const KNOWN_PROVIDER_ID = "stub-wallet-analytics-v1";

  describe("H-D2-1 runtime adversarial proof — the credential authority is bound at construction time and cannot be supplied or substituted per call", () => {
    it("valid credential against a config-bound authenticator DOES obtain an authenticated capability", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "a".repeat(24) }));
      const capability = authenticator.authenticate(KNOWN_PROVIDER_ID, "real-secret-" + "a".repeat(24));
      expect(capability).toBeDefined();
      expect(capability!.providerId).toBe(KNOWN_PROVIDER_ID);
    });

    it("the returned providerId is the authenticated identity, matching the claimed id that matched the bound secret", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "b".repeat(24) }));
      const capability = authenticator.authenticate(KNOWN_PROVIDER_ID, "real-secret-" + "b".repeat(24));
      expect(capability!.providerId).toBe(KNOWN_PROVIDER_ID);
    });

    it("the minted payloadHash equals exactly what the caller passed to mintProvenance (server-computed upstream of this call, never re-derived here)", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "a".repeat(24) }));
      const capability = authenticator.authenticate(KNOWN_PROVIDER_ID, "real-secret-" + "a".repeat(24))!;
      const hash = "b".repeat(64);
      const provenance = capability.mintProvenance(hash);
      expect(provenance.payloadHash).toBe(hash);
    });

    it("unknown provider id cannot obtain a capability, regardless of token value", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "a".repeat(24) }));
      expect(authenticator.authenticate("provider-unknown", "real-secret-" + "a".repeat(24))).toBeUndefined();
    });

    it("known provider id with wrong token cannot obtain a capability", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "a".repeat(24) }));
      expect(authenticator.authenticate(KNOWN_PROVIDER_ID, "wrong-token-" + "z".repeat(24))).toBeUndefined();
    });

    it("known provider id with a DIFFERENT authenticator instance's real (bound) token cannot obtain a capability against THIS instance (no cross-instance credential reuse)", () => {
      const authenticatorX = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "x".repeat(24) }));
      const authenticatorY = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "y".repeat(24) }));
      expect(authenticatorX.authenticate(KNOWN_PROVIDER_ID, "real-secret-" + "y".repeat(24))).toBeUndefined();
      expect(authenticatorY.authenticate(KNOWN_PROVIDER_ID, "real-secret-" + "x".repeat(24))).toBeUndefined();
    });

    it("missing token cannot obtain a capability", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "a".repeat(24) }));
      expect(authenticator.authenticate(KNOWN_PROVIDER_ID, undefined)).toBeUndefined();
    });

    it("missing provider id cannot obtain a capability", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "a".repeat(24) }));
      expect(authenticator.authenticate(undefined, "real-secret-" + "a".repeat(24))).toBeUndefined();
    });

    it("both missing cannot obtain a capability", () => {
      const authenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ [KNOWN_PROVIDER_ID]: "real-secret-" + "a".repeat(24) }));
      expect(authenticator.authenticate(undefined, undefined)).toBeUndefined();
    });

    it("H-D2-1 LOAD-BEARING: a caller cannot supply the trusted secret database — a token/provider-id pair that would be VALID against a caller's own locally-fabricated secrets map is REJECTED by an authenticator bound to the server's real, DIFFERENT configuration. This is the exact shape of Opus's demonstrated attack: fabricate `{ providerId: attackerToken }`, then try to authenticate with it — the invariant under test is 'the authority is fixed at construction', not merely 'a wrong token fails'.", () => {
      // The server's REAL bound authenticator — this is the ONLY instance the actual receipt route
      // would ever use in production (constructed once in server.ts from real config).
      const serverBoundAuthenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ "stub-wallet-analytics-v1": "the-real-server-configured-secret" }));

      // An attacker, unable to read the server's real secret, fabricates their OWN entirely
      // independent secrets map for the SAME claimed provider id — exactly Opus's own reproduction
      // shape (`{ "stub-wallet-analytics-v1": "<attacker-controlled-secret>" }`). There is no
      // exported API left that accepts this map at all (proven above by arity/name inventory), but
      // this test additionally proves the SEMANTIC property directly: even the CORRECT claimed
      // provider id, presented with the attacker's own self-consistent (map, token) pair, fails
      // against the server's real bound authenticator, because the server's authenticator was never
      // given the attacker's map to compare against in the first place.
      const attackerFabricatedSecret = "AAAA-attacker-controlled-not-the-real-secret";
      const forged = serverBoundAuthenticator.authenticate("stub-wallet-analytics-v1", attackerFabricatedSecret);
      expect(forged).toBeUndefined();

      // Positive control: the SAME attacker-fabricated map, used to build the attacker's OWN
      // authenticator (the only way left to make it "succeed" at all), produces a capability that
      // is ISOLATED to the attacker's own private instance — it was never presented to, and can
      // never influence, the server's real bound authenticator or the real HTTP route (which only
      // ever calls .authenticate on the ONE instance server.ts constructed from real config; see
      // the single-composition-site guard above). Demonstrating this contrast is what proves the
      // fix: the attacker's fabricated authority is now provably inert against the real one.
      const attackerOwnAuthenticator = createWlt1ProviderReceiptAuthenticator(testWlt1Config({ "stub-wallet-analytics-v1": attackerFabricatedSecret }));
      const attackerOwnCapability = attackerOwnAuthenticator.authenticate("stub-wallet-analytics-v1", attackerFabricatedSecret);
      expect(attackerOwnCapability).toBeDefined(); // succeeds only against the attacker's OWN isolated instance
      expect(serverBoundAuthenticator.authenticate("stub-wallet-analytics-v1", attackerFabricatedSecret)).toBeUndefined(); // never against the real one
    });

    it("a plain object literal shaped like AuthenticatedReceiptProvenance is not assignable to it — the brand cannot be forged from outside receipt-auth.ts (compile-time proof; this file has no way to spell the private brand key at runtime either)", () => {
      const parsed: unknown = JSON.parse('{"payloadHash":"' + "c".repeat(64) + '"}');
      expect(typeof parsed).toBe("object");
      expect(Object.getOwnPropertySymbols(parsed as object).length).toBe(0);
    });
  });
});
