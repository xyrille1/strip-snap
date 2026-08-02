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
}

export default function NumberedList({ items, className }: NumberedListProps) {
  return (
    <ol className={["divide-y divide-structural-gray", className].filter(Boolean).join(" ")}>
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 font-display text-lg italic text-rust-body tabular-nums"
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
