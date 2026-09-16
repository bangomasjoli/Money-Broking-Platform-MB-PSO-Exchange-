/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/environment-manifest.ts`. Covers: mandatory
 * category presence (provenance/host/runtime always collected; database/service_topology/
 * placement/dataset default to explicit not-observed/not-applicable markers), and dirty-tree
 * provenance being recorded truthfully (the REFUSAL to act on a dirty tree is the M2a observer's
 * own responsibility — see perf-m2a-observe.test.ts — this module's job is only to report the
 * truth about the tree, never to substitute "unknown").
 */
import { describe, expect, it } from "vitest";
import { buildEnvironmentManifest, EnvironmentManifestError } from "../../perf/src/environment-manifest.js";
import { assertValidEnvironmentManifest, MeasurementResultValidationError } from "../../perf/src/schema.js";

function fakeCleanGit() {
  return { commitSha: "deadbeef0000111122223333444455556666777788889999", workingTreeClean: true };
}

function fakeDirtyGit() {
  return { commitSha: "deadbeef0000111122223333444455556666777788889999", workingTreeClean: false };
}

describe("buildEnvironmentManifest — mandatory categories", () => {
  it("always collects provenance, host, and runtime", () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeCleanGit });
    expect(manifest.provenance.commit_sha).toBe(fakeCleanGit().commitSha);
    expect(manifest.provenance.run_id).toBe("run-test");
    expect(typeof manifest.host.platform).toBe("string");
    expect(manifest.host.logical_cpu_count).toBeGreaterThan(0);
    expect(typeof manifest.runtime.node_version).toBe("string");
  });

  it("defaults database to the explicit not-observed marker when not supplied", () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeCleanGit });
    expect(manifest.database).toEqual({ observed: false });
  });

  it("defaults service_topology to an explicit not-observed marker with a reason when not supplied", () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeCleanGit });
    expect(manifest.service_topology.observed).toBe(false);
    expect("reason" in manifest.service_topology).toBe(true);
  });

  it("defaults placement to not-applicable with a reason (Turn M-A has no distributed generator)", () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeCleanGit });
    expect(manifest.placement.applicable).toBe(false);
    expect(manifest.placement.reason).toMatch(/generator|topology/i);
  });

  it('defaults dataset to not-applicable, explicitly stating "no workload is run" (never a fabricated count)', () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeCleanGit });
    expect(manifest.dataset.applicable).toBe(false);
    expect(manifest.dataset.reason).toMatch(/no workload is run/);
  });

  it("throws when runId is missing", () => {
    // @ts-expect-error — deliberately omitted for this test
    expect(() => buildEnvironmentManifest({ gitInfoProvider: fakeCleanGit })).toThrow(EnvironmentManifestError);
  });
});

describe("buildEnvironmentManifest — dirty-tree provenance is reported truthfully", () => {
  it("records working_tree_clean: false when the git provider reports a dirty tree", () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeDirtyGit });
    expect(manifest.provenance.working_tree_clean).toBe(false);
  });

  it("records working_tree_clean: true when the git provider reports a clean tree", () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeCleanGit });
    expect(manifest.provenance.working_tree_clean).toBe(true);
  });
});

describe("assertValidEnvironmentManifest — used by schema.ts's createMeasurementResult", () => {
  it("accepts a fully-built manifest", () => {
    const manifest = buildEnvironmentManifest({ runId: "run-test", gitInfoProvider: fakeCleanGit });
    expect(() => assertValidEnvironmentManifest(manifest)).not.toThrow();
  });

  it("rejects undefined", () => {
    expect(() => assertValidEnvironmentManifest(undefined)).toThrow(MeasurementResultValidationError);
  });
});
