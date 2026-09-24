import Link from 'next/link';

interface BarRow {
  key: string;
  name: string;
  hint: string;
  value: number;
  display: string;
  href?: string;
}

/** Bar list: each row's relative value shown as a single-color bar under its name */
export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-faint">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ol className="space-y-3">
      {rows.map((row) => {
        const content = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.name}</span>
              <span className="text-xs text-ink-muted">{row.hint}</span>
              <span className="text-sm font-bold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {row.display}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: max > 0 ? `${Math.max((row.value / max) * 100, 2)}%` : '2%' }}
              />
            </div>
          </>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="block rounded-lg transition-opacity hover:opacity-70">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
