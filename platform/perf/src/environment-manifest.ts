/**
 * IMP-02 measurement harness — Turn M-A foundation. Environment fingerprint collector.
 *
 * Architecture §6: "a measurement without its environment fingerprint is inadmissible for
 * policy derivation." This module collects the categories that turn's §6 requires — provenance,
 * host, runtime, database, service topology, placement, dataset — and FAILS EXPLICITLY (throws)
 * when a truly mandatory field cannot be obtained, rather than substituting the string
 * "unknown". Fields that are genuinely best-effort (never installed to obtain, per this turn's
 * instruction) are typed as present-with-an-explicit-not-determined marker, never silently
 * omitted and never disguised as a satisfied mandatory field.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as os from "node:os";
import { HARNESS_VERSION, type EnvironmentManifestRef } from "./schema.js";

export class EnvironmentManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentManifestError";
  }
}

// ---------------------------------------------------------------------------------------------
// Provenance (git)
// ---------------------------------------------------------------------------------------------

export interface GitInfo {
  readonly commitSha: string;
  readonly workingTreeClean: boolean;
}

/** The real git provider — invoked with no shell interpolation (execFileSync + argv array).
 * Throws `EnvironmentManifestError` if git itself is unavailable or the working directory is
 * not inside a git repository; provenance is mandatory, so this is a hard failure, never a
 * silent "unknown" commit SHA. */
export function readRealGitInfo(cwd: string = import.meta.dirname): GitInfo {
  let commitSha: string;
  try {
    commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch (err) {
    throw new EnvironmentManifestError(`unable to determine commit SHA (git rev-parse HEAD failed): ${(err as Error).message}`);
  }
  if (!commitSha) {
    throw new EnvironmentManifestError("git rev-parse HEAD returned an empty commit SHA");
  }

  let porcelain: string;
  try {
    porcelain = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
  } catch (err) {
    throw new EnvironmentManifestError(`unable to determine working-tree status (git status --porcelain failed): ${(err as Error).message}`);
  }

  return { commitSha, workingTreeClean: porcelain.trim().length === 0 };
}

// ---------------------------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------------------------

export interface HostFingerprint {
  readonly platform: string;
  readonly arch: string;
  readonly release: string;
  readonly cpu_model: string;
  readonly logical_cpu_count: number;
  readonly total_memory_bytes: number;
  /** Best-effort, privilege-free, portable virtualization signal. `determined: false` is an
   * honest "could not tell", never presented as though it were a confirmed bare-metal result. */
  readonly virtualization_hint: { readonly determined: false } | { readonly determined: true; readonly value: string };
}

function detectVirtualizationHint(): HostFingerprint["virtualization_hint"] {
  // Linux-only, privilege-free, best-effort signals. macOS/other platforms: not determined —
  // this platform's disposable UAT harness already documents its own virtualization (Lima/vz)
  // out of band; this function does not attempt to replicate that knowledge.
  if (os.platform() !== "linux") {
    return { determined: false };
  }
  try {
    if (existsSync("/.dockerenv")) {
      return { determined: true, value: "container (docker-marker-file)" };
    }
  } catch {
    // fall through to the next signal
  }
  try {
    const cpuinfo = readFileSync("/proc/cpuinfo", "utf8");
    if (/^flags\s*:.*\bhypervisor\b/m.test(cpuinfo)) {
      return { determined: true, value: "virtualized (cpuinfo hypervisor flag)" };
    }
  } catch {
    // /proc/cpuinfo unreadable in this environment — fall through
  }
  return { determined: false };
}

/** Every field here is obtainable via `node:os` without privilege on every platform this repo
 * targets, so all of them are mandatory — throws if `os.cpus()` is unexpectedly empty (the one
 * field that could theoretically come back empty in a sufficiently restricted environment)
 * rather than substituting a placeholder. */
export function collectHostFingerprint(): HostFingerprint {
  const cpus = os.cpus();
  if (!Array.isArray(cpus) || cpus.length === 0) {
    throw new EnvironmentManifestError("host fingerprint unavailable: os.cpus() returned no CPU information");
  }
  const totalMemory = os.totalmem();
  if (typeof totalMemory !== "number" || totalMemory <= 0) {
    throw new EnvironmentManifestError("host fingerprint unavailable: os.totalmem() did not return a usable value");
  }
  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    cpu_model: cpus[0]!.model,
    logical_cpu_count: cpus.length,
    total_memory_bytes: totalMemory,
    virtualization_hint: detectVirtualizationHint(),
  };
}

// ---------------------------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------------------------

export interface RuntimeFingerprint {
  readonly node_version: string;
  /** Best-effort — read from the already-installed package's own `package.json`, never
   * installed to obtain. Absent (not "unknown") if the package cannot be located. */
  readonly pg_package_version?: string;
  readonly fastify_package_version?: string;
}

