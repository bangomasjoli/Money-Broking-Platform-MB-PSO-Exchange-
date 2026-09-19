/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/evidence-store.ts`. Covers the mandatory
 * construct -> secret-scan -> validate -> write sequence (never write-then-scan), path
 * confinement to `perf/evidence/`, and atomic-write behaviour.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EvidencePathError, resolveEvidencePath, writeEvidenceAtomic } from "../../perf/src/evidence-store.js";
import { SecretScanFailedError } from "../../perf/src/secret-scan.js";
import {
  ALL_MEASUREMENT_IDS,
  createMeasurementResult,
  MeasurementResultValidationError,
  type EnvironmentManifestRef,
  type MeasurementId,
  type ResultStatus,
} from "../../perf/src/schema.js";

const EVIDENCE_ROOT = resolve(import.meta.dirname, "..", "..", "perf", "evidence");
const TEST_SUBDIR = "perf-evidence-store-test";
const TEST_DIR = join(EVIDENCE_ROOT, TEST_SUBDIR);

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("resolveEvidencePath — path confinement", () => {
  it("resolves a normal relative path inside perf/evidence/", () => {
    const resolved = resolveEvidencePath(`${TEST_SUBDIR}/result.json`);
    expect(resolved).toBe(join(EVIDENCE_ROOT, TEST_SUBDIR, "result.json"));
  });

  it("rejects an absolute path", () => {
    expect(() => resolveEvidencePath("/etc/passwd")).toThrow(EvidencePathError);
  });

  it("rejects a path that escapes the evidence root via ../ traversal", () => {
    expect(() => resolveEvidencePath("../../etc/passwd")).toThrow(EvidencePathError);
  });

  it("rejects an empty path", () => {
    expect(() => resolveEvidencePath("")).toThrow(EvidencePathError);
  });
});

describe("writeEvidenceAtomic — secret-scan-before-write", () => {
  it("writes clean data and returns the resolved absolute path", () => {
    const path = writeEvidenceAtomic({ relativePath: `${TEST_SUBDIR}/clean.json`, data: { ok: true, value: 42 } });
    expect(existsSync(path)).toBe(true);
    const written = JSON.parse(readFileSync(path, "utf8"));
    expect(written).toEqual({ ok: true, value: 42 });
  });

  it("refuses to write data containing a private-key PEM marker, and leaves no file behind", () => {
    const relativePath = `${TEST_SUBDIR}/should-not-exist.json`;
    expect(() =>
      writeEvidenceAtomic({ relativePath, data: { note: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----" } }),
    ).toThrow(SecretScanFailedError);
    expect(existsSync(resolveEvidencePath(relativePath))).toBe(false);
  });

  it("refuses to write data containing a credential-embedded DATABASE_URL, and leaves no file behind", () => {
    const relativePath = `${TEST_SUBDIR}/should-not-exist-2.json`;
    expect(() =>
      writeEvidenceAtomic({ relativePath, data: { database_url: "postgres://aix:s3cr3t@db.internal:5432/aix" } }),
    ).toThrow(SecretScanFailedError);
    expect(existsSync(resolveEvidencePath(relativePath))).toBe(false);
  });

  it("refuses to write data containing a caller-declared known secret value, and leaves no file behind", () => {
    const relativePath = `${TEST_SUBDIR}/should-not-exist-3.json`;
    const knownSecret = "IAM_INTROSPECTION_SERVICE_TOKEN_VALUE_XYZ";
    expect(() =>
      writeEvidenceAtomic({ relativePath, data: { header: knownSecret }, knownSecrets: [knownSecret] }),
    ).toThrow(SecretScanFailedError);
    expect(existsSync(resolveEvidencePath(relativePath))).toBe(false);
  });

  it("leaves no temp file behind after a failed write (secret scan happens before any filesystem touch)", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const before = existsSync(TEST_DIR) ? readdirSync(TEST_DIR) : [];
    expect(() =>
      writeEvidenceAtomic({ relativePath: `${TEST_SUBDIR}/x.json`, data: { k: "-----BEGIN PRIVATE KEY-----" } }),
    ).toThrow(SecretScanFailedError);
    const after = existsSync(TEST_DIR) ? readdirSync(TEST_DIR) : [];
    expect(after).toEqual(before);
  });

  it("a completed write never leaves a .tmp- file behind in the target directory", () => {
    writeEvidenceAtomic({ relativePath: `${TEST_SUBDIR}/final.json`, data: { done: true } });
    const files = readdirSync(TEST_DIR);
    expect(files.some((f) => f.startsWith(".tmp-"))).toBe(false);
    expect(files).toContain("final.json");
  });
});

describe("writeEvidenceAtomic — symlink containment", () => {
  it("rejects an in-root symlink that resolves outside the real evidence root, and writes nothing outside", () => {
    const outside = mkdtempSync(join(tmpdir(), "perf-evidence-outside-"));
    try {
      mkdirSync(TEST_DIR, { recursive: true });
      symlinkSync(outside, join(TEST_DIR, "escape"), "dir");

      expect(() =>
        writeEvidenceAtomic({ relativePath: `${TEST_SUBDIR}/escape/result.json`, data: { ok: true } }),
      ).toThrow(EvidencePathError);
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("still writes through an in-root real subdirectory", () => {
    const path = writeEvidenceAtomic({ relativePath: `${TEST_SUBDIR}/nested/deeper/ok.json`, data: { ok: true } });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ ok: true });
  });
});

describe("createMeasurementResult — runtime validation of status and measurement_id", () => {
  const manifest: EnvironmentManifestRef = {
    provenance: { commit_sha: "deadbeef", run_id: "run-test", harness_version: "0.1.0" },
    host: { platform: "darwin", arch: "arm64", logical_cpu_count: 8 },
    runtime: { node_version: "v24.0.0" },
    database: { observed: false },
    service_topology: { observed: false },
    placement: { applicable: false },
    dataset: { applicable: false },
  };

  function build(measurementId: string, status?: string, thresholdRef?: string) {
    return createMeasurementResult({
      measurement_id: measurementId as MeasurementId,
      run_id: "run-test",
      ...(status !== undefined ? { status: status as ResultStatus } : {}),
      ...(thresholdRef !== undefined ? { threshold_ref: thresholdRef } : {}),
      timestamp_utc_start: "2026-01-01T00:00:00.000Z",
      timestamp_utc_end: "2026-01-01T00:00:01.000Z",
      commit_sha: "deadbeef",
      working_tree_clean: true,
      environment: manifest,
      does_not_prove: ["x"],
      details: {},
    });
  }

  it("rejects a status outside the five controlled states", () => {
    expect(() => build("M2a", "APPROVED")).toThrow(MeasurementResultValidationError);
    expect(() => build("M2a", "APPROVED", "governed_threshold_id")).toThrow(MeasurementResultValidationError);
    expect(() => build("M2a", "observed")).toThrow(MeasurementResultValidationError);
  });

  it.each(["M2", "M8b", "", "m2a", "M7"])("rejects measurement_id %j", (id) => {
    expect(() => build(id)).toThrow(MeasurementResultValidationError);
  });

  it.each(ALL_MEASUREMENT_IDS)("accepts controlled measurement_id %s", (id) => {
    expect(build(id).measurement_id).toBe(id);
  });

  it.each(["OBSERVED", "INCONCLUSIVE", "INVALID"])("accepts status %s without a threshold_ref", (status) => {
    expect(build("M2a", status).status).toBe(status);
  });

  it.each(["PASS", "FAIL"])("accepts status %s with a threshold_ref", (status) => {
    expect(build("M2a", status, "governed_threshold_id").status).toBe(status);
  });
});
