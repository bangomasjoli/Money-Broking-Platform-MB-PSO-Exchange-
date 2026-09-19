/**
 * IMP-02 measurement harness — Turn M-A foundation.
 *
 * Result-status model, measurement-ID model, and the `MeasurementResult` envelope, per the
 * IMP-02 M1-M8 capacity-calibration architecture (Opus, architecture-only turn, no file
 * changes) §39-40. This module defines TYPES and a validating CONSTRUCTOR only — it produces
 * no measurement data itself.
 *
 * "Measurement", never "benchmark": a local/UAT-shaped result is never automatically
 * production-representative, and the word "benchmark" implies exactly that. This word is
 * deliberately absent from every identifier, string literal, and file name under `perf/`.
 */

/** The five controlled result states. `OBSERVED` is the default for nearly every result — see
 * `validateStatusThresholdPairing` below for the load-bearing invariant this file enforces. */
export type ResultStatus = "OBSERVED" | "PASS" | "FAIL" | "INCONCLUSIVE" | "INVALID";

const RESULT_STATUSES = ["OBSERVED", "PASS", "FAIL", "INCONCLUSIVE", "INVALID"] as const satisfies readonly ResultStatus[];

/**
 * Controlled measurement identifiers (IMP-02 M1-M8 architecture §41-42). `M2` itself is
 * deliberately NOT a member — only its two evidenced sub-parts, `M2a` (application-side pool
 * configuration, observable now) and `M2b` (deployment process topology, currently blocked),
 * exist as measurement IDs. There is no `M8b`: the `K_max` demographic-sharing assumption is a
 * governance input (architecture §31-32), never an engineering measurement result — so it is
 * structurally absent from this union, not merely undocumented.
 */
export type MeasurementId =
  | "M1"
  | "M2a"
  | "M2b"
  | "M3"
  | "M4"
  | "M5"
  | "M6"
  | "M7-UAT"
  | "M7-PROD"
  | "M8a";

/** Runtime-enumerable mirror of `MeasurementId`, for tests and validation that need to iterate
 * or assert non-membership (e.g. proving `"M2"` and `"M8b"` are not valid identifiers). Keep in
 * sync with the type above by construction — this is the single source of truth. */
export const ALL_MEASUREMENT_IDS = [
  "M1",
  "M2a",
  "M2b",
  "M3",
  "M4",
  "M5",
  "M6",
  "M7-UAT",
  "M7-PROD",
  "M8a",
] as const satisfies readonly MeasurementId[];

/** Harness version — bumped when the result schema or evidence format changes in a way that
 * matters to a later reader reconciling old evidence against new code. Independent of the
 * platform's own module versioning. */
export const HARNESS_VERSION = "0.1.0";

/**
 * The envelope every measurement result is wrapped in, regardless of measurement type. Turn M-A
 * implements only the `M2a` producer (see `m2a-observe.ts`); `M1`/`M3`-`M8a` producers are Turn
 * M-B+ and are not built here. `details` carries the measurement-specific payload — Turn M-A
 * defines only `M2aDetails` (see below).
 */
export interface MeasurementResult<TDetails = unknown> {
  readonly measurement_id: MeasurementId;
  readonly run_id: string;
  readonly status: ResultStatus;
  /** REQUIRED, non-empty, when `status` is `"PASS"` or `"FAIL"`; MUST be absent for every other
   * status (architecture §39-40 — this is the schema rule that stops an unapproved observation
   * from being mistaken for a governed pass/fail). Extended here, deliberately, to also forbid
   * it on `"INCONCLUSIVE"`/`"INVALID"`: those states describe a run's own validity, never a
   * judgement against a governed number. */
  readonly threshold_ref?: string;
  readonly timestamp_utc_start: string;
  readonly timestamp_utc_end: string;
  readonly commit_sha: string;
  readonly working_tree_clean: boolean;
  readonly harness_version: string;
  readonly environment: EnvironmentManifestRef;
  /** Explicit statements of what this result does NOT prove. Mandatory and non-empty — every
   * measurement result must say what it does not establish, not only what it does. */
  readonly does_not_prove: readonly string[];
  readonly contaminants?: readonly string[];
  readonly assumptions?: readonly string[];
  readonly details: TDetails;
}

/**
 * Minimal structural shape `createMeasurementResult` requires of an environment manifest to
 * consider it present. The full manifest shape lives in `environment-manifest.ts`; this is
 * intentionally a narrow structural reference (not an import of the full type) so `schema.ts`
 * has no dependency on manifest construction — only on manifest PRESENCE and shape validity.
 */
