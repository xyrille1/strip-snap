import Card from "@/components/ui/Card";
import { CtaLink } from "@/components/ui/Button";

/**
 * Root 404 — reached via Next's default routing (unknown path) or an
 * explicit `notFound()` call (e.g. app/strip/[id]/page.tsx for a missing/
 * invalid strip id). Renders inside RootLayout (unlike global-error.tsx,
 * which replaces it), so the real design tokens/fonts are available here.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <Card className="animate-fade-up p-8">
        <p className="font-display text-sm text-rust-body">Strip Snap</p>
        <h1 className="mt-2 font-display text-4xl text-ink">
          Nothing developed here
        </h1>
        <p className="mt-3 font-sans text-sm text-ink-secondary">
          This link doesn&apos;t point at a session or strip that exists — it
          may have expired, or never existed at all.
        </p>
        <div className="mt-8">
          <CtaLink href="/">Back to start</CtaLink>
        </div>
      </Card>
    </main>
  );
}
