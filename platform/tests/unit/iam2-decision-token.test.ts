/**
 * IAM-02 Phase 3 — decision-token issuance/verification unit tests (no DB — a fake in-memory
 * PoolClient stands in for Postgres, mirroring tests/unit/iam2-guard.test.ts's pattern:
 * dispatch on stable substrings of the SQL text lib/decision-token.ts actually issues).
 *
 * Covers: issuance shape (opaque raw token distinct from its persisted hash, every bound
 * field present, expiry in the future), and every execute-verify failure mode
 * (missing/expired/wrong-status, payload-hash mismatch + revocation, stale cache version,
 * session mismatch, single-use consumption) plus the happy path.
 */
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { createRequestContext, runWithContext } from "@aix/foundation";
import {
  issueDecisionToken,
  verifyAndConsumeDecisionToken,
  sha256Hex,
  type IssueDecisionTokenInput,
} from "../../services/iam2/src/lib/decision-token.js";

interface StoredToken {
  decision_token_id: string;
  token_hash: string;
  actor_user_id: string;
  session_id: string | null;
  action: string;
  resource: string;
  entity_id: string | null;
  client_id: string | null;
  payload_hash: string | null;
  approval_id: string | null;
  cache_version: number | null;
  status: string;
  expires_at_utc: string;
}

class FakeDecisionTokenClient {
  tokens = new Map<string, StoredToken>();
  cacheVersion = 0;
  outboxInserts = 0;

  async query(text: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    if (text.includes("INSERT INTO iam2.permission_decision_token")) {
      const [
        decision_token_id,
        token_hash,
        actor_user_id,
        session_id,
        ,
        action,
        resource,
        entity_id,
        client_id,
        payload_hash,
        approval_id,
        ,
        cache_version,
        expires_at_utc,
      ] = params as string[];
      this.tokens.set(token_hash, {
        decision_token_id,
        token_hash,
        actor_user_id,
        session_id,
        action,
        resource,
        entity_id,
        client_id,
        payload_hash,
        approval_id,
        cache_version: cache_version as unknown as number,
        status: "active",
        expires_at_utc,
      });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("SELECT decision_token_id") && text.includes("FROM iam2.permission_decision_token")) {
      const [tokenHash] = params as string[];
      const row = this.tokens.get(tokenHash);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes("UPDATE iam2.permission_decision_token") && text.includes("'revoked'")) {
      const [decisionTokenId] = params as string[];
      for (const row of this.tokens.values()) if (row.decision_token_id === decisionTokenId) row.status = "revoked";
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("UPDATE iam2.permission_decision_token") && text.includes("'consumed'")) {
      const [decisionTokenId] = params as string[];
      for (const row of this.tokens.values()) if (row.decision_token_id === decisionTokenId) row.status = "consumed";
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("permission_cache_version")) {
      return { rows: [{ cache_version: this.cacheVersion }], rowCount: 1 };
    }
    if (text.includes("foundation.outbox_event")) {
      this.outboxInserts += 1;
      return { rows: [], rowCount: 1 };
    }
    throw new Error("FakeDecisionTokenClient: unmocked query: " + text);
  }
}

function baseIssueInput(overrides: Partial<IssueDecisionTokenInput> = {}): IssueDecisionTokenInput {
  return {
    actorUserId: "user_maker_1",
    sessionId: "sess_1",
    action: "withdrawal.approve",
    resource: "withdrawal",
    entityId: "wdr_1",
    clientId: "client_1",
    payloadHash: "sha256:abc123",
    approvalId: "appr_1",
    stepUpAssertionRef: null,
    cacheVersion: 5,
    ...overrides,
  };
}

async function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = createRequestContext({ actorType: "service" });
  return runWithContext(ctx, fn);
}

/** F1 fix — verifyAndConsumeDecisionToken now REQUIRES the presented actor/action/resource
 * (entity/client optional but compared) and checks them against the token's bound values
 * before anything else. Every test below that is not itself testing a BINDING mismatch must
 * present the SAME actor/action/resource/entity/client that `baseIssueInput()` bound the token
 * to, or the binding check would fire first and mask whatever failure mode the test actually
 * means to exercise. */
