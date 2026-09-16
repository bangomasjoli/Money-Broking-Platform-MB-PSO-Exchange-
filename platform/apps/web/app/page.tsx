/**
 * AIX frontend technical foundation — smoke page (UI Phase 1A).
 *
 * This is a deliberately minimal technical verification surface, not a design exercise.
 * It confirms the Next.js / Tailwind / shadcn toolchain is wired correctly. It is NOT an
 * approved UI design, NOT the Phantom-inspired navigation (Phase 1B), and NOT a real
 * page — no shadcn component is used here so that nothing on this page could be mistaken
 * for an approved visual treatment. See docs/04_ui/README.md for current UI phase status.
 */
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">AIX frontend foundation is initialized.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This is a technical smoke page, not an approved UI design.
      </p>
    </main>
  );
}
