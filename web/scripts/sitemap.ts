import { PUBLIC_LOCALES } from '../src/lib/i18n/offered';

const ORIGIN = 'https://stabileo.com';
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function sitemapXml(written: readonly string[], modified: ReadonlyMap<string, string>): string {
  const paths = new Set(written.filter((href) => href !== '/'));
  const entries = [...paths].map((href) => {
    const path = href.replace(/^\/[a-z]{2}\//, '/');
    const lastmod = modified.get(path.replace(/\/$/, '') || '/');
    const alternates = PUBLIC_LOCALES
      .map((locale) => ({ locale, href: `/${locale}${path}` }))
      .filter((alt) => paths.has(alt.href));
    const links = alternates.map((alt) =>
      `    <xhtml:link rel="alternate" hreflang="${alt.locale}" href="${escape(ORIGIN + alt.href)}"/>`);
    if (paths.has(`/en${path}`)) links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escape(ORIGIN + '/en' + path)}"/>`);
    return `  <url>
    <loc>${escape(ORIGIN + href)}</loc>
${lastmod ? `    <lastmod>${escape(lastmod)}</lastmod>\n` : ''}${links.join('\n')}
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}
