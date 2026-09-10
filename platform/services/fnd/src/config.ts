/**
 * FND-01 configuration loader. Reuses @aix/foundation's `loadConfig` (fail-closed baseline:
 * ENVIRONMENT/DATABASE_URL/PORT/internal-service-token validation) for the shared shape, then
 * layers FND-specific config on top.
 *
 * Shared Rate-Limit Engine (WLT-01 BLOCKER-2 prerequisite, DEC-009) — `FND_RATE_LIMIT_
 * CONSUMER_SECRETS`: a per-consumer-module capability secret map guarding `POST /foundation/
 * rate-limit/check`, deliberately DISTINCT from the general `INTERNAL_SERVICE_TOKEN`. FND has
 * no per-caller service-identity model (every other `/foundation/*` protected route shares the
 * one generic `makeInternalIdentityGuard`); a dedicated secret PER CONSUMER MODULE narrows this
 * specific capability so a module's identity is established by POSSESSION of its own secret,
 * never asserted by a request-body field — mirrors the exact precedent WLT-01's own
 * `WLT1_PROVIDER_RECEIPT_SECRETS` (per-provider secret map, `services/wlt1/src/config.ts`) and
 * IAM-01's own `IAM_INTROSPECTION_SERVICE_TOKEN` (dedicated capability secret) already
 * established for this codebase.
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";

export interface FndConfig extends AppConfig {
  /**
   * Per-consumer-module secret map for the shared rate-limit engine's internal caller guard —
   * `{ "<MODULE-ID>": "<secret>", ... }`. Frozen/immutable at boot; never re-read at runtime.
   * Never logged. Empty only if genuinely no consumer is configured (still a valid, if useless,
   * boot state — the required-at-least-one-entry decision is deliberately NOT enforced here,
   * since FND-01 itself has no opinion on which/how-many consumers exist). Every value in this
   * map is guaranteed distinct — `parseRateLimitConsumerSecrets` rejects a duplicated secret
   * value across two different module ids at boot (NEW-2), since `makeRateLimitConsumerGuard`
   * derives module identity from which configured secret matched.
   */
  rateLimitConsumerSecrets: Readonly<Record<string, string>>;
}

/** Module-id key shape — mirrors the exact CHECK constraint used for `module`/`source_module`
 * columns platform-wide (e.g. migration 005's `source_module ~ '^[A-Z]{2,4}-[0-9]{2}$'`). */
const MODULE_ID_PATTERN = /^[A-Z]{2,4}-[0-9]{2}$/;
const CONSUMER_SECRET_MIN_LENGTH = 16;

/** Detects a textually-duplicated top-level JSON object key BEFORE the string is trusted —
 * `JSON.parse` itself silently keeps only the last occurrence of a duplicated key (per the JSON
 * spec), which would let a copy-paste mistake in `FND_RATE_LIMIT_CONSUMER_SECRETS` silently
 * discard one module's real configured secret. A proportionate raw-text scan for THIS narrow,
 * fully flat (no nesting, string values only) config shape — not a general-purpose JSON
 * tokenizer — mirrors this codebase's own established precedent
 * (`services/wlt1/src/config.ts`'s `findDuplicateTopLevelJsonKey`, itself citing
 * `wlt1-screening-composition-boundary.test.ts`'s own "small dedicated text scan" precedent).
 * Returns the first duplicated key found, or `undefined` if none. */
function findDuplicateTopLevelJsonKey(raw: string): string | undefined {
  const seen = new Set<string>();
  const keyPattern = /"((?:[^"\\]|\\.)*)"\s*:/g;
  for (const match of raw.matchAll(keyPattern)) {
    const key = match[1] as string;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}

/** Parses/validates `FND_RATE_LIMIT_CONSUMER_SECRETS`. Returns `{ secrets, problems }` — never
 * throws itself, so `loadFndConfig` can accumulate this alongside every other config problem
 * and report all of them together in one `CONFIGURATION_INVALID` (existing platform
 * convention). `internalServiceToken` is passed in so no consumer secret may collide with the
 * general internal token — a consumer secret existing ONLY to narrow capability beyond that
 * shared token would be pointless (and a real confused-deputy risk) if it were the same value. */