export interface EnvironmentManifestRef {
  readonly provenance: {
    readonly commit_sha: string;
    readonly run_id: string;
    readonly harness_version: string;
  };
  readonly host: {
    readonly platform: string;
    readonly arch: string;
    readonly logical_cpu_count: number;
  };
  readonly runtime: {
    readonly node_version: string;
  };
  /** Present and explicit in every manifest — `{ observed: false }` when no database was
   * consulted (Turn M-A's default outside the M2a observer). */
  readonly database: { readonly observed: boolean } & Record<string, unknown>;
  /** Present and explicit — `{ observed: false, reason: string }` when no process topology was
   * inspected in this run. */
  readonly service_topology: { readonly observed: boolean } & Record<string, unknown>;
  /** Present and explicit — `{ applicable: false, reason: string }` for every Turn M-A run,
   * since no distributed generator exists yet. */
  readonly placement: { readonly applicable: boolean } & Record<string, unknown>;
  /** Present and explicit — `{ applicable: false, reason: "no workload is run" }` for Turn M-A,
   * per the architecture turn's explicit instruction: never fabricate dataset counts. */
  readonly dataset: { readonly applicable: boolean } & Record<string, unknown>;
}

export class MeasurementResultValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeasurementResultValidationError";
  }
}

/**
 * The load-bearing invariant (architecture §39-40, this turn's explicit instruction): `PASS`/
 * `FAIL` require a non-empty `threshold_ref`; every other status forbids one. Throws rather than
 * silently coercing — a caller that got this wrong needs to know immediately, not have its
 * result quietly reclassified.
 */
export function validateStatusThresholdPairing(status: ResultStatus, thresholdRef: string | undefined): void {
  const hasThreshold = typeof thresholdRef === "string" && thresholdRef.trim().length > 0;
  if (status === "PASS" || status === "FAIL") {
    if (!hasThreshold) {
      throw new MeasurementResultValidationError(
        `status "${status}" requires a non-empty threshold_ref naming a governed, approved threshold — none was provided. ` +
          `Never invent a threshold_ref to satisfy this check; use status "OBSERVED" when no governed threshold exists.`,
      );
    }
    return;
  }
  if (hasThreshold) {
    throw new MeasurementResultValidationError(
      `status "${status}" must NOT carry a threshold_ref (got "${thresholdRef}") — threshold_ref is reserved for ` +
        `governed PASS/FAIL judgements. A result without an approved threshold must be "OBSERVED", never dressed up ` +
        `with a threshold reference it does not actually have.`,
    );
  }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new MeasurementResultValidationError(`"${field}" is required and must be a non-empty string`);
  }
}

/**
 * Validates the structural presence of every category the environment manifest is required to
 * carry (architecture §6, this turn's instruction to fail explicitly rather than substitute
 * "unknown" for a missing mandatory field). Deliberately conservative: it does not reach inside
 * `database`/`service_topology`/`placement`/`dataset` beyond their own `observed`/`applicable`
 * discriminant, because those sub-shapes are conditionally populated — but it does insist the
 * discriminant itself is present, so a manifest can never silently omit a whole category.
 */
export function assertValidEnvironmentManifest(manifest: EnvironmentManifestRef | undefined): asserts manifest is EnvironmentManifestRef {
  if (!manifest || typeof manifest !== "object") {
    throw new MeasurementResultValidationError("environment manifest is required and was not provided");
  }
  if (!manifest.provenance || typeof manifest.provenance !== "object") {
    throw new MeasurementResultValidationError("environment manifest is missing required category: provenance");
  }
  assertNonEmptyString(manifest.provenance.commit_sha, "environment.provenance.commit_sha");
  assertNonEmptyString(manifest.provenance.run_id, "environment.provenance.run_id");
  assertNonEmptyString(manifest.provenance.harness_version, "environment.provenance.harness_version");

  if (!manifest.host || typeof manifest.host !== "object") {
    throw new MeasurementResultValidationError("environment manifest is missing required category: host");
  }
  assertNonEmptyString(manifest.host.platform, "environment.host.platform");
  assertNonEmptyString(manifest.host.arch, "environment.host.arch");
  if (typeof manifest.host.logical_cpu_count !== "number" || manifest.host.logical_cpu_count <= 0) {
    throw new MeasurementResultValidationError("environment.host.logical_cpu_count is required and must be a positive number");
  }

  if (!manifest.runtime || typeof manifest.runtime !== "object") {
    throw new MeasurementResultValidationError("environment manifest is missing required category: runtime");
  }
  assertNonEmptyString(manifest.runtime.node_version, "environment.runtime.node_version");

  for (const category of ["database", "service_topology", "placement", "dataset"] as const) {
    const value = manifest[category];
    if (!value || typeof value !== "object") {
      throw new MeasurementResultValidationError(`environment manifest is missing required category: ${category}`);
    }
  }
  if (typeof manifest.database.observed !== "boolean") {
    throw new MeasurementResultValidationError("environment.database.observed must be an explicit boolean — never omitted or substituted");
  }
  if (typeof manifest.service_topology.observed !== "boolean") {
    throw new MeasurementResultValidationError(
      "environment.service_topology.observed must be an explicit boolean — never omitted or substituted",
    );
  }
  if (typeof manifest.placement.applicable !== "boolean") {
    throw new MeasurementResultValidationError("environment.placement.applicable must be an explicit boolean — never omitted or substituted");
  }
  if (typeof manifest.dataset.applicable !== "boolean") {
    throw new MeasurementResultValidationError("environment.dataset.applicable must be an explicit boolean — never omitted or substituted");
  }
}

