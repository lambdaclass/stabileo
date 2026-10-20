/**
 * Sheet formats (ISO 216, landscape), their frame and the title block's place: a 10 mm frame (20 mm
 * on the binding side) and a 180 × 56 mm title block in the lower right corner. Scales are the
 * usual ones of structural drawings, and a drawing takes the largest that fits.
 */
export type SheetFormat = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
export const SHEET_FORMATS: readonly SheetFormat[] = ['A0', 'A1', 'A2', 'A3', 'A4'];

const SIZES: Record<SheetFormat, [number, number]> = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] };

export interface FormatGeometry {
  width: number; height: number;
  frame: { x0: number; y0: number; x1: number; y1: number };
  titleBlock: { x0: number; y0: number; x1: number; y1: number };
  /** Where drawings may go: inside the frame, above the title block's height. */
  drawable: { x0: number; y0: number; x1: number; y1: number };
}

export const TITLE_BLOCK = { width: 180, height: 56 };

export function formatGeometry(f: SheetFormat): FormatGeometry {
  const [width, height] = SIZES[f];
  const frame = { x0: 20, y0: 10, x1: width - 10, y1: height - 10 };
  const tb = { x0: frame.x1 - TITLE_BLOCK.width, y0: frame.y0, x1: frame.x1, y1: frame.y0 + TITLE_BLOCK.height };
  // A4 keeps the block across the foot; larger sheets let drawings sit beside it.
  const drawable = { x0: frame.x0 + 5, y0: tb.y1 + 5, x1: frame.x1 - 5, y1: frame.y1 - 5 };
  return { width, height, frame, titleBlock: tb, drawable };
}

/** A sheet of free size with no title block (the blank template): the frame, and all of it drawable. */
export function blankGeometry(width: number, height: number): FormatGeometry {
  const frame = { x0: 10, y0: 10, x1: width - 10, y1: height - 10 };
  return { width, height, frame, titleBlock: { x0: frame.x1, y0: frame.y0, x1: frame.x1, y1: frame.y0 }, drawable: { x0: frame.x0 + 5, y0: frame.y0 + 5, x1: frame.x1 - 5, y1: frame.y1 - 5 } };
}

export const SCALES: readonly number[] = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 250, 500];

/** The largest standard scale (smallest denominator) at which a drawing `w × h` model mm fits `W × H` paper mm. */
export function fittingScale(w: number, h: number, W: number, H: number): number | null {
  for (const s of SCALES) if (w / s <= W && h / s <= H) return s;
  return null;
}
