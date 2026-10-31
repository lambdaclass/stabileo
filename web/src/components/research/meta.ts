import catalog from '../../../../research/papers.json';
import { bibliography } from './catalogue';
import { EXPERIMENTS } from './experiments';
import { RESEARCH_GALLERY, researchLastReview, researchLocales } from './locales';
import { publicUrl } from '../../lib/i18n/public-routes';
import { STABILEO_ORGANIZATION } from '../../lib/page-meta';
import type { PublicLocale } from '../../lib/i18n/store.svelte';

const ORG_ID = STABILEO_ORGANIZATION['@id'];

type Labels = { research: string; researchTitle: string };

/** The locale a research URL is published in for a reader of `locale`: theirs when the page has it, else English. */
export function researchUrlLocale(path: string, locale: PublicLocale): PublicLocale {
  return (researchLocales(path) as readonly string[]).includes(locale) ? locale : 'en';
}

function paper(paperId: string) {
  const entry = catalog.papers.find((p) => p.id === paperId);
  if (!entry) throw new Error(`research meta: ${paperId} is not in papers.json`);
  return { doi: entry.doi, keywords: entry.keywords ?? [], ...bibliography(entry) };
}

function surname(name: string): string {
  return name.trim().split(/\s+/).at(-1) ?? name;
}

function shortAuthors(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return surname(authors[0]);
  if (authors.length === 2) return `${surname(authors[0])} & ${surname(authors[1])}`;
  return `${surname(authors[0])} et al.`;
}

export function paperTitle(name: string, paperId: string): string {
  const p = paper(paperId);
  const credit = name.includes(String(p.year)) ? '' : ` (${[shortAuthors(p.authors), p.year].filter(Boolean).join(' ')})`;
  return `${name}${credit} — Stabileo Research`;
}

/** Head metadata for one paper page: the title names the original work, and the graph cites it by DOI. */
export function paperMeta(head: { paperId: string; name: string; lead: string }, locale: PublicLocale, labels: Labels) {
  const experiment = EXPERIMENTS.find((e) => e.paperId === head.paperId);
  if (!experiment) throw new Error(`research meta: ${head.paperId} has no experiment page`);
  const path = experiment.path;
  const own = researchUrlLocale(path, locale);
  const url = publicUrl(path, own);
  const p = paper(head.paperId);
  const doiUrl = `https://doi.org/${p.doi}`;
  const modified = researchLastReview(path);
  const original = {
    '@type': 'ScholarlyArticle',
    '@id': doiUrl,
    url: doiUrl,
    name: p.title,
    headline: p.title.slice(0, 110),
    author: p.authors.map((name) => ({ '@type': 'Person', name })),
    datePublished: String(p.year),
    ...(p.venue ? { isPartOf: { '@type': 'Periodical', name: p.venue } } : {}),
    identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: p.doi },
  };
  const graph = [
    {
      '@type': 'ScholarlyArticle',
      '@id': `${url}#article`,
      url,
      mainEntityOfPage: url,
      headline: head.name.slice(0, 110),
      name: head.name,
      description: head.lead,
      inLanguage: own,
      ...(modified ? { dateModified: modified } : {}),
      ...(p.keywords.length ? { keywords: p.keywords.join(', ') } : {}),
      author: { '@id': ORG_ID },
      publisher: { '@id': ORG_ID },
      isPartOf: { '@type': 'CollectionPage', '@id': publicUrl(RESEARCH_GALLERY, own), name: labels.researchTitle },
      isBasedOn: { '@id': doiUrl },
      citation: original,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Stabileo', item: publicUrl('/', own) },
        { '@type': 'ListItem', position: 2, name: labels.research, item: publicUrl(RESEARCH_GALLERY, own) },
        { '@type': 'ListItem', position: 3, name: head.name, item: url },
      ],
    },
    STABILEO_ORGANIZATION,
  ];
  return {
    title: paperTitle(head.name, head.paperId),
    description: head.lead,
    path,
    written: researchLocales(path) as readonly PublicLocale[],
    graph,
  };
}

/** The gallery's graph: a collection whose items are the paper pages, at the URL each is published under. */
export function galleryGraph(locale: PublicLocale, labels: Labels) {
  const url = publicUrl(RESEARCH_GALLERY, locale);
  return [
    {
      '@type': 'CollectionPage',
      '@id': url,
      url,
      name: labels.researchTitle,
      inLanguage: locale,
      publisher: { '@id': ORG_ID },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: EXPERIMENTS.map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: publicUrl(e.path, researchUrlLocale(e.path, locale)),
          name: e.name,
        })),
      },
    },
    STABILEO_ORGANIZATION,
  ];
}
