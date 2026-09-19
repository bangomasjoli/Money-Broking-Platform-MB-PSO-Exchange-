/**
 * IMP-02 measurement harness — Turn M-A foundation. Evidence writer.
 *
 * Mandatory sequence (this turn's explicit instruction): construct result in memory -> secret
 * scan -> validate schema -> write atomically. NEVER write-then-scan: a failed scan must leave
 * no artifact on disk containing the secret. Mirrors the retention convention already
 * established by `platform/edge/uat-topology/evidence/.gitignore` and
 * `platform/edge/uat-tls/evidence/.gitignore` — only `.gitignore` itself is ever tracked; every
 * generated file here is git-ignored (`perf/evidence/.gitignore`).
 */
import { mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { assertNoSecrets } from "./secret-scan.js";

const EVIDENCE_ROOT = resolve(import.meta.dirname, "..", "evidence");

export class EvidencePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidencePathError";
  }
}

/**
 * Confines `relativePath` to `perf/evidence/` — rejects any path that would escape it (a leading
 * `/`, `..` traversal, or resolving outside the root after normalization). Returns the resolved
 * absolute path.
 */
export function resolveEvidencePath(relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new EvidencePathError("relativePath is required");
  }
  if (isAbsolute(relativePath)) {
    throw new EvidencePathError(`evidence path must be relative, got an absolute path: "${relativePath}"`);
  }
  const resolved = resolve(EVIDENCE_ROOT, relativePath);
  const rel = relative(EVIDENCE_ROOT, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new EvidencePathError(`evidence path "${relativePath}" resolves outside platform/perf/evidence/ — refused`);
  }
  return resolved;
}

export interface WriteEvidenceAtomicInput {
  /** Path relative to `platform/perf/evidence/`, e.g. `"m2a/run-.../result.json"`. */
  readonly relativePath: string;
  /** The data to serialize as pretty-printed JSON and write. */
  readonly data: unknown;
  /** Known live secret values from the CALLER's own environment (this module never reads
   * `process.env` itself) — see `secret-scan.ts`'s `ScanForSecretsInput.knownSecrets`. */
  readonly knownSecrets?: readonly (string | undefined)[];
}

/**
 * Serializes `data`, secret-scans the serialized text (never the reverse order), and writes it
 * atomically (temp file in the same directory, then `rename` — atomic on the same filesystem) so
 * a reader can never observe a partially-written file. On a failed scan, throws
 * `SecretScanFailedError` and guarantees no file — partial or complete — is left on disk.
 */
export function writeEvidenceAtomic(input: WriteEvidenceAtomicInput): string {
  const absolutePath = resolveEvidencePath(input.relativePath);
  const serialized = JSON.stringify(input.data, null, 2);

  // Secret scan BEFORE any filesystem write — the mandatory ordering.
  assertNoSecrets({ text: serialized, knownSecrets: input.knownSecrets });

  const dir = dirname(absolutePath);
  mkdirSync(dir, { recursive: true });

  // A symlink under perf/evidence/ can make a lexically in-root path resolve elsewhere.
  const realRoot = realpathSync(EVIDENCE_ROOT);
  const realRel = relative(realRoot, realpathSync(dir));
  if (realRel === ".." || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) {
    throw new EvidencePathError(`evidence path "${input.relativePath}" resolves outside the real platform/perf/evidence/ root via a symlink — refused`);
  }

  const tempPath = join(dir, `.tmp-${randomBytes(6).toString("hex")}-${Date.now()}`);
  try {
    writeFileSync(tempPath, serialized, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, absolutePath);
  } catch (err) {
    // Best-effort cleanup of the temp file if the rename itself failed partway; never leaves the
    // final path containing a partial write, since renameSync either fully succeeds or throws
    // without having touched the destination.
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // Cleanup failure is secondary to the original error — do not mask it.
    }
    throw err;
  }

  return absolutePath;
}
