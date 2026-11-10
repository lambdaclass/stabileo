export const RESEARCH_GALLERY = '/research';

const ALL = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
const BASE = ['en', 'es', 'pt'] as const;

/** The languages each research page is written in; `research-locales.test.ts` holds this to every page's own dictionaries. */
const PUBLISHED: Record<string, readonly string[]> = {
  '/research': BASE,
  '/research/optimization/andreassen-2011': ALL,
  '/research/mechanics/biggins-2026': ALL,
  '/research/mechanics/gay-neto-2014': ALL,
  '/research/benchmarks/cqc-1981': ALL,
  '/research/benchmarks/dadeppo-arch-1975': ALL,
  '/research/optimisation/fairclough-2026': ALL,
  '/research/stability/feher-sipos-varkonyi-2026': BASE,
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

export function isResearchRoute(path: string): boolean {
  return path === RESEARCH_GALLERY || path.startsWith(`${RESEARCH_GALLERY}/`);
}

/** The languages a research route is published in: the sitemap, the prerender and the hreflang set all read this. */
export function researchLocales(path: string): readonly string[] {
  const route = path.replace(/\/+$/, '') || '/';
  return PUBLISHED[route] ?? ['en'];
}
