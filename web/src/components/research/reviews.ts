import catalog from '../../../../research/papers.json';
import tools from '../../../../research/tools/batches/VALIDATION.json';
import { galleryStrings } from './gallery-i18n';

/** Only completed, numbered rounds count; earlier implementation notes remain in the catalogue. */
export function reviewCount(id: string): number {
  const entry = catalog.papers.find(p => p.id === id) ?? tools.batches.find(b => b.id === id);
  return new Set((entry?.reviews ?? []).flatMap(r => 'round' in r ? [r.round] : [])).size;
}
export function reviewLabel(id: string, locale: string): string {
  const count = reviewCount(id);
  const s = galleryStrings[locale] ?? galleryStrings.en;
  return (count === 1 ? s.reviewOne : s.reviewMany).replace('{count}', String(count));
}
export function finalReview(id: string): boolean {
  const entry = catalog.papers.find(p => p.id === id) ?? tools.batches.find(b => b.id === id);
  return Boolean(entry && 'final_review' in entry && entry.final_review === true);
}
