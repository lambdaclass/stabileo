import type { SheetBeamBarsReader } from './sheet-layout-bars';
import type { SheetRows } from './rc-sheets.svelte';

export type { SheetBeamBarsReader } from './sheet-layout-bars';

export interface SpanSteel { As: number; AsPrime: number; d: number; dPrime: number; bars: 'sheets' | 'member' }

export function adoptedSpanSteel(_span: number[], _h: number, _b: number, _read?: SheetBeamBarsReader): SpanSteel | null {
  return null;
}

export function sheetBeamBars(): SheetBeamBarsReader {
  return () => null;
}

export function sheetsForDocuments(): SheetRows | null {
  return null;
}
