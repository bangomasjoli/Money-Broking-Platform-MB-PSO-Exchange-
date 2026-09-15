/**
 * FND-FIND-010 auditability — services/iam/src/index.ts's startup log line was extended to
 * record the EFFECTIVE db-pool capacity inputs. This guards that extension against regression:
 * the capacity values must be present, and DATABASE_URL/credentials must never be added to that
 * log call. `main()` itself calls `app.listen()` and is not practically unit-testable without a
 * live server (no existing precedent in this repository for testing a service's index.ts
 * directly) — this suite instead statically verifies the actual committed log-call text, the
 * same text/structure-assertion pattern this repository already uses for config files that
 * cannot be cheaply exercised live (e.g. tests/unit/imp02-edge-config.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX_TS_PATH = join(__dirname, "../../services/iam/src/index.ts");
const indexTs = readFileSync(INDEX_TS_PATH, "utf8");

/** Strips `//`-prefixed line comments (this repo's established convention for text-assertion
 * tests — see e.g. tests/unit/imp02-edge-config.test.ts's stripComments) so an explanatory
 * comment mentioning a word (e.g. "DATABASE_URL is never logged") cannot itself defeat a
 * negative assertion about the real, executable log-call code. */
function stripLineComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/** Extracts the CODE (comments stripped) of the `app.log.info({...}, "iam_service_started")` call. */
function extractStartupLogCall(source: string): string {
  const code = stripLineComments(source);
  const marker = "iam_service_started";
  const idx = code.indexOf(marker);
  if (idx === -1) throw new Error("iam_service_started log call not found in services/iam/src/index.ts");
  const callStart = code.lastIndexOf("app.log.info(", idx);
  if (callStart === -1) throw new Error("could not locate the enclosing app.log.info( call");
  const callEnd = code.indexOf(");", idx);
  if (callEnd === -1) throw new Error("could not locate the end of the app.log.info( call");
  return code.slice(callStart, callEnd + 2);
}

const logCall = extractStartupLogCall(indexTs);

describe("FND-FIND-010 — IAM startup log records capacity, never credentials", () => {
  it("the startup log call includes the effective dbPoolMax and dbConnectionTimeoutMs fields", () => {
    expect(logCall).toMatch(/dbPoolMax\s*:/);
    expect(logCall).toMatch(/dbConnectionTimeoutMs\s*:/);
  });

  it("the startup log call never references databaseUrl or DATABASE_URL", () => {
    expect(logCall).not.toMatch(/databaseUrl/i);
    expect(logCall).not.toMatch(/DATABASE_URL/);
  });

  it("the startup log call never references a password, token, or secret field", () => {
    expect(logCall).not.toMatch(/password/i);
    expect(logCall).not.toMatch(/token/i);
    expect(logCall).not.toMatch(/secret/i);
  });

  it("the log call records 'unset (node-postgres library default)' when a value is absent, never a substituted number", () => {
    expect(logCall).toContain("unset (node-postgres library default)");
  });
});
