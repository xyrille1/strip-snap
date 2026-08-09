import Image from "next/image";
import { CtaLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import NumberedList from "@/components/ui/NumberedList";

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

// Tasteful placeholder imagery only — no real strips exist yet (no user has
// completed a session). Deterministic picsum.photos seeds, captioned below
// as samples, never presented as real customer output.
const FILMSTRIP_FRAMES = [
  { seed: "stripsnap-a", rotate: "-rotate-6" },
  { seed: "stripsnap-b", rotate: "rotate-3" },
  { seed: "stripsnap-c", rotate: "-rotate-2" },
  { seed: "stripsnap-d", rotate: "rotate-5" },
];

const FOOTER_LINKS = ["Privacy", "FAQ", "About", "Contact"];

export default function MarketingPage() {
  return (
    <main className="min-h-[100dvh] px-4 py-12 sm:px-8 sm:py-16 lg:px-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-16">
        {/* Marquee */}
        <header className="animate-fade-up">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-ink-secondary">
            An online photobooth
          </p>
          <h1 className="mt-3 font-display text-6xl italic text-ink sm:text-7xl lg:text-8xl">
            Strip Snap
          </h1>
        </header>

        {/* Hero: pitch + CTA, filmstrip collage */}
        <section className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col items-start gap-8">
            <p className="max-w-md text-balance font-sans text-lg leading-relaxed text-ink-secondary">
              Retro-style, multi-shot photo strips — captured with a shared,
              synced countdown, whether you&apos;re in the same room or two
              time zones apart.
            </p>
            <CtaLink href="/session/new">Enter the booth →</CtaLink>
          </div>

          <div className="flex flex-col items-center gap-4 lg:items-end">
            <div aria-hidden="true" className="flex">
              {FILMSTRIP_FRAMES.map((frame, index) => (
                <div
                  key={frame.seed}
                  className={[
                    frame.rotate,
                    index === 0 ? "" : "-ml-10",
                    "flex w-28 flex-col gap-1 rounded-card border border-hairline border-structural-gray bg-film-black p-1.5 sm:w-32",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ zIndex: index }}
                >
                  {[0, 1, 2].map((frameIndex) => (
                    <Image
                      key={frameIndex}
                      src={`https://picsum.photos/seed/${frame.seed}-${frameIndex}/200/200`}
                      alt=""
                      width={200}
                      height={200}
                      className="aspect-square w-full rounded-sm object-cover grayscale"
                    />
                  ))}
                </div>
              ))}
            </div>
            <p className="font-display text-sm italic text-ink-secondary">
              Sample frames — every strip starts blank. Yours is next.
            </p>
          </div>
        </section>

        {/* Personas */}
        <section className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div>
            <p className="font-display text-sm italic text-rust-body">
              Who it&apos;s for
            </p>
            <h2 className="mt-2 font-display text-3xl italic text-ink">
              One booth, three ways to use it
            </h2>
          </div>
          <Card className="p-6 sm:p-8">
            <NumberedList items={PERSONAS} />
          </Card>
        </section>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline border-structural-gray pt-8 text-sm text-ink-secondary">
          <span className="font-display italic">Strip Snap</span>
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
