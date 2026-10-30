/** Topic relationships, kept behind the Research/Tools route boundary. */
export const RELATED: Record<string, string[]> = {
  'simply-supported-beam': ['benchmarks/macneal-harder-1985', 'benchmarks/navier-plate'],
  'cantilever-beam': ['benchmarks/mattiasson-elastica', 'benchmarks/macneal-harder-1985'],
  'column-buckling': ['stability/ferrari-sigmund-2025', 'mechanics/biggins-2026'],
  'continuous-beam': ['benchmarks/macneal-harder-1985'],
  'portal-frame': ['benchmarks/lee-frame-1968', 'benchmarks/plastic-collapse'],
  'truss-2d': ['metamaterials/grossman-2026', 'form-finding/pastrana-2026', 'benchmarks/riks-crisfield'],
  'influence-line': ['benchmarks/macneal-harder-1985'],
  'beam-natural-frequency': ['benchmarks/newmark-1959', 'benchmarks/cqc-1981'],
};
export const RELATED_COPY: Record<string, string[]> = {
  en: ['Related research and calculators', 'Research gallery', 'Free calculators', 'Engineering blog'],
  es: ['Investigación y calculadoras relacionadas', 'Galería de investigación', 'Calculadoras gratuitas', 'Blog de ingeniería'],
  pt: ['Pesquisa e calculadoras relacionadas', 'Galeria de pesquisa', 'Calculadoras gratuitas', 'Blog de engenharia'],
  de: ['Verwandte Forschung und Rechner', 'Forschungsgalerie', 'Kostenlose Rechner', 'Ingenieurblog'],
  fr: ['Recherche et calculateurs associés', 'Galerie de recherche', 'Calculateurs gratuits', 'Blog d’ingénierie'],
  tr: ['İlgili araştırmalar ve hesaplayıcılar', 'Araştırma galerisi', 'Ücretsiz hesaplayıcılar', 'Mühendislik blogu'],
};
export function relatedPaths(path: string) {
  const clean = path.replace(/\/$/, '');
  return clean.startsWith('/tools/') ? (RELATED[clean.slice(7)] ?? []).map(p => `/research/${p}`)
    : Object.entries(RELATED).filter(([, papers]) => papers.some(p => `/research/${p}` === clean)).map(([tool]) => `/tools/${tool}`);
}
