/**
 * The script the bare root carries, to send a reader to their language.
 *
 * ── Why it is a script at all ──
 *
 * GitHub Pages cannot answer a 302, so the language handoff has to run in the
 * browser. `scripts/prerender.ts` inlines the string this returns into
 * `dist/index.html`, and nothing else on the site depends on it.
 *
 * ── Why it lives in its own file ──
 *
 * It restates `preferredPublicLocale()` from src/lib/i18n/public-routes.ts —
 * first offered language the browser asks for, the fallback otherwise. An
 * inline script cannot import, so the rule genuinely exists twice; what it
 * does not have to be is untested. The TypeScript side has unit tests, and
 * until this was pulled out of prerender.ts the copy that actually ships on
 * the front door of the site had none. It is now the one thing in this file
 * and `__tests__/root-handoff.test.ts` runs it.
 *
 * ── What it must not do ──
 *
 *  · Fire on anything but the bare root. `/es`, `/app/basic` and `/demo` are
 *    already where they belong.
 *  · Fire when 404.html has bounced an application route through `?route=`,
 *    or someone opening a shared model link lands on the marketing page.
 *  · Fire for `?embed`.
 *  · Lose the query string. It did, and only for Spanish and Portuguese
 *    browsers, since a reader whose language is the fallback is never
 *    redirected at all — so `stabileo.com/?utm_source=…` kept its attribution
 *    for the audience the prefixes were NOT built for and lost it for the one
 *    they were.
 */
export function rootHandoffScript(offered: readonly string[], fallback: string): string {
  return `
(function () {
  var p = new URLSearchParams(location.search);
  if (p.has('route') || p.has('embed') || location.pathname !== '/') return;
  var offered = ${JSON.stringify([...offered])};
  var want = ${JSON.stringify(fallback)};
  var langs = navigator.languages || [navigator.language || ${JSON.stringify(fallback)}];
  for (var i = 0; i < langs.length; i++) {
    var code = String(langs[i]).split('-')[0].toLowerCase();
    if (offered.indexOf(code) !== -1) { want = code; break; }
  }
  if (want !== ${JSON.stringify(fallback)}) {
    // Trailing slash: '/es' is a directory and the host answers it with a
    // 301 to '/es/'. Without it a Spanish browser paid two redirects to
    // reach the landing, and the second one was ours to avoid.
    location.replace('/' + want + '/' + location.search + location.hash);
  }
})();
`.trim();
}
