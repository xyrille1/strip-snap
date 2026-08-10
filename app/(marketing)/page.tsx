import { CtaLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import NumberedList from "@/components/ui/NumberedList";
import BoothFrame from "@/components/booth3d/BoothFrame";
import SketchFilmstrip from "@/components/booth3d/SketchFilmstrip";

// PRD "Target audience / user personas" — copy paraphrased from that section,
// not invented. The MVP targets all three equally (no persona deprioritized).
const PERSONAS = [
  {
    title: "Solo",
    description:
      "A fast, low-friction retro strip for your own feed — no invite, no waiting, straight to the countdown.",
  },
  {
    title: "Friend group",
    description:
      "A shared virtual session with everyone who couldn't be in the same room — one link, one waiting room, one strip.",
  },
  {
    title: "Long distance",
    description:
      "Feel like you took the photo together, even from two different cities — the sharpest differentiator versus a filter app.",
  },
];

// Mirrors the left-panel instruction plates on every other booth screen
// (ModeSelectClient, CaptureClient, WaitingClient) — the landing page is the
// first place a visitor meets the booth, so it teaches the same three steps
// in the same chrome they will see once they are inside.
const HOW_IT_WORKS = [
  {
    title: "Pick your mode",
    description: "Shoot solo, or send one link and pull everyone into the same booth.",
  },
  {
    title: "Everyone gets ready",
    description: "One shared countdown fires for all of you at the same moment.",
  },
  {
    title: "Collect your strip",
    description: "Pick a look, watch it develop, then download, print, or share it.",
  },
];

const FOOTER_LINKS = ["Privacy", "FAQ", "About", "Contact"];

/**
 * Landing page — the booth itself is the hero (docs/goal-ui.md's Classic
 * Sketch look). Reuses the same `BoothFrame` triptych every in-session screen
 * is built on rather than a bespoke marketing layout, so the front door and
 * the product read as one design.
 *
 * Stays a server component: `BoothFrame` is a client component, but every prop
 * passed to it here is serializable and its children are static, so there is
 * no need for the `*Client.tsx` split the interactive session screens use.
 */
export default function MarketingPage() {
  return (
    <main className="min-h-[100dvh] px-4 py-12 sm:px-8 sm:py-16 lg:px-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-16">
        <BoothFrame
          pose="setup"
          leftInstructions={HOW_IT_WORKS.map((item) => item.title)}
          rightLabel="DELIVERY"
          rightSublabel="Photos drop here"
        >
          <Card className="flex w-[min(92vw,420px)] flex-col items-center gap-7 p-6 sm:p-8">
            <header className="animate-fade-up text-center">
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-ink-secondary">
                An online photobooth
              </p>
              <h1 className="mt-3 font-display text-5xl text-ink sm:text-6xl">Strip Snap</h1>
              <p className="mt-4 text-balance font-sans text-sm leading-relaxed text-ink-secondary">
                Retro-style, multi-shot photo strips — captured with a shared,
                synced countdown, whether you&apos;re in the same room or two
                time zones apart.
              </p>
            </header>

            <SketchFilmstrip />

            <div className="flex flex-col items-center gap-3">
              <CtaLink href="/session/new">Enter the booth →</CtaLink>
              <p className="font-display text-sm text-ink-secondary">
                Every strip starts blank. Yours is next.
              </p>
            </div>
          </Card>
        </BoothFrame>

        {/* Full-detail how-it-works for narrow viewports, where BoothFrame's
            decorative side panels (which only carry the short titles) collapse
            out of view entirely — the same lg:hidden fallback CaptureClient uses. */}
        <section className="lg:hidden">
          <Card className="p-6 sm:p-8">
            <NumberedList items={HOW_IT_WORKS} />
          </Card>
        </section>

        {/* Personas */}
        <section className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div>
            <p className="font-display text-sm text-rust-body">Who it&apos;s for</p>
            <h2 className="mt-2 font-display text-3xl text-ink">
              One booth, three ways to use it
            </h2>
          </div>
          <Card className="p-6 sm:p-8">
            <NumberedList items={PERSONAS} />
          </Card>
        </section>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t-booth-inner border-structural-gray pt-8 text-sm text-ink-secondary">
          <span className="font-display">Strip Snap</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-6">
            {FOOTER_LINKS.map((label) => (
              <a key={label} href="#" className="hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </footer>
      </div>
    </main>
  );
}
