/**
 * IMP-02 measurement harness — Turn M-A foundation. Pure `C_iam` calculator.
 *
 * `C_iam` = the deployed IAM DB-connection-pool concurrency ceiling. Per the IMP-02 M1-M8
 * architecture turn's mathematical clarification: `iam_processes_total` means the TOTAL count of
 * live IAM processes across the entire named deployment — never a separate "process count" and
 * "instance count" silently multiplied together. This module accepts only that single,
 * already-combined total; it has no parameter that could be misread as a second multiplier.
 *
 * Zero production numeric constants appear anywhere in this file — every number this module
 * touches arrives as a caller-supplied, explicitly-evidenced argument. See
 * `tests/unit/perf-no-embedded-policy-constants.test.ts` for the structural guard on that
 * property.
 */

export type CIamResult =
  | { readonly status: "DETERMINED"; readonly value: number; readonly mode: "homogeneous" | "heterogeneous" }
  | { readonly status: "UNDETERMINED"; readonly reason: string };

export interface HomogeneousCIamInput {
  readonly mode: "homogeneous";
  /** Effective `pool.max` for every IAM process (all processes assumed identically
   * configured). Must be a positive integer, runtime-observed (see `m2a-observe.ts`) — never a
   * config-file value taken on faith. */
  readonly poolMax: number;
  /** Total live IAM processes across the ENTIRE named deployment — already combined, never
   * "instances × processes-per-instance" for the caller to multiply here. */
  readonly iamProcessesTotal: number;
  /** Free-text evidence citation (e.g. "observed_local_process — single dev/UAT run, NOT
   * production topology", or, once available, a deployment-manifest + live-census reference).
   * Required so a `DETERMINED` result is never unaccompanied by its own provenance. */
  readonly source: string;
}

export interface HeterogeneousCIamInput {
  readonly mode: "heterogeneous";
  /** One entry per live IAM process, each process's own effective `pool.max`. Summed, never
   * averaged-and-multiplied — this is the general case for a deployment where processes are not
   * identically configured. */
  readonly perProcessPoolMax: readonly number[];
  readonly source: string;
}

export type CIamInput = HomogeneousCIamInput | HeterogeneousCIamInput;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * `C_iam` is `DETERMINED` only when every contributing factor carries explicit evidence.
 * Absent, zero, negative, non-integer, or missing-source input returns `UNDETERMINED` with a
 * stated reason — never `0`, never `null`, never a silently assumed value. No production policy
 * may consume an `UNDETERMINED` result as though it were a number.
 */
export function computeCIam(input: CIamInput | undefined): CIamResult {
  if (!input) {
    return { status: "UNDETERMINED", reason: "no C_iam input supplied — process topology has not been evidenced" };
  }
  if (typeof input.source !== "string" || input.source.trim().length === 0) {
    return { status: "UNDETERMINED", reason: "C_iam input is missing a required evidence source citation" };
  }

  if (input.mode === "homogeneous") {
    if (!isPositiveInteger(input.poolMax)) {
      return { status: "UNDETERMINED", reason: "poolMax must be an evidenced positive integer" };
    }
    if (!isPositiveInteger(input.iamProcessesTotal)) {
      return {
        status: "UNDETERMINED",
        reason: "iamProcessesTotal must be an evidenced positive integer — production process topology is not yet evidenced in this repository",
      };
    }
    return { status: "DETERMINED", value: input.poolMax * input.iamProcessesTotal, mode: "homogeneous" };
  }

  // heterogeneous
  if (!Array.isArray(input.perProcessPoolMax) || input.perProcessPoolMax.length === 0) {
    return { status: "UNDETERMINED", reason: "perProcessPoolMax must be a non-empty array — no IAM process has been evidenced" };
  }
  let total = 0;
  for (const poolMax of input.perProcessPoolMax) {
    if (!isPositiveInteger(poolMax)) {
      return { status: "UNDETERMINED", reason: "every entry in perProcessPoolMax must be an evidenced positive integer" };
    }
    total += poolMax;
  }
  return { status: "DETERMINED", value: total, mode: "heterogeneous" };
}
