/**
 * FND-01 §5.7 / §11 — hard licence lock at the foundation. No foundation shortcut may
 * introduce an Exchange runtime path. This guard runs at bootstrap over the registered
 * route table and throws if any prohibited surface appears. Money Broking + PSO only.
 */

/** Prohibited Exchange-runtime surface fragments (matched against route paths, lowercased). */
export const PROHIBITED_EXCHANGE_FRAGMENTS = [
  "order-book",
  "orderbook",
  "matching-engine",
  "matching_engine",
  "market-maker",
  "market_maker",
  "market-making",
  "principal-dealing",
  "principal_dealing",
  "spread-markup",
  "spread_markup",
  "maker-taker",
  "maker_taker",
  "client-to-client",
  "exchange",
] as const;

export function findProhibitedExchangeRoutes(routePaths: readonly string[]): string[] {
  const hits: string[] = [];
  for (const path of routePaths) {
    const p = path.toLowerCase();
    if (PROHIBITED_EXCHANGE_FRAGMENTS.some((frag) => p.includes(frag))) {
      hits.push(path);
    }
  }
  return hits;
}

/** Throw if any registered route exposes an Exchange-runtime surface. Called at boot. */
export function assertNoExchangeRuntime(routePaths: readonly string[]): void {
  const hits = findProhibitedExchangeRoutes(routePaths);
  if (hits.length > 0) {
    throw new Error(
      `MODULE_BOUNDARY_VIOLATION: prohibited Exchange runtime route(s) detected: ${hits.join(", ")}`,
    );
  }
}
