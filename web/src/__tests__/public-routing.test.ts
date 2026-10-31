import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { routeKind } from '../lib/public-route';
import { STANDING_PAGES } from '../lib/blog/pages';
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
  it('prerenders paper, research, tools and the changelog standing page', () => {
    const prerender = source('../../scripts/prerender.ts');
    for (const path of ['/paper', '/research', '/tools']) expect(prerender).toContain(`'${path}'`);
    expect(prerender).toContain('...pages');
    expect(STANDING_PAGES.some(page => page.path === '/changelog')).toBe(true);
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
