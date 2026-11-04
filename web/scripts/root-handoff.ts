export function rootHandoffScript(offered: readonly string[], fallback: string, prefix = ''): string {
  return `
(function () {
  var p = new URLSearchParams(location.search);
  if (p.has('route') || p.has('embed') || location.pathname !== ${JSON.stringify(prefix + '/')}) return;
  var offered = ${JSON.stringify([...offered])};
  var want = ${JSON.stringify(fallback)};
  var langs = navigator.languages || [navigator.language || ${JSON.stringify(fallback)}];
  for (var i = 0; i < langs.length; i++) {
    var code = String(langs[i]).split('-')[0].toLowerCase();
    if (offered.indexOf(code) !== -1) { want = code; break; }
  }
  if (want !== ${JSON.stringify(fallback)}) {
    location.replace(${JSON.stringify(prefix + '/')} + want + '/' + location.search + location.hash);
  }
})();
`.trim();
}