function matchingBindingContext(overrides: { actorUserId?: string; action?: string; resource?: string; entityId?: string | null; clientId?: string | null } = {}) {
  return {
    actorUserId: "user_maker_1",
    action: "withdrawal.approve",
    resource: "withdrawal",
    entityId: "wdr_1",
    clientId: "client_1",
    ...overrides,
  };
}

describe("IAM-02 decision-token issuance (lib/decision-token.ts)", () => {
  it("issues an opaque raw token distinct from its persisted hash, with every bound field present and a future expiry", async () => {
    const client = new FakeDecisionTokenClient();
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput()));

    expect(issued.rawToken).toBeTruthy();
    expect(issued.decisionTokenId).toMatch(/^dtok_/);
    expect(new Date(issued.expiresAtUtc).getTime()).toBeGreaterThan(Date.now());

    const stored = client.tokens.get(sha256Hex(issued.rawToken));
    expect(stored).toBeDefined();
    // The persisted hash must NOT equal the raw token (never store the raw secret).
    expect(stored!.token_hash).not.toBe(issued.rawToken);
    expect(stored!.actor_user_id).toBe("user_maker_1");
    expect(stored!.session_id).toBe("sess_1");
    expect(stored!.action).toBe("withdrawal.approve");
    expect(stored!.resource).toBe("withdrawal");
    expect(stored!.entity_id).toBe("wdr_1");
    expect(stored!.client_id).toBe("client_1");
    expect(stored!.payload_hash).toBe("sha256:abc123");
    expect(stored!.approval_id).toBe("appr_1");
    expect(stored!.cache_version).toBe(5);
    expect(stored!.status).toBe("active");
    expect(client.outboxInserts).toBe(1); // iam2.decision_token_issued audit
  });
});

