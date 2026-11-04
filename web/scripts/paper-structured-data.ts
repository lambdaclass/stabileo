import { PAPER } from '../src/lib/paper/jaie-2026';

/** Written into the prerendered /paper pages only, so the application never downloads it. */
export function paperStructuredData(origin: string, locale: string): string {
  const url = `${origin}/${locale}/paper/`;
  const graph = [
    {
      '@type': 'ScholarlyArticle',
      '@id': `${url}#article`,
      headline: PAPER.title,
      description: PAPER.note,
      abstract: PAPER.abstract,
      keywords: PAPER.keywords,
      inLanguage: 'en',
      url,
      author: PAPER.authors.map((a) => ({ '@type': 'Person', name: a.name })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Stabileo', item: `${origin}/${locale}/` },
        { '@type': 'ListItem', position: 2, name: PAPER.title, item: url },
      ],
    },
  ];
  return `<script type="application/ld+json" data-paper-ld>${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
}
