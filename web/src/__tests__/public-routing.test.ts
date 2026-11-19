import { buildFeatures } from '../../config/public-features.mjs';
import { MAIN_TOOL_IDS } from '../lib/main-tool-routes';
import { EXAMPLE_PATHS } from '../lib/public-surface';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { routeKind } from '../lib/public-route';
import { STANDING_PAGES } from '../lib/blog/pages';
import { RESEARCH_GALLERY, RESEARCH_PAPER_PATHS, researchLocales } from '../components/research/locales';
import { POSTS, writtenIn as writtenInContent } from '../lib/blog';
import { PUBLIC_LOCALES } from '../lib/i18n/offered';
import { PAPER_LOCALES } from '../components/paper/locales';
import { publicPaths, writtenIn, POST_DATE, POST_LASTMOD } from '../../scripts/public-paths';
import { SITE_NAV, currentNav } from '../components/site/site-nav';
import { toolPaths } from '../components/tools/registry';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const { accounts, diagramGame, tools } = buildFeatures();
const legalPaths = ['/terms', '/privacy', '/usage-data'];
const publishedTools = tools ? toolPaths() : ['/tools', ...MAIN_TOOL_IDS.map(id => `/tools/${id}`)];
const routes = [
  ['/', 'landing'], ['/blog', 'blog'], ['/changelog', 'blog'],
  ['/paper', 'paper'], ['/research', 'research'],
  ['/research/fracture/shauer-2025', 'research'], ['/tools', 'tools'],
  ['/tools/simply-supported-beam', 'tools'], ['/tools/beam-frame', tools ? 'tools' : 'landing'],
  ['/diagram-game', diagramGame ? 'game' : 'landing'],
  ['/examples', tools ? 'tools' : 'examples'], ['/examples/beam-frame', tools ? 'tools' : 'examples'],
  ['/register', accounts ? 'register' : 'landing'], ['/terms', accounts ? 'blog' : 'landing'],
] as const;

describe('merged public routes', () => {
  for (const locale of ['', '/en', '/es', '/pt']) {
    it.each(routes)(`${locale}%s selects %s`, (path, kind) => {
      const pathname = `${locale}${path === '/' ? '' : path}/`;
      expect(routeKind({ pathname, search: '', hash: '' }).kind).toBe(kind);
    });
  }
  it.each(['/app/basic', '/app/pro', '/app/education', '/demo'])('%s opens the app', pathname => {
    expect(routeKind({ pathname, search: '', hash: '' }).kind).toBe('app');
  });
  it.each(routes)('shared models and embeds take precedence on %s', (pathname) => {
    expect(routeKind({ pathname, search: '?embed=1', hash: '' }).kind).toBe('app');
    expect(routeKind({ pathname, search: '', hash: '#data=model' }).kind).toBe('app');
  });
  it('keeps the combined navigation order and resolves every page destination', () => {
    expect(SITE_NAV.map(item => item.id)).toEqual([
      'basic', ...(tools ? [] : ['examples']), 'tools', ...(diagramGame ? ['game'] : []), 'research', 'pricing', 'blog',
    ]);
    for (const item of SITE_NAV) {
      if (item.kind === 'page') {
        expect(routeKind({ pathname: `/en${item.to}/`, search: '', hash: '' }).kind).not.toBe('landing');
      }
    }
  });
  it('marks the section a page belongs to: the paper under research, the changelog under the blog', () => {
    expect(['/', '/cirsoc', '/reliability', '/sap2000-alternative', '/blogger', '/papers'].map(currentNav)).toEqual([null, null, null, null, null, null]);
    expect(['/tools', '/tools/truss-2d', '/tools/beam-frame', '/diagram-game', '/research', '/research/benchmarks/navier-plate', '/paper', '/blog', '/blog/safety-advisories', '/changelog'].map(currentNav))
      .toEqual(['tools', 'tools', 'tools', diagramGame ? 'game' : null, 'research', 'research', 'research', 'blog', 'blog', 'blog']);
  });
  it('known wrong result: #2087 — prerenders paper, research, tools, every standing page and every post, each once', async () => {
    const paths = await publicPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(RESEARCH_GALLERY).toBe('/research');
    const standing = STANDING_PAGES.filter(page => accounts || !legalPaths.includes(page.path));
    for (const path of ['/', '/blog', '/paper', ...publishedTools, ...(diagramGame ? ['/diagram-game'] : []), '/changelog', RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS, ...standing.map(page => page.path), ...POSTS.map(post => `/blog/${post.slug}`)]) {
      expect(paths, path).toContain(path);
    }
  });
  it('known wrong result: #2087 — preserves every post’s publication and last-change dates for feeds and sitemaps', async () => {
    await publicPaths();
    for (const post of POSTS) {
      const path = `/blog/${post.slug}`;
      expect(POST_DATE.get(path), path).toBe(post.date);
      expect(POST_LASTMOD.get(path), path).toBe(post.updated ?? post.date);
    }
  });
  it('builds each page in exactly the languages it is written in', async () => {
    const paths = await publicPaths();
    for (const path of paths) expect(writtenIn(path), path).toContain('en');
    for (const path of ['/', '/blog', ...publishedTools, ...(diagramGame ? ['/diagram-game'] : []), ...(tools ? [] : EXAMPLE_PATHS)]) {
      expect(writtenIn(path), path).toEqual([...PUBLIC_LOCALES]);
    }
    expect(paths.filter(path => path === '/tools' || path.startsWith('/tools/')).sort()).toEqual([...publishedTools].sort());
    expect(paths.filter(path => path === '/examples' || path.startsWith('/examples/'))).toEqual(tools ? [] : EXAMPLE_PATHS);
    expect(paths.includes('/diagram-game')).toBe(diagramGame);
    for (const path of legalPaths) expect(paths.includes(path), path).toBe(accounts);
    expect(writtenIn('/paper')).toEqual(PUBLIC_LOCALES.filter((l) => PAPER_LOCALES.includes(l)));
    for (const path of [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS]) expect(writtenIn(path), path).toEqual(PUBLIC_LOCALES.filter((l) => researchLocales(path).includes(l)));
    for (const p of POSTS) expect(writtenIn(`/blog/${p.slug}`), p.slug).toEqual(writtenInContent(p.i18n));
    for (const page of STANDING_PAGES) {
      expect(writtenIn(page.path), page.path).toEqual(accounts || !legalPaths.includes(page.path) ? writtenInContent(page.i18n) : []);
    }
  });
  it('keeps the Root and App feature boundaries lazy and excludes paper from editor activity', () => {
    const root = source('../Root.svelte');
    const app = source('../App.svelte');
    for (const text of [root, app]) {
      expect(text).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]*(?:ResearchPage|ToolsPage|DiagramGamePage|ExamplesPage|PaperPage)\.svelte/);
      expect(text).toContain("loadPublicPage");
    }
    const loader = source('../lib/public-navigation.ts');
    expect(loader).toContain("import('../components/research/load-page')");
    expect(loader).toContain("import('../components/tools/load-page')");
    expect(loader).toContain("import('../components/examples/load-page')");
    expect(loader).toContain("import('../components/diagram-game/load-page')");
    expect(loader).toContain("import('../components/paper/PaperPage.svelte')");
    expect(root).toContain("import('./load-app')");
    expect(app).toContain('const editorActive = $derived(!showLanding && !showBlog && !showExperiment && !showPaper && !uiStore.viewerMode && !examLock.locked)');
    expect(app).toContain("if (showLanding || showBlog || showExperiment || showPaper || typeof window === 'undefined') return;");
  });
});