function readInstalledPackageVersion(packageName: string): string | undefined {
  try {
    // platform/perf/src -> platform/node_modules/<packageName>/package.json. Reads only
    // already-installed metadata — never triggers an install.
    const packageJsonPath = resolve(import.meta.dirname, "..", "..", "node_modules", packageName, "package.json");
    if (!existsSync(packageJsonPath)) return undefined;
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

export function collectRuntimeFingerprint(): RuntimeFingerprint {
  const pgVersion = readInstalledPackageVersion("pg");
  const fastifyVersion = readInstalledPackageVersion("fastify");
  return {
    node_version: process.version,
    ...(pgVersion !== undefined ? { pg_package_version: pgVersion } : {}),
    ...(fastifyVersion !== undefined ? { fastify_package_version: fastifyVersion } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Database (conditional — only when a database was actually consulted)
// ---------------------------------------------------------------------------------------------

/** Deliberately excludes host/port/database-name: this turn takes the conservative reading of
 * "may be recorded only if safe under existing conventions" — since no existing convention in
 * this repository establishes that reading connection topology into evidence is safe, none of
 * it is recorded. `observed: true` plus the settings below is the full database fingerprint. */
export type DatabaseFingerprint =
  | { readonly observed: false }
  | {
      readonly observed: true;
      readonly postgres_version: string;
      readonly max_connections: number;
      readonly superuser_reserved_connections: number;
      readonly shared_buffers?: string;
      readonly synchronous_commit?: string;
      readonly wal_level?: string;
      readonly fsync?: string;
      readonly full_page_writes?: string;
    };

export const NOT_OBSERVED_DATABASE: DatabaseFingerprint = { observed: false };

// ---------------------------------------------------------------------------------------------
// Service topology (conditional)
// ---------------------------------------------------------------------------------------------

export type ServiceTopologyFingerprint =
  | { readonly observed: false; readonly reason: string }
  | {
      readonly observed: true;
      readonly iam_processes_total: number;
      /** Explicit, separate from `iam_processes_total` — never auto-multiplied against it (per
       * this turn's mathematical clarification). Recorded only when independently known. */
      readonly iam_instance_count?: number;
      readonly iam_pool_max?: number;
      readonly iam_connection_timeout_millis?: number;
      /** Evidence citation — e.g. "observed_local_process" for a single dev/UAT-run process
       * census. Required so a reader can judge whether this reflects production topology (it
       * does not, until the citation says so). */
      readonly source: string;
    };

export function notObservedServiceTopology(reason: string): ServiceTopologyFingerprint {
  return { observed: false, reason };
}

// ---------------------------------------------------------------------------------------------
// Placement (conditional — no distributed generator exists yet in Turn M-A)
// ---------------------------------------------------------------------------------------------

export type PlacementFingerprint = { readonly applicable: false; readonly reason: string };

export const NOT_APPLICABLE_PLACEMENT: PlacementFingerprint = {
  applicable: false,
  reason: "no load generator or distributed measurement topology exists yet (Turn M-A is foundation-only)",
};

// ---------------------------------------------------------------------------------------------
// Dataset (conditional — no workload is run in Turn M-A)
// ---------------------------------------------------------------------------------------------

export type DatasetFingerprint = { readonly applicable: false; readonly reason: string };

export const NOT_APPLICABLE_DATASET: DatasetFingerprint = {
  applicable: false,
  reason: "no workload is run in Turn M-A — no dataset is seeded or consulted",
};

// ---------------------------------------------------------------------------------------------
// Full manifest
// ---------------------------------------------------------------------------------------------

export interface EnvironmentManifest extends EnvironmentManifestRef {
  readonly provenance: {
    readonly commit_sha: string;
    readonly working_tree_clean: boolean;
    readonly run_id: string;
    readonly harness_version: string;
    readonly timestamp_utc: string;
  };
  readonly host: HostFingerprint;
  readonly runtime: RuntimeFingerprint;
  readonly database: DatabaseFingerprint;
  readonly service_topology: ServiceTopologyFingerprint;
  readonly placement: PlacementFingerprint;
  readonly dataset: DatasetFingerprint;
}

export interface BuildEnvironmentManifestInput {
  readonly runId: string;
  /** Injectable for tests (e.g. to simulate a dirty tree deterministically without needing an
   * actually-dirty repository); defaults to `readRealGitInfo`. */
  readonly gitInfoProvider?: () => GitInfo;
  readonly database?: DatabaseFingerprint;
  readonly serviceTopology?: ServiceTopologyFingerprint;
  readonly placement?: PlacementFingerprint;
  readonly dataset?: DatasetFingerprint;
  /** Injectable for deterministic tests; defaults to `new Date()`. */
  readonly now?: Date;
}

/**
 * Builds the full environment manifest. Provenance, host, and runtime are always collected (and
 * throw explicitly if a mandatory field is unavailable — never "unknown"). Database,
 * service_topology, placement, and dataset default to their explicit not-observed/not-applicable
 * markers unless the caller supplies an already-collected fingerprint for that category.
 */
export function buildEnvironmentManifest(input: BuildEnvironmentManifestInput): EnvironmentManifest {
  if (typeof input.runId !== "string" || input.runId.length === 0) {
    throw new EnvironmentManifestError("runId is required to build an environment manifest");
  }
  const gitInfo = (input.gitInfoProvider ?? readRealGitInfo)();
  const now = input.now ?? new Date();

  return {
    provenance: {
      commit_sha: gitInfo.commitSha,
      working_tree_clean: gitInfo.workingTreeClean,
      run_id: input.runId,
      harness_version: HARNESS_VERSION,
      timestamp_utc: now.toISOString(),
    },
    host: collectHostFingerprint(),
    runtime: collectRuntimeFingerprint(),
    database: input.database ?? NOT_OBSERVED_DATABASE,
    service_topology: input.serviceTopology ?? notObservedServiceTopology("no process topology was inspected in this run"),
    placement: input.placement ?? NOT_APPLICABLE_PLACEMENT,
    dataset: input.dataset ?? NOT_APPLICABLE_DATASET,
  };
}
