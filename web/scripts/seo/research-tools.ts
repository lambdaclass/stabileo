/** Only the prerenderer imports this module; no SEO catalog enters route bundles. */
import { EXPERIMENTS } from '../../src/components/research/experiments';
import catalog from '../../../research/papers.json';
import { PUBLIC_LOCALES, type Locale } from '../../src/lib/i18n/offered';
import { SUBJECTS, COPY } from './copy';
import { DETAILS } from './details';

export const TOOL_SLUGS = ['simply-supported-beam', 'cantilever-beam', 'column-buckling', 'continuous-beam', 'portal-frame', 'truss-2d', 'influence-line', 'beam-natural-frequency'];
export const RESEARCH_TOOLS_PATHS = ['/research', ...EXPERIMENTS.map(e => e.path), '/tools', ...TOOL_SLUGS.map(id => `/tools/${id}`)];
const ORDER = ['en', 'es', 'pt', 'de', 'fr', 'tr'];
export const OG_LOCALES = { en: 'en_US', es: 'es_AR', pt: 'pt_BR', de: 'de_DE', fr: 'fr_FR', tr: 'tr_TR' };
export const url = (path: string, locale: string) => `https://stabileo.com/${locale}${path}/`;
const subject = (path: string, locale: Locale) => SUBJECTS[path.split('/').at(-1)!][ORDER.indexOf(locale)];
export function searchMeta(path: string, locale: Locale) {
  const section = path.startsWith('/research') ? '/research' : '/tools';
  const index = path === section;
  const title = `${subject(path, locale)} | Stabileo`;
  const copy = COPY[locale];
  const description = index ? (section === '/research' ? copy.indexResearch : copy.indexTools)
    : `${subject(path, locale)}. ${DETAILS[path.split('/').at(-1)!][ORDER.indexOf(locale)]}`;
  const experiment = EXPERIMENTS.find(e => e.path === path);
  const image = experiment ? `https://stabileo.com/${experiment.thumbnail.replace(/\.svg$/, '.png')}` : 'https://stabileo.com/og/stabileo-social.png';
  const canonical = url(path, locale);
  const alternates = [...PUBLIC_LOCALES.map(l => ({ hreflang: l as string, href: url(path, l) })), { hreflang: 'x-default', href: url(path, 'en') }];
  const graph: Record<string, unknown>[] = [{
    '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stabileo', item: `https://stabileo.com/${locale}/` },
      { '@type': 'ListItem', position: 2, name: subject(section, locale), item: url(section, locale) },
      ...(!index ? [{ '@type': 'ListItem', position: 3, name: subject(path, locale), item: canonical }] : []),
    ],
  }];
  if (index) {
    const children = RESEARCH_TOOLS_PATHS.filter(p => p.startsWith(`${section}/`));
    graph.push({ '@type': 'ItemList', name: subject(path, locale), url: canonical, numberOfItems: children.length,
      itemListElement: children.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: subject(p, locale), url: url(p, locale) })) });
  } else if (experiment) {
    const paper = catalog.papers.find(p => p.id === experiment.paperId);
    if (!paper) throw new Error(`Missing paper: ${path}`);
    const citation = { '@type': 'ScholarlyArticle', name: paper.crossref.title, identifier: paper.doi,
      url: `https://doi.org/${paper.doi}`, author: paper.crossref.authors.map(name => ({ '@type': 'Person', name })) };
    graph.push({ '@type': 'TechArticle', headline: subject(path, locale), description, url: canonical,
      mainEntityOfPage: canonical, inLanguage: locale, image, citation, isBasedOn: citation.url,
      publisher: { '@type': 'Organization', name: 'Stabileo', url: 'https://stabileo.com/' } });
  } else {
    graph.push({ '@type': 'WebApplication', name: subject(path, locale), description, url: canonical, inLanguage: locale,
      image, applicationCategory: 'EngineeringApplication', operatingSystem: 'Any', isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' } });
  }
  return { title, description, image, canonical, alternates, ogLocale: OG_LOCALES[locale], graph };
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Replace, never append duplicate metadata captured from the application. */
export function searchHead(head: string, path: string, locale: Locale) {
  const meta = searchMeta(path, locale);
  const clean = head.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, tag => /(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"/i.test(tag) ? '' : tag)
    .replace(/<link\b[^>]*>/gi, tag => /rel="canonical"|hreflang=/i.test(tag) ? '' : tag)
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');
  const values = { description: meta.description, 'og:title': meta.title, 'og:description': meta.description,
    'og:url': meta.canonical, 'og:locale': meta.ogLocale, 'og:type': path.startsWith('/research/') ? 'article' : 'website',
    'og:image': meta.image, 'og:image:alt': subject(path, locale), 'twitter:card': 'summary_large_image',
    'twitter:title': meta.title, 'twitter:description': meta.description, 'twitter:image': meta.image, 'twitter:image:alt': subject(path, locale) };
  return `${clean}\n<title>${escape(meta.title)}</title>\n` + Object.entries(values).map(([key, value]) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escape(value)}">`).join('\n') +
    `\n<link rel="canonical" href="${meta.canonical}">\n` + meta.alternates.map(a => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`).join('\n') +
    '\n' + PUBLIC_LOCALES.filter(l => l !== locale).map(l => `<meta property="og:locale:alternate" content="${OG_LOCALES[l]}">`).join('\n') +
    `\n<script type="application/ld+json" data-search-path="/${locale}${path}/">${JSON.stringify({ '@context': 'https://schema.org', '@graph': meta.graph }).replace(/</g, '\\u003c')}</script>`;
}
