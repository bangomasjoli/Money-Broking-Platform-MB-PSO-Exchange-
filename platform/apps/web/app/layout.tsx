import type { Metadata } from "next";
import "./globals.css";

// FINAL AIX FONT: PENDING DESIGN APPROVAL — see docs/04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md
// §6 (Typography Framework, no font family selected). This layout deliberately does NOT
// load a branded font (e.g. Geist, which shadcn's "Nova" init preset wires in by default) —
// that would be an irreversible-feeling branding decision this turn is not authorized to
// make. `font-sans` below resolves to Tailwind's default system-ui font stack instead, which
// is a safe technical placeholder, not a design choice.

export const metadata: Metadata = {
  title: "AIX",
  description: "AIX frontend technical foundation — not an approved UI design.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="font-sans">
      <body>{children}</body>
    </html>
  );
}
