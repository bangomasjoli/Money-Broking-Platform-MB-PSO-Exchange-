import { describe, it, expect } from "vitest";
import {
  AppError,
  FND_ERROR_CODES,
  errorEnvelope,
  successEnvelope,
  toAppError,
  type EnvelopeMeta,
} from "@aix/foundation";

const meta: EnvelopeMeta = {
  request_id: "req_1",
  correlation_id: "corr_1",
  server_time_utc: "2026-01-01T00:00:00Z",
};

describe("error catalogue + envelopes", () => {
  it("AppError carries catalogue http status", () => {
    const err = new AppError("MODULE_NOT_REGISTERED");
    expect(err.http).toBe(FND_ERROR_CODES.MODULE_NOT_REGISTERED.http);
    expect(err.code).toBe("MODULE_NOT_REGISTERED");
  });

  it("success envelope has success:true and meta", () => {
    const env = successEnvelope({ x: 1 }, meta);
    expect(env.success).toBe(true);
    expect(env.correlation_id).toBe("corr_1");
    expect(env.data).toEqual({ x: 1 });
  });

  it("error envelope never leaks internals, only code+message+details", () => {
    const err = new AppError("VALIDATION_ERROR", { details: [{ field: "a", issue: "bad" }] });
    const env = errorEnvelope(err, meta);
    expect(env.success).toBe(false);
    expect(env.error.code).toBe("VALIDATION_ERROR");
    expect(env.error.details).toEqual([{ field: "a", issue: "bad" }]);
    expect(Object.keys(env.error)).toEqual(["code", "message", "details"]);
  });

  it("toAppError maps unknown throwables to INTERNAL_ERROR", () => {
    const err = toAppError(new Error("boom"));
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.http).toBe(500);
  });
});
