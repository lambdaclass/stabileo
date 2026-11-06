import catalog from '../../../../research/papers.json';
import { bibliography } from './catalogue';
import { EXPERIMENTS } from './experiments';
import { cardTitle } from './card-title';
import { RESEARCH_GALLERY, researchLastReview, researchLocales } from './locales';
import { publicUrl } from '../../lib/i18n/public-routes';
import { publishedLocale } from '../../lib/i18n/published';
import { ORGANIZATION_ID, PUBLISHER, type SocialImage } from '../../lib/page-meta';
import type { PublicLocale } from '../../lib/i18n/store.svelte';

type Labels = { research: string; researchTitle: string };

export const THUMBNAIL_SIZE = { width: 640, height: 400 } as const;

export function thumbnailImage(thumbnail: string, alt: string): SocialImage | undefined {
  if (!thumbnail.endsWith('.webp')) return undefined;
  return { url: `https://stabileo.com/${thumbnail}`, alt, type: 'image/webp', ...THUMBNAIL_SIZE };
}

function paper(paperId: string) {
  const entry = catalog.papers.find((p) => p.id === paperId);
  if (!entry) throw new Error(`research meta: ${paperId} is not in papers.json`);
  return { doi: entry.doi, keywords: entry.keywords ?? [], ...bibliography(entry) };
}

function surname(name: string): string {
  return name.trim().split(/\s+/).at(-1) ?? name;
}

const AND: Record<PublicLocale, string> = { en: '&', es: 'y', pt: 'e', de: 'und', fr: 'et', tr: 've' };

function shortAuthors(authors: string[], locale: PublicLocale): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return surname(authors[0]);
  if (authors.length === 2) return `${surname(authors[0])} ${AND[locale]} ${surname(authors[1])}`;
  return `${surname(authors[0])} et al.`;
}

function credits(name: string, authors: string[], year: number): boolean {
  const first = authors[0] ? surname(authors[0]) : '';
  return new RegExp(`(^|\\D)${year}(\\D|$)`).test(name) && (!first || name.includes(first));
}

function headline(text: string): string {
  return [...text].slice(0, 110).join('');
}

export function paperTitle(name: string, paperId: string, locale: PublicLocale): string {
  const p = paper(paperId);
  const credit = credits(name, p.authors, p.year) ? '' : ` (${[shortAuthors(p.authors, locale), p.year].filter(Boolean).join(' ')})`;
  return `${name}${credit} — Stabileo Research`;
}

/** Head metadata for one paper page: the title names the original work, and the graph cites it by DOI. */
export function paperMeta(head: { paperId: string; name: string; lead: string }, locale: PublicLocale, labels: Labels) {
  const experiment = EXPERIMENTS.find((e) => e.paperId === head.paperId);
  if (!experiment) throw new Error(`research meta: ${head.paperId} has no experiment page`);
  const path = experiment.path;
  const own = publishedLocale(path, locale);
  const url = publicUrl(path, own);
  const p = paper(head.paperId);
  const doiUrl = `https://doi.org/${p.doi}`;
  const modified = researchLastReview(path);
  const original = {
    '@type': 'ScholarlyArticle',
    '@id': doiUrl,
    url: doiUrl,
    name: p.title,
    headline: headline(p.title),
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
      headline: headline(head.name),
      name: head.name,
      description: head.lead,
      inLanguage: own,
      ...(modified ? { dateModified: modified } : {}),
      ...(p.keywords.length ? { keywords: p.keywords.join(', ') } : {}),
      author: { '@id': ORGANIZATION_ID },
      publisher: PUBLISHER,
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
  ];
  return {
    title: paperTitle(head.name, head.paperId, own),
    description: head.lead,
    path,
    written: researchLocales(path) as readonly PublicLocale[],
    graph,
    image: thumbnailImage(experiment.thumbnail, experiment.thumbnailAlt),
  };
}

/** The gallery's graph: a collection whose items are the paper pages, at the URL each is published under, named as their cards are in the current `publicI18n.locale`. */
export function galleryGraph(locale: PublicLocale, labels: Labels) {
  const url = publicUrl(RESEARCH_GALLERY, locale);
  return [
    {
      '@type': 'CollectionPage',
      '@id': url,
      url,
      name: labels.researchTitle,
      inLanguage: locale,
      publisher: PUBLISHER,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: EXPERIMENTS.map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: publicUrl(e.path, publishedLocale(e.path, locale)),
          name: cardTitle(e),
        })),
      },
    },
  ];
}
