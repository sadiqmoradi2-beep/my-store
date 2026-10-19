import { Workbook } from 'exceljs';
import { DEFAULT_STORE_TIME_ZONE, gregorianToJalali, zonedParts } from '@my-store/shared';

export interface SheetColumn {
  key: string;
  header: string;
  width?: number;
}

export interface ExportSheet {
  /** Sheet name and the first part of the file name (ASCII) */
  name: string;
  title: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
}

export interface RenderedExport {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

/** Jalali date + time on the store's clock, in the format 1405/04/28 14:30 */
export function jalali(date: Date, tz: string = DEFAULT_STORE_TIME_ZONE): string {
  const p = zonedParts(date, tz);
  const { jy, jm, jd } = gregorianToJalali(p.year, p.month, p.day);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${jy}/${pad(jm)}/${pad(jd)} ${pad(p.hour)}:${pad(p.minute)}`;
}

function cellValue(value: unknown, tz: string): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (value instanceof Date) return jalali(value, tz);
  return String(value);
}

async function toXlsx(sheet: ExportSheet, tz: string): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'MY STORE';
  const ws = workbook.addWorksheet(sheet.title.slice(0, 31), {
    views: [{ rightToLeft: true }],
  });
  ws.columns = sheet.columns.map((c) => ({ key: c.key, header: c.header, width: c.width ?? 18 }));
  for (const row of sheet.rows) {
    ws.addRow(Object.fromEntries(sheet.columns.map((c) => [c.key, cellValue(row[c.key], tz)])));
  }
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFEC' } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function toCsv(sheet: ExportSheet, tz: string): Buffer {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [
    sheet.columns.map((c) => escape(c.header)).join(','),
    ...sheet.rows.map((row) => sheet.columns.map((c) => escape(cellValue(row[c.key], tz))).join(',')),
  ];
  // BOM so Excel reads UTF-8 correctly
  const BOM = String.fromCharCode(0xfeff);
  return Buffer.from(BOM + lines.join('\r\n'), 'utf8');
}

export async function renderSheet(sheet: ExportSheet, format: 'xlsx' | 'csv', tz: string = DEFAULT_STORE_TIME_ZONE): Promise<RenderedExport> {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    return {
      buffer: toCsv(sheet, tz),
      fileName: `${sheet.name}-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
    };
  }
  return {
    buffer: await toXlsx(sheet, tz),
    fileName: `${sheet.name}-${stamp}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
