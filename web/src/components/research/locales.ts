import { EXPERIMENTS } from './experiments';
import catalog from '../../../../research/papers.json';
import { RESEARCH_GALLERY, isResearchRoute, researchLocales } from './published';

export { RESEARCH_GALLERY, isResearchRoute, researchLocales } from './published';

export const RESEARCH_PAPER_PATHS: readonly string[] = EXPERIMENTS.map((e) => e.path);

export function supportsResearchRoute(path: string, locale: string): boolean {
  return !isResearchRoute(path) || researchLocales(path).includes(locale);
}

function reviewDay(paperId: string): string | undefined {
  const reviews = catalog.papers.find((p) => p.id === paperId)?.reviews ?? [];
  return reviews.map((r) => r.date).filter((d): d is string => typeof d === 'string').sort().at(-1);
}

/** The day a research page last changed, for the sitemap and dateModified: its latest review round. */
export function researchLastReview(path: string): string | undefined {
  const route = path.replace(/\/+$/, '');
  const ids = route === RESEARCH_GALLERY ? EXPERIMENTS.map((e) => e.paperId) : EXPERIMENTS.filter((e) => e.path === route).map((e) => e.paperId);
  return ids.map(reviewDay).filter((d): d is string => !!d).sort().at(-1);
}
