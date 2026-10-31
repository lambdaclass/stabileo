import { EXPERIMENTS } from './experiments';
import catalog from '../../../../research/papers.json';

export const RESEARCH_GALLERY = '/research';

const ALL = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
const BASE = ['en', 'es', 'pt'] as const;

/** The languages each research page is written in; `research-locales.test.ts` holds this to every page's own dictionaries. */
const PUBLISHED: Record<string, readonly string[]> = {
  '/research': ALL,
  '/research/optimization/andreassen-2011': ALL,
  '/research/mechanics/biggins-2026': ALL,
  '/research/benchmarks/cqc-1981': ALL,
  '/research/benchmarks/dadeppo-arch-1975': ALL,
  '/research/optimisation/fairclough-2026': ALL,
  '/research/stability/ferrari-sigmund-2025': BASE,
  '/research/metamaterials/grossman-2026': ALL,
  '/research/benchmarks/lee-frame-1968': ALL,
  '/research/benchmarks/macneal-harder-1985': ALL,
  '/research/benchmarks/mattiasson-elastica': ALL,
  '/research/benchmarks/navier-plate': ALL,
  '/research/benchmarks/newmark-1959': BASE,
  '/research/form-finding/pastrana-2026': BASE,
  '/research/benchmarks/plastic-collapse': ALL,
  '/research/benchmarks/riks-crisfield': ALL,
  '/research/fracture/shauer-2025': ALL,
  '/research/benchmarks/shell-obstacle-course': ['en'],
};

export const RESEARCH_PAPER_PATHS: readonly string[] = EXPERIMENTS.map((e) => e.path);

export function isResearchRoute(path: string): boolean {
  return path === RESEARCH_GALLERY || path.startsWith(`${RESEARCH_GALLERY}/`);
}

/** The languages a research route is published in: the sitemap, the prerender and the hreflang set all read this. */
export function researchLocales(path: string): readonly string[] {
  const route = path.replace(/\/+$/, '') || '/';
  return PUBLISHED[route] ?? ['en'];
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
