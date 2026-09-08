/**
 * Unit tests for services/aml1/src/lib/clt1-client.ts — AML-01's own CLT-01 outcome-delivery HTTP
 * client (F3(c), no live CLT-01 service). Mirrors tests/unit/clt1-cfg1-client.test.ts's shape:
 * the fetch call is stubbed via the `fetchImpl` DI seam, proving fail-closed behaviour on every
 * failure mode (non-2xx, network error, timeout, malformed response) and correct response-ref
 * extraction on success.
 */
import { describe, expect, it } from "vitest";
import { deliverApplicationOutcome, deliverAuthorisedPartyOutcome } from "../../services/aml1/src/lib/clt1-client.js";

const config = { baseUrl: "http://clt1.test", internalServiceToken: "test-token" };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function throwingFetch(err: Error): typeof fetch {
  return (async () => {
    throw err;
  }) as unknown as typeof fetch;
}

function malformedJsonFetch(status: number): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    json: async () => {
      throw new Error("not json");
    },
  })) as unknown as typeof fetch;
}

describe("deliverApplicationOutcome", () => {
  it("returns succeeded: true with responseRef on a real 201 CLT-01 response", async () => {
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: fakeFetch(201, { success: true, data: { outcome_id: "clt1cdd_1", outcome_type: "aml_sanctions", outcome_status: "pass" } }) },
      { applicationId: "clt1app_1", outcomeType: "aml_sanctions", outcomeStatus: "pass", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: true, responseRef: "clt1cdd_1" });
  });

  it("fails closed on a non-2xx response (e.g. CLT1_APPLICATION_INVALID_STATE) with the CLT-01 error code surfaced", async () => {
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: fakeFetch(409, { success: false, error: { code: "CLT1_APPLICATION_INVALID_STATE" } }) },
      { applicationId: "clt1app_2", outcomeType: "aml_sanctions", outcomeStatus: "pending", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "CLT1_APPLICATION_INVALID_STATE" });
  });

  it("fails closed on a non-2xx response with an unparseable error body", async () => {
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: malformedJsonFetch(500) },
      { applicationId: "clt1app_3", outcomeType: "pep_adverse_media", outcomeStatus: "hit", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "clt1_unavailable" });
  });

  it("fails closed on a malformed/unparseable 2xx response body", async () => {
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: malformedJsonFetch(200) },
      { applicationId: "clt1app_4", outcomeType: "aml_sanctions", outcomeStatus: "pass", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "clt1_malformed_response" });
  });

  it("fails closed on a 2xx response missing success: true", async () => {
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: fakeFetch(200, { success: false }) },
      { applicationId: "clt1app_5", outcomeType: "aml_sanctions", outcomeStatus: "pass", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "clt1_malformed_response" });
  });

  it("fails closed on a network error", async () => {
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: throwingFetch(new Error("connection refused")) },
      { applicationId: "clt1app_6", outcomeType: "aml_sanctions", outcomeStatus: "pass", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "clt1_unavailable" });
  });

  it("fails closed with a distinct reason code on a request timeout (AbortError/TimeoutError)", async () => {
    const timeoutErr = new Error("The operation was aborted");
    timeoutErr.name = "TimeoutError";
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: throwingFetch(timeoutErr) },
      { applicationId: "clt1app_7", outcomeType: "aml_sanctions", outcomeStatus: "pass", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "clt1_timeout" });
  });

  it("succeeds with responseRef: null when CLT-01's success body omits outcome_id", async () => {
    const result = await deliverApplicationOutcome(
      { ...config, fetchImpl: fakeFetch(201, { success: true, data: {} }) },
      { applicationId: "clt1app_8", outcomeType: "aml_sanctions", outcomeStatus: "pass", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: true, responseRef: null });
  });
});

describe("deliverAuthorisedPartyOutcome", () => {
  it("returns succeeded: true with responseRef on a real 200 CLT-01 response", async () => {
    const result = await deliverAuthorisedPartyOutcome(
      { ...config, fetchImpl: fakeFetch(200, { success: true, data: { authorised_party_id: "clt1party_1", sanctions_pep_status: "clear" } }) },
      { clientId: "clt1client_1", authorisedPartyId: "clt1party_1", sanctionsPepStatus: "clear", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: true, responseRef: "clt1party_1" });
  });

  it("fails closed on a non-2xx response (e.g. CLT1_CLIENT_NOT_ACTIVE)", async () => {
    const result = await deliverAuthorisedPartyOutcome(
      { ...config, fetchImpl: fakeFetch(409, { success: false, error: { code: "CLT1_CLIENT_NOT_ACTIVE" } }) },
      { clientId: "clt1client_2", authorisedPartyId: "clt1party_2", sanctionsPepStatus: "hit", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "CLT1_CLIENT_NOT_ACTIVE" });
  });

  it("fails closed on a network error", async () => {
    const result = await deliverAuthorisedPartyOutcome(
      { ...config, fetchImpl: throwingFetch(new Error("connection refused")) },
      { clientId: "clt1client_3", authorisedPartyId: "clt1party_3", sanctionsPepStatus: "review_required", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(result).toEqual({ succeeded: false, failureReasonCode: "clt1_unavailable" });
  });

  it("never sends identity_verification_status in the request body (KYC-01's field, not AML-01's)", async () => {
    let capturedBody: string | undefined;
    const capturingFetch = (async (_url: string, init: { body: string }) => {
      capturedBody = init.body;
      return { ok: true, json: async () => ({ success: true, data: { authorised_party_id: "clt1party_4" } }) };
    }) as unknown as typeof fetch;

    await deliverAuthorisedPartyOutcome(
      { ...config, fetchImpl: capturingFetch },
      { clientId: "clt1client_4", authorisedPartyId: "clt1party_4", sanctionsPepStatus: "clear", sourceModule: "AML-01", createdBy: "aml1_internal_service" },
    );
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody as string);
    expect(parsed).not.toHaveProperty("identity_verification_status");
    expect(parsed).toEqual({ sanctions_pep_status: "clear", source_module: "AML-01", created_by: "aml1_internal_service" });
  });
});
