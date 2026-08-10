// Decorative, entirely-drawn photo strip — no photography, no remote images.
// Replaces the landing page's former picsum.photos collage, which put a
// third-party network dependency on the front door and shipped stock photos
// that were never real user output. Empty frames are the honest illustration
// anyway: every strip genuinely does start blank.
//
// Construction mirrors the real article — `lib/compositor.ts` draws slots at
// 3:4 with sprocket holes punched down both margins, so this uses the same
// aspect and the same sprocket rhythm, in the sketch look's black-on-paper
// chrome. Purely presentational (`aria-hidden`), so it carries no caption or
// alt text of its own.

const FRAME_COUNT = 3;
const SPROCKETS_PER_SIDE = 8;

/** 45° pencil hatch — the "sketch" read for a frame with no photo in it yet. */
const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1px, transparent 1px, transparent 7px)",
};

export interface SketchFilmstripProps {
  className?: string;
}

export default function SketchFilmstrip({ className }: SketchFilmstripProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        "flex w-[128px] shrink-0 flex-col gap-2 border-booth border-structural-gray bg-film-black p-2 shadow-booth",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {Array.from({ length: FRAME_COUNT }, (_, frame) => (
        <div key={frame} className="relative flex aspect-[3/4] w-full">
          <Sprockets />
          <div
            className="min-w-0 flex-1 border-booth-inner border-structural-gray/50 bg-screen"
            style={HATCH}
          />
          <Sprockets />
        </div>
      ))}

      <p className="pt-1 text-center font-display text-[10px] leading-none text-cream/70">
        STRIP SNAP
      </p>
    </div>
  );
}

/** One margin's worth of sprocket holes, matching `drawSprocketHoles`' rhythm. */
function Sprockets() {
  return (
    <div className="flex w-[7px] shrink-0 flex-col justify-around py-1">
      {Array.from({ length: SPROCKETS_PER_SIDE }, (_, hole) => (
        <span key={hole} className="mx-auto block h-[3px] w-[3px] bg-cream/80" />
      ))}
    </div>
  );
}
