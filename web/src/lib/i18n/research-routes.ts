export const RESEARCH_GALLERY = '/research';

const TRANSLATED = ['en', 'es', 'pt'] as const;

/** Pages whose article is still English in every language; publishing them elsewhere would be a duplicate. */
const ENGLISH_ONLY = new Set(['/research/benchmarks/shell-obstacle-course', '/research/benchmarks/macneal-harder-1985', '/research/benchmarks/riks-crisfield']);

export function isResearchRoute(path: string): boolean {
  return path === RESEARCH_GALLERY || path.startsWith(`${RESEARCH_GALLERY}/`);
}

/** The languages a research route is published in: the sitemap, the prerender and the hreflang set all read this. */
export function researchLocales(path: string): readonly string[] {
  const route = path.replace(/\/+$/, '') || '/';
  if (ENGLISH_ONLY.has(route)) return ['en'];
  return TRANSLATED;
}
