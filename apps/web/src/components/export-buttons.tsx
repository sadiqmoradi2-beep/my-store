'use client';

import { FileSpreadsheet, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { apiDownload } from '@/lib/download';

/** Excel/CSV export buttons — path like "/exports/products" without the format */
export function ExportButtons({ path, query }: { path: string; query?: Record<string, string> }) {
  const t = useTranslations('common');
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (format: 'xlsx' | 'csv') => {
    setBusy(format);
    try {
      const params = new URLSearchParams({ ...query, format });
      await apiDownload(`${path}?${params}`);
    } catch {
      // silent error — the download can be retried
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" disabled={busy !== null} onClick={() => download('xlsx')}>
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        {busy === 'xlsx' ? t('downloading') : t('exportExcel')}
      </Button>
      <Button variant="outline" disabled={busy !== null} onClick={() => download('csv')}>
        <FileText className="h-4 w-4" aria-hidden />
        {busy === 'csv' ? t('downloading') : t('exportCsv')}
      </Button>
    </div>
  );
}
