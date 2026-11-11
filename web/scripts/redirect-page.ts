import type { Locale } from '../src/lib/i18n/offered';
import { movedRoute } from '../src/lib/legacy-routes';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The file left at a moved address. The script runs first so the query (a shared tool's settings)
 * and the fragment come along; the refresh is for a reader without scripts.
 */
export function redirectPage(origin: string, locale: Locale, from: string): string {
  const to = movedRoute(from);
  if (to === null) throw new Error(`redirect-page: ${from} did not move`);
  const href = `/${locale}${to}/`;
  const json = JSON.stringify(href).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Stabileo</title>
<link rel="canonical" href="${escape(origin + href)}">
<script>location.replace(${json} + location.search + location.hash);</script>
<meta http-equiv="refresh" content="0; url=${escape(href)}">
</head>
<body>
<p><a href="${escape(href)}">${escape(origin + href)}</a></p>
</body>
</html>
`;
}
