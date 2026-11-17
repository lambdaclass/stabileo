/**
 * The article of CIRSOC 201-2025 a provided-reinforcement check stands on, so a «does not
 * verify» can say which rule it fails. Read from the check's failure class (`limiting`) and,
 * where a check has none, from its category; the member type picks the beam or the column
 * chapter where the two differ. Null where the check names no single article.
 */
import type { ProvidedRebarCheck } from '../station-design-forces';

type Kind = 'beam' | 'column' | 'wall';

const BY_LIMITING: Record<NonNullable<ProvidedRebarCheck['limiting']>, (k: Kind) => string | null> = {
  flexure: () => '22.3',
  shear: () => '22.5',
  axialFlexure: () => '22.4',
  biaxial: () => '22.4',
  torsion: () => '22.7',
  barFit: () => '25.2',
  barSpacing: () => '25.2',
  congestion: () => '25.2',
  anchorage: () => '25.4',
  minSteel: (k) => (k === 'beam' ? '9.6.1' : k === 'wall' ? '11.6' : '10.6.1'),
  maxSteel: (k) => (k === 'beam' ? '9.3.3' : '10.6.1'),
  tieSpacing: (k) => (k === 'beam' ? '9.7.6.2' : '25.7.2'),
  cover: () => '20.5.1.3',
  unsupportedCheck: () => null,
};

/** The article a check cites, or null. */
export function checkClause(c: Pick<ProvidedRebarCheck, 'limiting' | 'category'>, kind: Kind): string | null {
  const own = /§\s*([0-9]+(?:\.[0-9]+)+)/.exec(c.category)?.[1];
  if (own) return own;
  if (c.limiting) return BY_LIMITING[c.limiting](kind);
  const cat = c.category.toLowerCase();
  if (cat.startsWith('anchorage')) return '25.4';
  if (cat.startsWith('skin')) return '9.7.2.3';
  if (cat.startsWith('min steel')) return kind === 'beam' ? '9.6.1' : '10.6.1';
  if (cat.startsWith('max steel')) return kind === 'beam' ? '9.3.3' : '10.6.1';
  if (cat.startsWith('tie spacing')) return '25.7.2';
  if (cat.startsWith('steel ratio')) return '10.6.1';
  if (cat.startsWith('longitudinal')) return '22.4';
  if (cat.startsWith('shear')) return '22.5';
  if (cat.startsWith('torsion')) return '22.7';
  if (/m[yz][+-]|bottom|top|flex/.test(cat)) return '22.3';
  return null;
}

/** A failing check as «category (article)», the way the editors list it. */
export function checkLabel(c: Pick<ProvidedRebarCheck, 'limiting' | 'category'>, kind: Kind): string {
  const a = checkClause(c, kind);
  return a && !c.category.includes(a) ? `${c.category} (${a})` : c.category;
}
