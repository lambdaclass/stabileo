import type { Locale } from '../src/lib/i18n/offered';

type Copy = {
  title: string;
  lead: string;
  home: string;
  research: string;
  tools: string;
  blog: string;
  app: string;
};

const COPY: Record<Locale, Copy> = {
  en: {
    title: 'Page not found',
    lead: 'There is no page at this address. It may have moved, or the link may be mistyped.',
    home: 'Home',
    research: 'Research',
    tools: 'Tools',
    blog: 'Blog',
    app: 'Open the app',
  },
  es: {
    title: 'Página no encontrada',
    lead: 'No hay ninguna página en esta dirección. Puede que se haya movido o que el enlace esté mal escrito.',
    home: 'Inicio',
    research: 'Investigación',
    tools: 'Herramientas',
    blog: 'Blog',
    app: 'Abrir la aplicación',
  },
  pt: {
    title: 'Página não encontrada',
    lead: 'Não há nenhuma página neste endereço. Ela pode ter sido movida, ou o link pode estar digitado errado.',
    home: 'Início',
    research: 'Pesquisa',
    tools: 'Ferramentas',
    blog: 'Blog',
    app: 'Abrir o aplicativo',
  },
  de: {
    title: 'Seite nicht gefunden',
    lead: 'Unter dieser Adresse gibt es keine Seite. Sie wurde vielleicht verschoben, oder der Link ist falsch geschrieben.',
    home: 'Startseite',
    research: 'Forschung',
    tools: 'Werkzeuge',
    blog: 'Blog',
    app: 'App öffnen',
  },
  fr: {
    title: 'Page introuvable',
    lead: 'Il n’y a aucune page à cette adresse. Elle a peut-être été déplacée, ou le lien est mal saisi.',
    home: 'Accueil',
    research: 'Recherche',
    tools: 'Outils',
    blog: 'Blog',
    app: 'Ouvrir l’application',
  },
  tr: {
    title: 'Sayfa bulunamadı',
    lead: 'Bu adreste bir sayfa yok. Taşınmış olabilir ya da bağlantı yanlış yazılmış olabilir.',
    home: 'Ana sayfa',
    research: 'Araştırma',
    tools: 'Araçlar',
    blog: 'Blog',
    app: 'Uygulamayı aç',
  },
};

/** The host answers a 404 with this at any depth, so every URL in it must stay absolute. */
export function notFoundPage(locale: Locale, offered: readonly Locale[]): string {
  const t = COPY[locale];
  const links = [
    [`/${locale}/`, t.home],
    [`/${locale}/research/`, t.research],
    [`/${locale}/tools/`, t.tools],
    [`/${locale}/blog/`, t.blog],
  ]
    .map(([href, label]) => `<li><a href="${href}">${label}</a></li>`)
    .join('');
  const languages = offered
    .filter((l) => l !== locale)
    .map((l) => `<a href="/${l}/" hreflang="${l}" lang="${l}">${COPY[l].home}</a>`)
    .join('');
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t.title} — Stabileo</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
@font-face { font-family: 'Space Grotesk'; src: url('/fonts/space-grotesk.woff2') format('woff2'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'IBM Plex Sans'; src: url('/fonts/ibm-plex-sans.woff2') format('woff2'); font-weight: 400; font-display: swap; }
:root { color-scheme: dark; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; background: #0c1620; color: #f4f7fa; font: 400 17px/1.55 'IBM Plex Sans', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; padding: 48px 16px; }
main { width: 100%; max-width: 560px; }
.brand { display: inline-flex; align-items: center; gap: 12px; color: #f4f7fa; text-decoration: none; font: 700 22px 'Space Grotesk', system-ui, sans-serif; }
.logo { width: 32px; height: 32px; border-radius: 5px; background: #e5482a; color: #fff; display: grid; place-items: center; font-size: 19px; }
.code { margin-top: 48px; color: #e5482a; font: 700 15px 'Space Grotesk', system-ui, sans-serif; letter-spacing: .17em; }
h1 { margin-top: 10px; font: 700 clamp(32px, 7vw, 48px)/1.1 'Space Grotesk', system-ui, sans-serif; letter-spacing: -.02em; }
p { margin-top: 16px; color: #b8c6d1; }
ul { list-style: none; margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px; }
ul a, .app { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border: 1px solid #2c3d4c; border-radius: 6px; color: #f4f7fa; text-decoration: none; }
ul a:hover, ul a:focus-visible { border-color: #e5482a; }
.app { margin-top: 12px; background: #e5482a; border-color: #e5482a; color: #fff; font-weight: 600; }
nav.languages { margin-top: 40px; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 14px; }
nav.languages a { color: #8fa3b3; display: inline-flex; min-height: 32px; align-items: center; }
</style>
</head>
<body>
<main>
<a class="brand" href="/${locale}/"><span class="logo">S</span>Stabileo</a>
<div class="code">404</div>
<h1>${t.title}</h1>
<p>${t.lead}</p>
<ul>${links}</ul>
<a class="app" href="/app/basic">${t.app}</a>
<nav class="languages">${languages}</nav>
</main>
</body>
</html>
`;
}
