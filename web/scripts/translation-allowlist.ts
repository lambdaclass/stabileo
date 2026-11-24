import { COMPANY } from '../src/lib/blog/pages/legal-company';

export const ALLOWED_HEAD_STRINGS: ReadonlySet<string> = new Set([]);

export const ALLOWED_SEGMENTS: ReadonlySet<string> = new Set([
  COMPANY,
  'wRM = w0 + 16q/(π⁴κGt) Σ sin(mπ/2) sin(nπ/2) / [mn(m²/a² + n²/b²)]',
]);

// Member forces drawn on a figure: a language that writes decimals with a point shows them exactly as English does.
export const ALLOWED_SEGMENT_PATTERNS: readonly RegExp[] = [/^(?:N\d+: -?\d+(?:\.\d+)? kN)+$/];
