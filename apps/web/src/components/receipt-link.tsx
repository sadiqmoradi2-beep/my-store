'use client';

import { FileText } from 'lucide-react';
import { assetUrl } from '@/lib/api-client';

/** A receipt / invoice / proof file: PDF as a link, image as a small thumbnail — both open in a new tab */
export function ReceiptLink({ url, label }: { url: string | null | undefined; label: string }) {
  if (!url) return <span className="text-xs text-ink-faint">—</span>;
  if (url.toLowerCase().endsWith('.pdf')) {
    return (
      <a
        href={assetUrl(url)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
      >
        <FileText size={14} aria-hidden />
        {label}
      </a>
    );
  }
  return (
    <a href={assetUrl(url)} target="_blank" rel="noreferrer" className="inline-block" title={label}>
      <img src={assetUrl(url)} alt={label} className="h-9 w-9 rounded-md border border-line object-cover" />
    </a>
  );
}

/** File picker for a receipt photo / PDF */
export function ReceiptInput({ onChange }: { onChange: (file: File | null) => void }) {
  return (
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      className="block w-full text-sm text-ink-muted file:me-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
    />
  );
}
