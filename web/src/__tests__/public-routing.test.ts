import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { routeKind } from '../lib/public-route';
import { STANDING_PAGES } from '../lib/blog/pages';
import { RESEARCH_GALLERY, RESEARCH_PAPER_PATHS, researchLocales } from '../components/research/locales';
import { POSTS, writtenIn as writtenInContent } from '../lib/blog';
import { PUBLIC_LOCALES } from '../lib/i18n/offered';
import { PAPER_LOCALES } from '../components/paper/locales';
import { publicPaths, writtenIn } from '../../scripts/public-paths';
import { SITE_NAV } from '../components/site/site-nav';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const routes = [
  ['/', 'landing'], ['/blog', 'blog'], ['/changelog', 'blog'],
  ['/paper', 'paper'], ['/research', 'research'],
  ['/research/fracture/shauer-2025', 'research'], ['/tools', 'tools'],
  ['/tools/simply-supported-beam', 'tools'],
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
      'basic', 'pro', 'ai', 'education', 'pricing', 'tools', 'blog', 'changelog', 'paper', 'research',
    ]);
    for (const item of SITE_NAV) {
      if (item.kind === 'page') {
        expect(routeKind({ pathname: `/en${item.to}/`, search: '', hash: '' }).kind).not.toBe('landing');
      }
    }
  });
  it('prerenders paper, research, tools, every standing page and every post, each once', async () => {
    const paths = await publicPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(RESEARCH_GALLERY).toBe('/research');
    for (const path of ['/', '/blog', '/paper', '/tools', '/changelog', RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS, ...STANDING_PAGES.map(page => page.path), ...POSTS.map(post => `/blog/${post.slug}`)]) {
      expect(paths, path).toContain(path);
    }
  });
  it('builds each page in exactly the languages it is written in', async () => {
    const paths = await publicPaths();
    for (const path of paths) expect(writtenIn(path), path).toContain('en');
    for (const path of ['/', '/blog', '/tools', ...paths.filter((p) => p.startsWith('/tools/'))]) expect(writtenIn(path), path).toEqual([...PUBLIC_LOCALES]);
    expect(writtenIn('/paper')).toEqual(PUBLIC_LOCALES.filter((l) => PAPER_LOCALES.includes(l)));
    for (const path of [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS]) expect(writtenIn(path), path).toEqual(PUBLIC_LOCALES.filter((l) => researchLocales(path).includes(l)));
    for (const p of POSTS) expect(writtenIn(`/blog/${p.slug}`), p.slug).toEqual(writtenInContent(p.i18n));
    for (const page of STANDING_PAGES) expect(writtenIn(page.path), page.path).toEqual(writtenInContent(page.i18n));
  });
  it('keeps the Root and App feature boundaries lazy and excludes paper from editor activity', () => {
    const root = source('../Root.svelte');
    const app = source('../App.svelte');
    for (const text of [root, app]) {
      expect(text).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]*(?:ResearchPage|ToolsPage|PaperPage)\.svelte/);
      expect(text).toContain("import('./components/paper/PaperPage.svelte')");
    }
    expect(root).toContain("import('./components/research/load-page')");
    expect(root).toContain("import('./components/tools/load-page')");
    expect(root).toContain("import('./load-app')");
    expect(app).toContain("import('./components/research/load-experiment')");
    expect(app).toContain('const editorActive = $derived(!showLanding && !showBlog && !showExperiment && !showPaper)');
    expect(app).toContain("if (showLanding || showBlog || showExperiment || showPaper || typeof window === 'undefined') return;");
  });
});
