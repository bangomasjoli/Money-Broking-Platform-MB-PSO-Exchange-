/**
 * WLT-01 Phase 1B — deterministic, in-process, network-free address-integrity helpers shared by
 * every per-chain canonicaliser (`ethereum.ts`, `tron.ts`). No vendor call, no RPC, no external
 * lookup — everything here is a pure function of the input string.
 */

/** Leading/trailing whitespace (any Unicode whitespace, not just ASCII space) is rejected. */
export function hasSurroundingWhitespace(input: string): boolean {
  return input !== input.trim();
}

/**
 * Deterministic blocklist of invisible/control/bidirectional-override code points — NOT a full
 * Unicode general-category (Cf/Cc) lookup table (this codebase has no Unicode-database
 * dependency), but the specific ranges known to be used for address-spoofing/homograph tricks:
 * C0/C1 control characters, zero-width space/joiner/non-joiner, left-to-right/right-to-left marks,
 * embedding/override/isolate controls, word joiner, and the BOM/zero-width-no-break-space. Every
 * member is expressed as an explicit `\uXXXX` escape (never a literal invisible character in this
 * source file) so the exact code points covered are auditable from the source text itself. A raw
 * address or alias-shaped input containing any of these is rejected before any further parsing —
 * this is integrity hygiene, not a poisoning-intelligence feature (that is Phase 2+, vendor-backed).
 */
const INVISIBLE_OR_CONTROL_PATTERN = new RegExp(
  "[" +
    "\\u0000-\\u001F" + // C0 control characters
    "\\u007F-\\u009F" + // DEL + C1 control characters
    "\\u200B-\\u200F" + // zero-width space/ZWNJ/ZWJ + LTR/RTL marks
    "\\u202A-\\u202E" + // LTR/RTL embedding/override + pop-directional-formatting
    "\\u2060-\\u2064" + // word joiner + invisible operators
    "\\u2066-\\u2069" + // LTR/RTL/first-strong isolate + pop-directional-isolate
    "\\uFEFF" + // BOM / zero-width no-break space
    "]",
);

export function containsInvisibleOrControlCharacters(input: string): boolean {
  return INVISIBLE_OR_CONTROL_PATTERN.test(input);
}

/** Alias-shaped input heuristic: a dot-separated human-readable name (ENS-style `name.eth`, or
 * any other dotted identifier) rather than a raw address. Raw Ethereum/TRON addresses never
 * contain a `.` — this is a structural, not a vendor-backed, distinction. */
export function looksAliasShaped(input: string): boolean {
  return input.includes(".");
}
