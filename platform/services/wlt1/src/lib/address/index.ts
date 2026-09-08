/**
 * WLT-01 Phase 2A (P1B-MED-1 remediation) — chain/network dispatcher for deterministic address
 * canonicalisation. The ONE place a `(chain, network)` pair is mapped to a concrete canonicaliser
 * — `routes/wallet-destinations.ts` imports only from this file, never `./ethereum.js`/`./tron.js`
 * directly, so adding a future chain/network is a registry entry, not a route rewrite. Mirrors
 * AML-01's own `lib/providers/registry.ts` shape for the identical "one resolution point" reason.
 *
 * `chain`/`network` themselves are NOT validated against the database `chain_coverage` registry
 * here — that is `lib/chain-coverage.ts`'s job (the deny-by-default authoritative source). This
 * dispatcher only routes to the correct pure canonicalisation function once the caller has already
 * confirmed the pair is supported.
 *
 * P1B-MED-1: prior to Phase 2A, the set of known pairs was a bare `ReadonlySet<string>`
 * (`KNOWN_CHAIN_NETWORK_PAIRS`) with a comment claiming a sync test against `wlt1.chain_coverage`
 * already existed — it did not (independent Opus Phase 1B review). Phase 2A replaces that set with
 * `CHAIN_CANONICALISER_REGISTRY`, a LOAD-BEARING registry `canonicaliseAddress` actually dispatches
 * through (no separate hard-coded `if (pair === "ethereum/mainnet")` branch survives anywhere in
 * this file), plus `CHAIN_DISPATCHER_INVENTORY` (derived from the registry, never a second
 * hand-maintained list) and `compareChainCoverageToDispatcher` (a pure, reusable comparison
 * function). `tests/integration/wlt1-db.test.ts`'s "chain-coverage/dispatcher sync" describe block
 * is what NOW actually proves `wlt1.chain_coverage` and this registry agree, in both directions,
 * on `chain`/`network`/`address_format`/`canonicalisation_version` — see that file for the
 * authoritative database-backed assertion and the synthetic one-sided-drift meta-tests exercising
 * `compareChainCoverageToDispatcher` directly.
 */
import { canonicaliseEthereumAddress, ETHEREUM_CANONICALISATION_VERSION } from "./ethereum.js";
import { canonicaliseTronAddress, TRON_CANONICALISATION_VERSION } from "./tron.js";
import { looksAliasShaped } from "./shared.js";

export { ETHEREUM_CANONICALISATION_VERSION, TRON_CANONICALISATION_VERSION };

export type CanonicaliseResult =
  | { ok: true; canonicalAddress: string; canonicalisationVersion: string }
  | { ok: false; reasonCode: string };

/** The ONE shape a chain/network canonicaliser may implement — a registry entry binds together
 * exactly the four properties `wlt1.chain_coverage` itself carries (`chain`, `network`,
 * `address_format`, `canonicalisation_version`) plus the actual dispatchable function, so the
 * inventory below and the real dispatch behaviour can never independently drift from each other
 * the way the old `Set` + `if` pair could. */
export interface ChainCanonicaliser {
  readonly chain: string;
  readonly network: string;
  /** Mirrors `wlt1.chain_coverage.address_format` exactly (e.g. `"eip55"`, `"base58check"`). */
  readonly addressFormat: string;
  readonly canonicalisationVersion: string;
  canonicalise(rawAddress: string, memoTag?: string): CanonicaliseResult;
}

function registryKey(chain: string, network: string): string {
  return `${chain}/${network}`;
}

const ETHEREUM_MAINNET: ChainCanonicaliser = {
  chain: "ethereum",
  network: "mainnet",
  addressFormat: "eip55",
  canonicalisationVersion: ETHEREUM_CANONICALISATION_VERSION,
  canonicalise(rawAddress, memoTag) {
    const result = canonicaliseEthereumAddress(rawAddress, memoTag);
    return result.ok
      ? { ok: true, canonicalAddress: result.canonicalAddress, canonicalisationVersion: result.canonicalisationVersion }
      : { ok: false, reasonCode: result.reasonCode };
  },
};

const TRON_MAINNET: ChainCanonicaliser = {
  chain: "tron",
  network: "mainnet",
  addressFormat: "base58check",
  canonicalisationVersion: TRON_CANONICALISATION_VERSION,
  canonicalise(rawAddress, memoTag) {
    const result = canonicaliseTronAddress(rawAddress, memoTag);
    return result.ok
      ? { ok: true, canonicalAddress: result.canonicalAddress, canonicalisationVersion: result.canonicalisationVersion }
      : { ok: false, reasonCode: result.reasonCode };
  },
};

/** The runtime-authoritative registry. `canonicaliseAddress` dispatches through this map — there
 * is no separate hard-coded chain/network branch anywhere else in this module. Adding a future
 * chain/network pair is a new entry here (plus the matching `wlt1.chain_coverage` row and
 * migration), never a route or dispatch-logic rewrite. */
const CHAIN_CANONICALISER_REGISTRY: Readonly<Record<string, ChainCanonicaliser>> = {
  [registryKey(ETHEREUM_MAINNET.chain, ETHEREUM_MAINNET.network)]: ETHEREUM_MAINNET,
  [registryKey(TRON_MAINNET.chain, TRON_MAINNET.network)]: TRON_MAINNET,
};

export interface ChainDispatcherInventoryEntry {
  readonly chain: string;
  readonly network: string;
  readonly addressFormat: string;
  readonly canonicalisationVersion: string;
}