function parseRateLimitConsumerSecrets(
  raw: string | undefined,
  internalServiceToken: string | undefined,
): { secrets: Readonly<Record<string, string>>; problems: string[] } {
  if (raw === undefined || raw.trim() === "") {
    return { secrets: Object.freeze({}), problems: ["FND_RATE_LIMIT_CONSUMER_SECRETS is required"] };
  }

  const duplicateKey = findDuplicateTopLevelJsonKey(raw);
  if (duplicateKey !== undefined) {
    return {
      secrets: Object.freeze({}),
      problems: [`FND_RATE_LIMIT_CONSUMER_SECRETS contains a duplicate module id key: '${duplicateKey}'`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { secrets: Object.freeze({}), problems: ["FND_RATE_LIMIT_CONSUMER_SECRETS is not valid JSON"] };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      secrets: Object.freeze({}),
      problems: ["FND_RATE_LIMIT_CONSUMER_SECRETS must be a flat JSON object of moduleId -> secret"],
    };
  }

  const problems: string[] = [];
  const secrets: Record<string, string> = {};
  // NEW-2 (independent Opus post-acceptance review): `makeRateLimitConsumerGuard`
  // derives module identity from WHICH configured secret matched a presented token — that
  // invariant (one secret -> exactly one module) silently breaks if two module ids share the
  // same secret VALUE, since the guard then resolves whichever module is iterated first
  // (`Object.entries` order), leaving the other module's traffic ambiguously enforced under
  // the first module's namespace/policy. Tracked separately from `findDuplicateTopLevelJsonKey`
  // above, which only catches a duplicated KEY (same module id twice) — this catches the same
  // secret VALUE assigned to two DIFFERENT module ids. Never includes the secret value itself
  // in the problem message (mirrors every other branch below — only the INTERNAL_SERVICE_TOKEN
  // collision check ever compares a value, and it doesn't log it either).
  const moduleIdByValue = new Map<string, string>();
  for (const [moduleId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!MODULE_ID_PATTERN.test(moduleId)) {
      problems.push(`FND_RATE_LIMIT_CONSUMER_SECRETS names a malformed module id: '${moduleId}' (expected e.g. 'WLT-01')`);
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`FND_RATE_LIMIT_CONSUMER_SECRETS entry for '${moduleId}' must be a non-blank string`);
      continue;
    }
    if (value.length < CONSUMER_SECRET_MIN_LENGTH) {
      problems.push(`FND_RATE_LIMIT_CONSUMER_SECRETS entry for '${moduleId}' must be at least ${CONSUMER_SECRET_MIN_LENGTH} characters`);
      continue;
    }
    if (internalServiceToken && value === internalServiceToken) {
      problems.push(`FND_RATE_LIMIT_CONSUMER_SECRETS entry for '${moduleId}' must not equal INTERNAL_SERVICE_TOKEN`);
      continue;
    }
    const priorModuleId = moduleIdByValue.get(value);
    if (priorModuleId !== undefined) {
      problems.push(
        `FND_RATE_LIMIT_CONSUMER_SECRETS entries for '${priorModuleId}' and '${moduleId}' must not share the same secret value — module identity is derived from which secret matched, so a shared secret makes it ambiguous`,
      );
      continue;
    }
    moduleIdByValue.set(value, moduleId);
    secrets[moduleId] = value;
  }
  return { secrets: Object.freeze(secrets), problems };
}

export function loadFndConfig(env: RawEnv = process.env): FndConfig {
  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT/INTERNAL_SERVICE_TOKEN) unchanged.
  const base = loadConfig(env);

  const { secrets: rateLimitConsumerSecrets, problems } = parseRateLimitConsumerSecrets(
    env.FND_RATE_LIMIT_CONSUMER_SECRETS,
    base.internalServiceToken,
  );

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical FND configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    rateLimitConsumerSecrets,
  };
}
