'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale, SalesReportPoint } from '@my-store/shared';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';

/* Series color pair — passes all six dataviz checks on both light and dark surfaces */
const REVENUE_COLOR = '#259a79';
const PROFIT_COLOR = '#b96f0a';

const MARGIN = { top: 16, right: 20, bottom: 28, left: 64 };
const HEIGHT = 280;

interface SalesChartProps {
  points: SalesReportPoint[];
  locale: Locale;
  labels: { revenue: string; profit: string; sales: string; empty: string };
}

export function SalesChart({ points, locale, labels }: SalesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const legend = (
    <div className="mb-2 flex items-center gap-4">
      {[
        { color: REVENUE_COLOR, label: labels.revenue },
        { color: PROFIT_COLOR, label: labels.profit },
      ].map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="h-[3px] w-4 rounded-full" style={{ background: color }} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );

  if (points.length === 0) {
    return (
      <div ref={containerRef}>
        {legend}
        <p className="py-16 text-center text-sm text-ink-faint">{labels.empty}</p>
      </div>
    );
  }

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const n = points.length;

  const maxValue = Math.max(...points.map((p) => Number(p.total)), 0);
  const tickStep = niceStep(maxValue > 0 ? maxValue / 4 : 1);
  const yMax = tickStep * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * tickStep);

  const x = (i: number) => MARGIN.left + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => MARGIN.top + innerH - (v / yMax) * innerH;

  const revenuePath = linePath(points.map((p, i) => [x(i), y(Number(p.total))]));
  const profitPath = linePath(points.map((p, i) => [x(i), y(Number(p.profit))]));

  const last = n - 1;
  const lastRevenueY = y(Number(points[last].total));
  const lastProfitY = y(Number(points[last].profit));
  /* Direct end-of-line label — if the two series end close together, only revenue gets a label */
  const showProfitEndLabel = Math.abs(lastRevenueY - lastProfitY) >= 16;

  const labelEvery = Math.max(1, Math.ceil(n / 6));

  function indexFromPointer(clientX: number): number {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || n === 1) return 0;
    const px = clientX - rect.left - MARGIN.left;
    return Math.min(n - 1, Math.max(0, Math.round((px / innerW) * (n - 1))));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      setHovered((h) => Math.min(n - 1, Math.max(0, (h ?? last) + delta)));
    } else if (e.key === 'Escape') {
      setHovered(null);
    }
  }

  const hoveredPoint = hovered === null ? null : points[hovered];
  const tooltipLeft =
    hovered === null ? 0 : Math.min(Math.max(x(hovered), 90), Math.max(width - 90, 90));

  return (
    <div>
      {legend}
      <div ref={containerRef} dir="ltr" className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            tabIndex={0}
            className="block touch-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            onPointerMove={(e) => setHovered(indexFromPointer(e.clientX))}
            onPointerLeave={() => setHovered(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setHovered(null)}
          >
            {/* Horizontal grid — hairline, faded */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + innerW}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={y(tick) + 3.5}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--ink-faint)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatMoney(tick, locale)}
                </text>
              </g>
            ))}

            {/* X-axis labels — sparse selection */}
            {points.map((p, i) =>
              i % labelEvery === 0 || i === last ? (
                <text
                  key={p.bucket}
                  x={x(i)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--ink-faint)"
                >
                  {formatDate(p.bucket, locale)}
                </text>
              ) : null,
            )}

            {/* Vertical indicator line */}
            {hovered !== null && (
              <line
                x1={x(hovered)}
                x2={x(hovered)}
                y1={MARGIN.top}
                y2={MARGIN.top + innerH}
                stroke="var(--ink-faint)"
                strokeWidth={1}
              />
            )}

            <path d={revenuePath} fill="none" stroke={REVENUE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={profitPath} fill="none" stroke={PROFIT_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {/* End-of-line marker + hover point marker — with a ring matching the surface color */}
            {[
              { cy: lastRevenueY, color: REVENUE_COLOR, key: 'rev-end' },
              { cy: lastProfitY, color: PROFIT_COLOR, key: 'prof-end' },
            ].map(({ cy, color, key }) => (
              <circle key={key} cx={x(last)} cy={cy} r={4} fill={color} stroke="var(--surface-2)" strokeWidth={2} />
            ))}
            {hovered !== null && hovered !== last && (
              <>
                <circle cx={x(hovered)} cy={y(Number(points[hovered].total))} r={4} fill={REVENUE_COLOR} stroke="var(--surface-2)" strokeWidth={2} />
                <circle cx={x(hovered)} cy={y(Number(points[hovered].profit))} r={4} fill={PROFIT_COLOR} stroke="var(--surface-2)" strokeWidth={2} />
              </>
            )}

            {/* End-of-line value label */}
            <text
              x={x(last) - 8}
              y={lastRevenueY - 9}
              textAnchor="end"
              fontSize={11}
              fontWeight={700}
              fill="var(--ink-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatMoney(points[last].total, locale)}
            </text>
            {showProfitEndLabel && (
              <text
                x={x(last) - 8}
                y={lastProfitY + (lastProfitY > lastRevenueY ? 18 : -9)}
                textAnchor="end"
                fontSize={11}
                fontWeight={700}
                fill="var(--ink-muted)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMoney(points[last].profit, locale)}
              </text>
            )}
          </svg>
        )}

        {hoveredPoint && (
          <div
            dir={locale === 'en' ? 'ltr' : 'rtl'}
            className="pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 rounded-lg border border-line bg-surface-2 px-3 py-2 shadow-lg"
            style={{ left: tooltipLeft }}
          >
            <p className="mb-1 text-[11px] text-ink-faint">{formatDate(hoveredPoint.bucket, locale)}</p>
            {[
              { color: REVENUE_COLOR, label: labels.revenue, value: hoveredPoint.total },
              { color: PROFIT_COLOR, label: labels.profit, value: hoveredPoint.profit },
            ].map(({ color, label, value }) => (
              <p key={label} className="flex items-center gap-1.5 text-xs">
                <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <span className="font-bold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(value, locale)}
                </span>
                <span className="text-ink-muted">{label}</span>
              </p>
            ))}
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {labels.sales}: {formatNumber(hoveredPoint.sales, locale)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Rounded axis step — 1/2/5×10^k */
function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough));
  const ratio = rough / power;
  const nice = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10;
  return nice * power;
}

function linePath(coords: [number, number][]): string {
  return coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
}
