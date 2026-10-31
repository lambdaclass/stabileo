import { EXPERIMENTS } from './experiments';
import catalog from '../../../../research/papers.json';

export const RESEARCH_GALLERY = '/research';

const TRANSLATED = ['en', 'es', 'pt'] as const;

/** Pages whose article is still English in every language; publishing them elsewhere would be a duplicate. */
const ENGLISH_ONLY = new Set(['/research/benchmarks/shell-obstacle-course', '/research/benchmarks/macneal-harder-1985', '/research/benchmarks/riks-crisfield']);

export const RESEARCH_PAPER_PATHS: readonly string[] = EXPERIMENTS.map((e) => e.path);

export function isResearchRoute(path: string): boolean {
  return path === RESEARCH_GALLERY || path.startsWith(`${RESEARCH_GALLERY}/`);
}

/** The languages a research route is published in: the sitemap, the prerender and the hreflang set all read this. */
export function researchLocales(path: string): readonly string[] {
  const route = path.replace(/\/+$/, '') || '/';
  if (ENGLISH_ONLY.has(route)) return ['en'];
  return TRANSLATED;
}

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
