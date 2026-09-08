/**
 * AML-01 — pure screening logic. No DB access, no HTTP — routes/screening.ts is the only caller.
 * Kept pure and DB-free so every rule here is unit-testable without a database, same discipline
 * lib/clt1-outcome-mapping.ts already established.
 *
 * Phase 3B change: the deterministic stub adaptor's own `screen()` function (and its fixture
 * table) MOVED to `lib/providers/stub-provider.ts`, now behind the `ScreeningProvider` adaptor
 * boundary (`lib/providers/registry.ts`) — this file no longer knows which provider answered a
 * screen, or how. What remains here is provider-AGNOSTIC: subject/payload validation, the
 * minimized provider-payload builder, and normalization of whatever raw matches a provider (stub
 * or, in a future phase, a real vendor) returns into AML-01's own closed
 * `screening_match`/`screening_result` shape.
 */
import type { ProviderRawMatch, ProviderScreeningPayload, SubjectNature } from "./providers/types.js";
import { Aml1Error } from "./errors.js";

export const SCREENING_SUBJECT_TYPES = ["client_application", "authorised_party"] as const;
export type ScreeningSubjectType = (typeof SCREENING_SUBJECT_TYPES)[number];

export const SCREENING_PROVENANCE_VALUES = ["declared_identity", "kyc_verified_identity"] as const;
export type ScreeningProvenance = (typeof SCREENING_PROVENANCE_VALUES)[number];

/** Only ever writes `declared_identity` — `kyc_verified_identity` remains schema-present but
 * unreachable until a phase that lands after KYC-01 exists (see migration 033's own header
 * comment). Unchanged by Phase 3B. */
export const WRITABLE_SCREENING_PROVENANCE = "declared_identity" as const;

export const SCREENING_MATCH_CATEGORIES = ["sanctions", "pep", "adverse_media"] as const;
export type ScreeningMatchCategory = (typeof SCREENING_MATCH_CATEGORIES)[number];

export const SCREENING_RESULT_STATUSES = ["clear", "potential_match", "confirmed_hit", "error"] as const;
export type ScreeningResultStatus = (typeof SCREENING_RESULT_STATUSES)[number];

export interface DeclaredIdentity {
  name: string;
  registration_number?: string;
  country?: string;
  date_of_birth?: string;
  nationality?: string;
}

export interface ScreeningSubjectSnapshot {
  subject_type: ScreeningSubjectType;
  provenance: ScreeningProvenance;
  declared_identity: DeclaredIdentity;
}

const DATE_OF_BIRTH_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `date_of_birth` is optional, but WHEN PRESENT must be a real `YYYY-MM-DD` calendar date —
 * checked here (not at the TypeBox schema layer) so a malformed value fails closed with a clean
 * `AML1_SCREENING_SUBJECT_INVALID` (422) BEFORE any database write, rather than reaching the
 * `date`-typed `screening_subject_snapshot.date_of_birth` column and failing there as an opaque
 * `AML1_AUDIT_REQUIRED` (503) — a real gap caught during Phase 1 self-review, fixed here rather
 * than left as a "residual, non-blocking" note. Rejects both wrong-shape strings ("not-a-date",
 * "2024/01/01") and syntactically-shaped but calendrically-impossible dates ("2024-02-30",
 * "2024-13-01") — a naive `new Date(str)` parse alone would silently roll February 30th over
 * into March, so the parsed date's own year/month/day are checked to round-trip back to the
 * exact input instead of trusting `Date`'s lenient parser.
 */