export interface CreateMeasurementResultInput<TDetails> {
  readonly measurement_id: MeasurementId;
  readonly run_id: string;
  /** Defaults to `"OBSERVED"` when omitted — the architecture's explicit default. */
  readonly status?: ResultStatus;
  readonly threshold_ref?: string;
  readonly timestamp_utc_start: string;
  readonly timestamp_utc_end: string;
  readonly commit_sha: string;
  readonly working_tree_clean: boolean;
  readonly environment: EnvironmentManifestRef;
  readonly does_not_prove: readonly string[];
  readonly contaminants?: readonly string[];
  readonly assumptions?: readonly string[];
  readonly details: TDetails;
  /** Overrides `HARNESS_VERSION` — for tests only; production callers should omit this. */
  readonly harness_version?: string;
}

/**
 * The single validating constructor for a `MeasurementResult`. Every producer (the Turn M-A
 * `M2a` observer, and every future M1/M3-M8a producer) must build its result through this
 * function rather than constructing the object literal directly, so the status/threshold
 * invariant and the environment-manifest presence check can never be bypassed.
 */
export function createMeasurementResult<TDetails>(
  input: CreateMeasurementResultInput<TDetails>,
): MeasurementResult<TDetails> {
  const status = input.status ?? "OBSERVED";
  if (!(RESULT_STATUSES as readonly unknown[]).includes(status)) {
    throw new MeasurementResultValidationError(
      `status ${JSON.stringify(status)} is not one of the controlled states: ${RESULT_STATUSES.join(", ")}`,
    );
  }
  if (!(ALL_MEASUREMENT_IDS as readonly unknown[]).includes(input.measurement_id)) {
    throw new MeasurementResultValidationError(
      `measurement_id ${JSON.stringify(input.measurement_id)} is not a controlled measurement identifier: ${ALL_MEASUREMENT_IDS.join(", ")}`,
    );
  }
  validateStatusThresholdPairing(status, input.threshold_ref);
  assertValidEnvironmentManifest(input.environment);

  assertNonEmptyString(input.run_id, "run_id");
  assertNonEmptyString(input.commit_sha, "commit_sha");
  assertNonEmptyString(input.timestamp_utc_start, "timestamp_utc_start");
  assertNonEmptyString(input.timestamp_utc_end, "timestamp_utc_end");
  if (typeof input.working_tree_clean !== "boolean") {
    throw new MeasurementResultValidationError('"working_tree_clean" is required and must be an explicit boolean');
  }
  if (!Array.isArray(input.does_not_prove) || input.does_not_prove.length === 0) {
    throw new MeasurementResultValidationError(
      '"does_not_prove" is required and must be a non-empty array — every measurement result must state what it does not establish',
    );
  }

  return {
    measurement_id: input.measurement_id,
    run_id: input.run_id,
    status,
    ...(input.threshold_ref !== undefined ? { threshold_ref: input.threshold_ref } : {}),
    timestamp_utc_start: input.timestamp_utc_start,
    timestamp_utc_end: input.timestamp_utc_end,
    commit_sha: input.commit_sha,
    working_tree_clean: input.working_tree_clean,
    harness_version: input.harness_version ?? HARNESS_VERSION,
    environment: input.environment,
    does_not_prove: input.does_not_prove,
    ...(input.contaminants !== undefined ? { contaminants: input.contaminants } : {}),
    ...(input.assumptions !== undefined ? { assumptions: input.assumptions } : {}),
    details: input.details,
  };
}
