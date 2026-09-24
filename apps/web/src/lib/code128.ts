/**
 * Code 128 (code set B) — generates bar widths for a barcode with no
 * external dependency. Each pattern is 6 digits (alternating bar/space,
 * starting with a bar); the stop pattern is 7 digits.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Bar/space widths in order (starting with a bar). null if the text cannot be encoded */
export function code128Widths(text: string): number[] | null {
  const values: number[] = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return null;
    values.push(code - 32);
  }
  let checksum = START_B;
  for (let i = 1; i < values.length; i++) checksum += values[i] * i;
  values.push(checksum % 103, STOP);

  const widths: number[] = [];
  for (const value of values) {
    for (const digit of PATTERNS[value]) widths.push(Number(digit));
  }
  return widths;
}

export interface BarcodeRect {
  x: number;
  width: number;
}

/** Bar rectangles for SVG drawing + total width in modules */
export function code128Rects(text: string): { rects: BarcodeRect[]; totalModules: number } | null {
  const widths = code128Widths(text);
  if (!widths) return null;
  const rects: BarcodeRect[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x, width: w });
    x += w;
  });
  return { rects, totalModules: x };
}