/** Read-only, DERIVED from `CHAIN_CANONICALISER_REGISTRY` (`Object.values` + map + sort) — never a
 * second hand-maintained list. Sorted deterministically by `chain/network` so consumers (including
 * this file's own sync test) get a stable order without sorting themselves. Frozen so a caller
 * cannot mutate the production registry's own mirror through this export. */
export const CHAIN_DISPATCHER_INVENTORY: readonly ChainDispatcherInventoryEntry[] = Object.freeze(
  Object.values(CHAIN_CANONICALISER_REGISTRY)
    .map((c) => Object.freeze({ chain: c.chain, network: c.network, addressFormat: c.addressFormat, canonicalisationVersion: c.canonicalisationVersion }))
    .sort((a, b) => registryKey(a.chain, a.network).localeCompare(registryKey(b.chain, b.network))),
);

export function isKnownChainNetworkPair(chain: string, network: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHAIN_CANONICALISER_REGISTRY, registryKey(chain, network));
}

/**
 * Canonicalises a raw address for a known `(chain, network)` pair. Alias-shaped input (dotted,
 * e.g. `name.eth`) is rejected BEFORE dispatch with a distinct reason code — `WLT1_
 * NAME_SERVICE_ALIAS_NOT_ALLOWED` at the route layer, never resolved, never stored as the
 * authoritative destination.
 */
export function canonicaliseAddress(chain: string, network: string, rawAddress: string, memoTag?: string): CanonicaliseResult {
  if (looksAliasShaped(rawAddress)) {
    return { ok: false, reasonCode: "alias_shaped_input" };
  }
  const entry = CHAIN_CANONICALISER_REGISTRY[registryKey(chain, network)];
  if (!entry) {
    return { ok: false, reasonCode: "unsupported_chain" };
  }
  return entry.canonicalise(rawAddress, memoTag);
}

// -------------------------------------------------------------------------------------------
// P1B-MED-1 — bidirectional chain-coverage/dispatcher sync comparison (pure, reusable).
// -------------------------------------------------------------------------------------------

/** The exact shape of a `wlt1.chain_coverage` row's own comparison-relevant columns — snake_case
 * to match the database column names directly, so a caller can pass a real query-result row
 * without a translation step. */
export interface ChainCoverageInventoryRow {
  chain: string;
  network: string;
  address_format: string;
  canonicalisation_version: string;
}

/** Bounded, deterministic mismatch categories — never a raw SQL row or a source-code fragment. */
export type ChainCoverageSyncMismatch =
  | { kind: "coverage_without_dispatcher"; chain: string; network: string }
  | { kind: "dispatcher_without_coverage"; chain: string; network: string }
  | { kind: "address_format_mismatch"; chain: string; network: string; coverageAddressFormat: string; dispatcherAddressFormat: string }
  | {
      kind: "canonicalisation_version_mismatch";
      chain: string;
      network: string;
      coverageCanonicalisationVersion: string;
      dispatcherCanonicalisationVersion: string;
    };

/**
 * Pure comparison between the database's own supported/active `wlt1.chain_coverage` rows and the
 * runtime dispatcher's own `CHAIN_DISPATCHER_INVENTORY` — the two sources P1B-MED-1 requires to be
 * proven aligned, in both directions, on all four comparison dimensions (`chain`, `network`,
 * `address_format`, `canonicalisation_version`). No database access, no filesystem access, no
 * source-code inspection — a caller supplies both inventories (the real ones, or synthetic ones
 * for drift testing) and gets back a deterministically ordered, bounded mismatch list. An empty
 * result means the two sides are provably identical on every compared dimension.
 */
export function compareChainCoverageToDispatcher(
  coverageRows: readonly ChainCoverageInventoryRow[],
  dispatcherInventory: readonly ChainDispatcherInventoryEntry[] = CHAIN_DISPATCHER_INVENTORY,
): ChainCoverageSyncMismatch[] {
  const coverageByPair = new Map(coverageRows.map((row) => [registryKey(row.chain, row.network), row]));
  const dispatcherByPair = new Map(dispatcherInventory.map((entry) => [registryKey(entry.chain, entry.network), entry]));
  const mismatches: ChainCoverageSyncMismatch[] = [];

  for (const [pair, coverage] of coverageByPair) {
    const dispatcher = dispatcherByPair.get(pair);
    if (!dispatcher) {
      mismatches.push({ kind: "coverage_without_dispatcher", chain: coverage.chain, network: coverage.network });
      continue;
    }
    if (coverage.address_format !== dispatcher.addressFormat) {
      mismatches.push({
        kind: "address_format_mismatch",
        chain: coverage.chain,
        network: coverage.network,
        coverageAddressFormat: coverage.address_format,
        dispatcherAddressFormat: dispatcher.addressFormat,
      });
    }
    if (coverage.canonicalisation_version !== dispatcher.canonicalisationVersion) {
      mismatches.push({
        kind: "canonicalisation_version_mismatch",
        chain: coverage.chain,
        network: coverage.network,
        coverageCanonicalisationVersion: coverage.canonicalisation_version,
        dispatcherCanonicalisationVersion: dispatcher.canonicalisationVersion,
      });
    }
  }
  for (const [pair, dispatcher] of dispatcherByPair) {
    if (!coverageByPair.has(pair)) {
      mismatches.push({ kind: "dispatcher_without_coverage", chain: dispatcher.chain, network: dispatcher.network });
    }
  }

  return mismatches.sort((a, b) => {
    const pairA = registryKey(a.chain, a.network);
    const pairB = registryKey(b.chain, b.network);
    if (pairA !== pairB) return pairA.localeCompare(pairB);
    return a.kind.localeCompare(b.kind);
  });
}
