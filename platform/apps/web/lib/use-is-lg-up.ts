import { useSyncExternalStore } from "react";

const LG_QUERY = "(min-width: 1024px)";

function subscribeToLgQuery(callback: () => void) {
  const mql = window.matchMedia(LG_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getLgSnapshot(): boolean {
  return window.matchMedia(LG_QUERY).matches;
}

function getLgServerSnapshot(): boolean {
  return false;
}

/**
 * `true` at `≥1024px` (Tailwind `lg:`). Shared by every List + Detail workspace, which use it to
 * decide whether selecting a row updates a persistent detail panel or opens a `Sheet`.
 *
 * `useSyncExternalStore`, not `useState`+`useEffect` — the React-recommended pattern for reading
 * external browser state without an effect-body `setState`, which the project's
 * `react-hooks/set-state-in-effect` lint rule flags. Server snapshot is `false` (no `window` during
 * SSR); corrected to the real value on the client. Extracted from `UI Phase 2E`'s Wallet
 * Destinations workspace when `UI Phase 2J`'s Client Requests workspace became its second caller.
 */
export function useIsLgUp(): boolean {
  return useSyncExternalStore(subscribeToLgQuery, getLgSnapshot, getLgServerSnapshot);
}
