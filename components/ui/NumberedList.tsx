// Numbered instruction rows — design brief §4: "the connective tissue between
// the functional booth screens and the editorial marketing screens — reuse
// the same component everywhere instructions appear." Same visual grammar as
// the brief's FAQ-style rows: serif numeral, hairline divider, short copy.
export interface NumberedListItem {
  title: string;
  description: string;
}

export interface NumberedListProps {
  items: NumberedListItem[];
  className?: string;
  /**
   * "vertical" (default, unchanged) — the original always-stacked
   * `divide-y` list every existing caller (marketing page, mode-select,
   * waiting room) already relies on.
   *
   * "columns" — design brief §5's console-screen variant: "the console
   * screens (frame preview, capture) should be full-bleed on mobile with
   * the instruction strip collapsing to a single horizontal scroll row
   * rather than three columns" (implying 3 columns at desktop width).
   * Below the `sm:` breakpoint (this app's established mobile/desktop
   * split — see CaptureClient.tsx's own `sm:` usage from Phase 13's
   * responsive pass) it's a `flex`/`overflow-x-auto` row with scroll-snap;
   * at `sm:` and up it becomes a `grid-cols-3` row. Hairline dividers
   * between items come from `divide-x` in both cases (Tailwind's divide
   * utilities target adjacent siblings regardless of flex vs. grid
   * layout), matching the vertical variant's `divide-y` hairline grammar.
   */
  layout?: "vertical" | "columns";
}

export default function NumberedList({
  items,
  className,
  layout = "vertical",
}: NumberedListProps) {
  const isColumns = layout === "columns";

  const listClassName = isColumns
    ? "flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth divide-x divide-structural-gray pb-1 sm:grid sm:grid-cols-3 sm:gap-8 sm:overflow-visible sm:pb-0 sm:divide-y-0"
    : "divide-y divide-structural-gray";

  const itemClassName = isColumns
    ? "flex min-w-[240px] shrink-0 snap-start gap-4 pl-6 first:pl-0 sm:min-w-0 sm:shrink"
    : "flex gap-4 py-5 first:pt-0 last:pb-0";

  return (
    <ol className={[listClassName, className].filter(Boolean).join(" ")}>
      {items.map((item, index) => (
        <li key={item.title} className={itemClassName}>
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 font-display text-lg text-rust-body tabular-nums"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <p className="font-sans text-sm font-semibold text-ink">{item.title}</p>
            <p className="mt-1 font-sans text-sm leading-relaxed text-ink-secondary">
              {item.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