describe("IAM-02 decision-token verification (execute-verify binding, lib/decision-token.ts)", () => {
  it("happy path: valid token + matching payload hash + matching cache version -> ok, and the token is single-use (consumed)", async () => {
    const client = new FakeDecisionTokenClient();
    client.cacheVersion = 5;
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput({ cacheVersion: 5 })));

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:abc123",
        sessionId: "sess_1",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("withdrawal.approve");
      expect(result.approvalId).toBe("appr_1");
      // F1 fix — verified_* flags reflect what was ACTUALLY checked, not hardcoded true.
      expect(result.verifiedPayloadHash).toBe(true); // a real hash was bound and matched
      expect(result.verifiedSession).toBe(true); // a real session_id was bound and matched
      expect(result.verifiedCacheVersion).toBe(true);
    }
    expect(client.tokens.get(sha256Hex(issued.rawToken))!.status).toBe("consumed");

    // Single-use: a second verify attempt with the SAME raw token fails (no longer active).
    const replay = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:abc123",
      }),
    );
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reasonCode).toBe("IAM2_DECISION_TOKEN_INVALID");
  });

  it("a token that has expired fails closed as IAM2_DECISION_TOKEN_INVALID", async () => {
    const client = new FakeDecisionTokenClient();
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput()));
    // Force expiry.
    client.tokens.get(sha256Hex(issued.rawToken))!.expires_at_utc = new Date(Date.now() - 60_000).toISOString();

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:abc123",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_DECISION_TOKEN_INVALID");
  });

  it("an unknown raw token (never issued) fails closed as IAM2_DECISION_TOKEN_INVALID", async () => {
    const client = new FakeDecisionTokenClient();
    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: "totally-made-up-token",
        // Binding values are irrelevant here — the token doesn't exist, so the
        // existence/status/expiry gate fails before the binding check even runs.
        ...matchingBindingContext(),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_DECISION_TOKEN_INVALID");
  });

  it("a mismatched current_payload_hash blocks execution as IAM2_PAYLOAD_HASH_MISMATCH and revokes the token so it can never be retried", async () => {
    const client = new FakeDecisionTokenClient();
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput({ payloadHash: "sha256:payloadA" })));

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:payloadB",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_PAYLOAD_HASH_MISMATCH");
    expect(client.tokens.get(sha256Hex(issued.rawToken))!.status).toBe("revoked");

    // Retrying with the CORRECT hash still fails — the token was revoked, not left active.
    const retry = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:payloadA",
      }),
    );
    expect(retry.ok).toBe(false);
  });

  it("a stale bound cache_version (permissions changed since issuance) blocks execution as IAM2_DECISION_TOKEN_STALE", async () => {
    const client = new FakeDecisionTokenClient();
    client.cacheVersion = 7;
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput({ cacheVersion: 7 })));
    // Simulate a role/permission mutation bumping the actor's cache version AFTER issuance.
    client.cacheVersion = 8;

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:abc123",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_DECISION_TOKEN_STALE");
  });

  it("a session_id presented that differs from the token's bound session fails closed", async () => {
    const client = new FakeDecisionTokenClient();
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput({ sessionId: "sess_bound" })));

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:abc123",
        sessionId: "sess_different",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_DECISION_TOKEN_INVALID");
  });

  it("no payload hash at issuance + none presented at verify -> matches (null == null), not a mismatch, and verifiedPayloadHash is false (nothing meaningful was checked)", async () => {
    const client = new FakeDecisionTokenClient();
    client.cacheVersion = 5; // must match baseIssueInput's default cacheVersion, or STALE fires first
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput({ payloadHash: null })));

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
      }),
    );
    expect(result.ok).toBe(true);
    // F1 fix — a null/null "match" is vacuous, not a real verification; the flag must say so.
    if (result.ok) expect(result.verifiedPayloadHash).toBe(false);
  });

  // ---------------------------------------------------------------------------------------
  // F1 fix — binding enforcement (actor/action/resource/entity/client). Previously NONE of
  // these were compared; a token minted for one actor/action/entity could be redeemed for a
  // completely different one as long as the (optional) payload hash matched.
  // ---------------------------------------------------------------------------------------
  it("F1: a token bound to one action is rejected when a different action is presented, and the token is revoked + a Critical binding-mismatch audit event fires", async () => {
    const client = new FakeDecisionTokenClient();
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput()));
    const auditsBefore = client.outboxInserts;

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext({ action: "led.journal.post" }),
        currentPayloadHash: "sha256:abc123",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_DECISION_TOKEN_INVALID");
    expect(client.tokens.get(sha256Hex(issued.rawToken))!.status).toBe("revoked");
    expect(client.outboxInserts).toBe(auditsBefore + 1); // iam2.decision_token_binding_mismatch

    // Retry with the CORRECT action now still fails — revoked on the FIRST mismatch attempt.
    const retry = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext(),
        currentPayloadHash: "sha256:abc123",
      }),
    );
    expect(retry.ok).toBe(false);
  });

  it("F1: a token bound to entity_id=null is rejected (null-safe, not a wildcard) when a non-null entity_id is presented", async () => {
    const client = new FakeDecisionTokenClient();
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput({ entityId: null })));

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext({ entityId: "some_entity" }),
        currentPayloadHash: "sha256:abc123",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_DECISION_TOKEN_INVALID");
  });

  it("F1: a token bound to actor A is rejected when actor B is presented, even with every other field and the payload hash matching", async () => {
    const client = new FakeDecisionTokenClient();
    const issued = await withCtx(() => issueDecisionToken(client as unknown as PoolClient, baseIssueInput()));

    const result = await withCtx(() =>
      verifyAndConsumeDecisionToken(client as unknown as PoolClient, {
        tokenRaw: issued.rawToken,
        ...matchingBindingContext({ actorUserId: "user_SOMEONE_ELSE" }),
        currentPayloadHash: "sha256:abc123",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("IAM2_DECISION_TOKEN_INVALID");
  });
});
