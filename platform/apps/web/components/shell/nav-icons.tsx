import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  History,
  Inbox,
  LayoutGrid,
  ListChecks,
  Home,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";

/**
 * Nav-icon resolution — kept separate from `nav-data.ts` deliberately.
 *
 * `nav-data.ts` is imported by Server Component route layouts (`app/app/layout.tsx` etc.) AND
 * by client-rendered nav components. A React component reference (a function) cannot cross the
 * Server→Client props boundary — passing a Lucide icon component directly as a `NavItem` field
 * fails the build with "Functions cannot be passed directly to Client Components." `nav-data.ts`
 * therefore stores only a string `NavIconName`; this module resolves that string to the actual
 * icon component, and is imported ONLY from `nav-list.tsx` (a component that always renders
 * inside the client-marked shell subtree) — so the function reference never needs to serialize
 * across the boundary, only its name does.
 */

export const NAV_ICONS = {
  activity: Activity,
  "building-2": Building2,
  history: History,
  inbox: Inbox,
  "layout-grid": LayoutGrid,
  "list-checks": ListChecks,
  home: Home,
  "search-check": SearchCheck,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  "sliders-horizontal": SlidersHorizontal,
  users: Users,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;
