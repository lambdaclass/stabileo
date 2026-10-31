import reviews from '../../../../research/tools/batches/VALIDATION.json';
import { galleryStrings } from '../research/gallery-i18n';
export function toolReviewLabel(id: string, locale: string): string {
  const count = new Set(reviews.batches.find(b => b.id === id)?.reviews.map(r => r.round)).size;
  const s = galleryStrings[locale] ?? galleryStrings.en;
  return (count === 1 ? s.reviewOne : s.reviewMany).replace('{count}', String(count));
}