function isValidCalendarDate(dateOfBirth: string): boolean {
  const match = DATE_OF_BIRTH_SHAPE.exec(dateOfBirth);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/**
 * Semantic subject validation — shape/type-level validation (missing fields, wrong types,
 * `subject_nature` not one of `individual`/`entity`) is already caught by Fastify/TypeBox's own
 * schema check (`VALIDATION_ERROR`) before this ever runs; this catches the semantic rules TypeBox
 * can't express cheaply (blank-after-trim name, a real calendar date for `date_of_birth`) plus the
 * two rules that are policy, not shape (`subject_type` must be a supported value; `provenance` must
 * be the one value AML-01 is permitted to write) — same "TypeBox for shape, a pure function for
 * policy" split lib/mandates.ts's own `validateMandateRules` established. Error `details` never
 * echo the caller-supplied value back (only the field name + a generic issue description) — no
 * PII (name, DOB, etc.) leaks into the error response.
 */
export function validateScreeningSubject(input: { subject_type: string; provenance: string; declared_identity: DeclaredIdentity }): void {
  if (!SCREENING_SUBJECT_TYPES.includes(input.subject_type as ScreeningSubjectType)) {
    throw new Aml1Error("AML1_SCREENING_SUBJECT_INVALID", {
      details: [{ field: "subject_type", issue: `must be one of ${SCREENING_SUBJECT_TYPES.join("/")}` }],
    });
  }
  if (input.provenance !== WRITABLE_SCREENING_PROVENANCE) {
    throw new Aml1Error("AML1_SCREENING_SUBJECT_INVALID", {
      details: [{ field: "provenance", issue: `only '${WRITABLE_SCREENING_PROVENANCE}' may be written this phase` }],
    });
  }
  if (!input.declared_identity.name || input.declared_identity.name.trim().length === 0) {
    throw new Aml1Error("AML1_SCREENING_SUBJECT_INVALID", {
      details: [{ field: "declared_identity.name", issue: "must not be blank" }],
    });
  }
  if (input.declared_identity.date_of_birth !== undefined && !isValidCalendarDate(input.declared_identity.date_of_birth)) {
    throw new Aml1Error("AML1_SCREENING_SUBJECT_INVALID", {
      details: [{ field: "declared_identity.date_of_birth", issue: "must be a valid YYYY-MM-DD calendar date" }],
    });
  }
}

/**
 * Phase 3B payload minimization (approved Phase 3 planning report §6/§4.6). Builds the MINIMIZED
 * payload AML-01 sends to a provider — never `subject_ref`/`screening_request_id`/`requested_by`/
 * `provenance` (internal identifiers, no screening value). `registration_number` is included ONLY
 * for `entity` subjects; `date_of_birth`/`nationality` ONLY for `individual` subjects — an
 * individual's registration_number or an entity's date_of_birth is never sent even if the caller
 * supplied one (a caller-supplied field that doesn't match the declared `subject_nature` is simply
 * not forwarded, not rejected — `validateScreeningSubject`/TypeBox already establish shape). Empty
 * optional fields are omitted entirely, never sent as empty strings.
 */
export function buildProviderScreeningPayload(subjectNature: SubjectNature, declared: DeclaredIdentity): ProviderScreeningPayload {
  const payload: ProviderScreeningPayload = { name: declared.name, subject_nature: subjectNature };
  if (declared.country) payload.country = declared.country;
  if (subjectNature === "entity" && declared.registration_number) payload.registration_number = declared.registration_number;
  if (subjectNature === "individual" && declared.date_of_birth) payload.date_of_birth = declared.date_of_birth;
  if (subjectNature === "individual" && declared.nationality) payload.nationality = declared.nationality;
  return payload;
}

export interface NormalizedMatch {
  category: ScreeningMatchCategory;
  score: number | null;
  list_source: string;
  matched_name: string;
  match_detail: string | null;
}

const MATCHED_NAME_MAX_LENGTH = 256;
const LIST_SOURCE_MAX_LENGTH = 64;
/** `match_detail` is a `text` column (DB-unbounded) — clamped defensively anyway, the same
 * "untrusted upstream, never trust its length" discipline `lib/clt1-client.ts`'s own
 * `clampFailureReasonCode` established for CLT-01's `error.code`. */
const MATCH_DETAIL_MAX_LENGTH = 4000;

/** Clamps into `[0, 1]` and rounds to 3 decimal places (`screening_match.score numeric(4,3)`).
 * `null`/`undefined`/non-finite input is preserved as `null` — Phase 3B decision D3: a provider
 * that supplies no confidence score is represented as `NULL`, never a misleading `0.000` sentinel. */
function clampScore(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  const clamped = Math.min(1, Math.max(0, raw));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Normalizes a provider's raw matches into AML-01's own closed `sanctions`/`pep`/`adverse_media`
 * category set. Returns `null` (fail closed) if ANY raw match carries a category outside that set
 * — never silently bucketed into `adverse_media`, never silently dropped (approved Phase 3
 * planning report §8 D8). The caller (`routes/screening.ts`) maps a `null` return to
 * `AML1_VENDOR_RESPONSE_INVALID`. Score is disposition-support data only — normalization NEVER
 * auto-confirms or auto-dismisses a match; a provider can only ever produce `clear`/
 * `potential_match` (see `deriveOverallStatus`), never `confirmed_hit` — that remains the sole
 * output of human disposition (Phase 2B).
 */
export function normalizeProviderMatches(rawMatches: ProviderRawMatch[]): NormalizedMatch[] | null {
  const normalized: NormalizedMatch[] = [];
  for (const raw of rawMatches) {
    if (!SCREENING_MATCH_CATEGORIES.includes(raw.category as ScreeningMatchCategory)) {
      return null;
    }
    normalized.push({
      category: raw.category as ScreeningMatchCategory,
      score: clampScore(raw.score),
      list_source: raw.list_source.slice(0, LIST_SOURCE_MAX_LENGTH),
      matched_name: raw.matched_name.slice(0, MATCHED_NAME_MAX_LENGTH),
      match_detail: raw.match_detail ? raw.match_detail.slice(0, MATCH_DETAIL_MAX_LENGTH) : null,
    });
  }
  return normalized;
}

/** `screening_result.overall_status` as derived from a NORMALIZED match set — `potential_match` if
 * any match survives normalization, else `clear`. `confirmed_hit`/`error` are never produced here
 * (see `normalizeProviderMatches`'s own header comment). */
export function deriveOverallStatus(matches: NormalizedMatch[]): "clear" | "potential_match" {
  return matches.length > 0 ? "potential_match" : "clear";
}

const FAILURE_REASON_CODE_MAX_LENGTH = 64;

/** `failure_reason_code` lands in `aml1.screening_provider_attempt.failure_reason_code varchar(64)`
 * — clamp defensively before returning, since the value originates from an untrusted provider
 * (mirrors `lib/clt1-client.ts`'s own `clampFailureReasonCode` for CLT-01's `error.code`). */
export function clampFailureReasonCode(code: string): string {
  return code.slice(0, FAILURE_REASON_CODE_MAX_LENGTH);
}

export interface SafeScreeningResponse {
  screening_request_id: string;
  subject_type: string;
  subject_ref: string;
  provenance: string;
  status: string;
  result: { overall_status: string; matched_categories: string[]; screened_at_utc: string } | null;
}

/**
 * Single safe-response projection point (mirrors CLT-01's own `safeApplicationResponse`/
 * `safeMandateResponse` precedent) — returns ONLY the fields listed in the approved Phase 1
 * design. Never returns: declared_identity.name/registration_number/date_of_birth/nationality/
 * subject_nature (screening_subject_snapshot PII/classification), matched_name/match_detail/score
 * (screening_match's most sensitive columns), or any raw match row. `matched_categories` is the
 * ONLY match-derived signal exposed — a deduplicated list of categories that produced a match,
 * never the matches themselves.
 */
export function safeScreeningResponse(row: {
  screening_request_id: string;
  subject_type: string;
  subject_ref: string;
  provenance: string;
  status: string;
  result?: { overall_status: string; screened_at_utc: string; matched_categories: string[] } | null;
}): SafeScreeningResponse {
  return {
    screening_request_id: row.screening_request_id,
    subject_type: row.subject_type,
    subject_ref: row.subject_ref,
    provenance: row.provenance,
    status: row.status,
    result: row.result
      ? { overall_status: row.result.overall_status, matched_categories: row.result.matched_categories, screened_at_utc: row.result.screened_at_utc }
      : null,
  };
}
