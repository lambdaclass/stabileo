import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import toolReviews from '../../../../../research/tools/batches/VALIDATION.json';

const ORIGIN = 'https://stabileo.com';
const ORGANIZATION = 'https://stabileo.com/#organization';
const WEBSITE = 'https://stabileo.com/#website';
const ERGODIC = 'https://ergodicgroup.com/#organization';
const LAMBDACLASS = 'https://lambdaclass.com/#organization';

type Node = Record<string, unknown>;
type Page = { url: string; locale: string; path: string; html: string; head: string; body: string };

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function graphOf(page: Page): Node[] {
  return [...page.html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(([, json]) => {
    const parsed = JSON.parse(json) as Node;
    return (parsed['@graph'] as Node[] | undefined) ?? [parsed];
  });
}

function walk(value: unknown, visit: (node: Node) => void) {
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit));
  else if (value && typeof value === 'object') {
    visit(value as Node);
    Object.values(value).forEach((v) => walk(v, visit));
  }
}

const types = (node: Node) => ([] as unknown[]).concat(node['@type'] ?? []);
const isA = (node: Node, type: string) => types(node).includes(type);
const idOf = (value: unknown) => (value && typeof value === 'object' ? (value as Node)['@id'] : undefined);

/** The checks every page in the sitemap must pass for search engines, run over a prerendered build in `dist`. */
export function searchMetadataSuite(dist: string) {
  describe('search metadata', () => {
    let cache: Page[] | undefined;
    const pages = (): Page[] =>
      (cache ??= [...readFileSync(join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => {
        const [, locale, rest] = new URL(url).pathname.match(/^\/([a-z]{2})(\/.*)$/)!;
        const html = readFileSync(join(dist, new URL(url).pathname, 'index.html'), 'utf8');
        return {
          url,
          locale,
          path: rest === '/' ? '/' : rest.replace(/\/$/, ''),
          html,
          head: html.split('</head>')[0],
          body: html.match(/<div id="prerender">([\s\S]*)<div id="app">/)?.[1] ?? '',
        };
      }));
    const ownPages = () => pages().filter((p) => !p.path.startsWith('/research'));
    const title = (p: Page) => decode(p.head.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    const description = (p: Page) => decode(p.head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
    const h1 = (p: Page) => stripTags(p.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
    const report = (problems: string[]) => problems.join('\n');

    it('gives every page one title and one description of a length a result page shows', () => {
      const problems = ownPages().flatMap((p) => {
        const out: string[] = [];
        if ((p.head.match(/<title>/g) ?? []).length !== 1) out.push(`${p.url}: ${(p.head.match(/<title>/g) ?? []).length} <title> elements`);
        if ((p.head.match(/<meta name="description"/g) ?? []).length !== 1) out.push(`${p.url}: not exactly one meta description`);
        const t = title(p).length, d = description(p).length;
        if (t < 25 || t > 120) out.push(`${p.url}: title is ${t} characters: ${title(p)}`);
        if (d < 90 || d > 300) out.push(`${p.url}: description is ${d} characters: ${description(p)}`);
        return out;
      });
      expect(problems, report(problems)).toEqual([]);
    });

    it('never repeats a title or a description within a language', () => {
      const problems: string[] = [];
      for (const read of [title, description]) {
        const seen = new Map<string, string>();
        for (const p of pages()) {
          const key = `${p.locale}\n${read(p)}`;
          if (seen.has(key)) problems.push(`${p.url} repeats ${seen.get(key)}: ${read(p)}`);
          else seen.set(key, p.url);
        }
      }
      expect(problems, report(problems)).toEqual([]);
    });

    it('titles each translated page in its own language', () => {
      const english = new Map(pages().filter((p) => p.locale === 'en').map((p) => [p.path, title(p)]));
      const problems = ownPages()
        .filter((p) => p.locale !== 'en' && english.get(p.path) === title(p))
        .map((p) => `${p.url} keeps the English title: ${title(p)}`);
      expect(problems, report(problems)).toEqual([]);
    });

    it('ships JSON-LD that parses and refers only to nodes it defines', () => {
      const problems = pages().flatMap((p) => {
        let graph: Node[];
        try {
          graph = graphOf(p);
        } catch (e) {
          return [`${p.url}: JSON-LD does not parse (${(e as Error).message})`];
        }
        if (graph.length === 0) return [`${p.url}: no JSON-LD`];
        if (p.path.startsWith('/research')) return [];
        const defined = new Set<unknown>();
        const referenced = new Set<unknown>();
        walk(graph, (n) => (Object.keys(n).length === 1 && '@id' in n ? referenced : defined).add(n['@id']));
        return [...referenced].filter((id) => !defined.has(id)).map((id) => `${p.url}: refers to ${id} without defining it`);
      });
      expect(problems, report(problems)).toEqual([]);
    });

    it('names Stabileo, Ergodic Group as its publisher and LambdaClass as its developer on every page', () => {
      const problems = pages().flatMap((p) => {
        const graph = graphOf(p);
        const out: string[] = [];
        const org = graph.find((n) => n['@id'] === ORGANIZATION);
        if (!org || !isA(org, 'Organization')) out.push(`${p.url}: no Stabileo Organization`);
        else if (idOf(org.parentOrganization) !== ERGODIC) out.push(`${p.url}: the Organization is not part of Ergodic Group`);
        const site = graph.find((n) => n['@id'] === WEBSITE);
        if (!site || idOf(site.publisher) !== ERGODIC) out.push(`${p.url}: no WebSite published by Ergodic Group`);
        if (!graph.some((n) => n['@id'] === LAMBDACLASS && n.name === 'LambdaClass')) out.push(`${p.url}: LambdaClass is not credited`);
        return out;
      });
      expect(problems, report(problems)).toEqual([]);
    });

    it('positions Stabileo as open-source structural engineering software, its AI as in development with your own key', () => {
      const positioning: Record<string, string[]> = {
        en: ['open-source structural engineering software'],
        es: ['software de ingeniería estructural de código abierto'],
        pt: ['software de engenharia estrutural de código aberto'],
        de: ['quelloffene', 'software für die tragwerksplanung'],
        fr: ['logiciel open source d’ingénierie des structures'],
        tr: ['açık kaynaklı yapı mühendisliği yazılımı'],
      };
      const problems = ownPages()
        .filter((p) => p.path === '/' || p.path === '/tools')
        .flatMap((p) => {
          const out: string[] = [];
          const text = p.path === '/' ? title(p) : description(p);
          if (!positioning[p.locale].every((words) => text.toLocaleLowerCase(p.locale).includes(words))) out.push(`${p.url}: "${text}" does not say "${positioning[p.locale].join(' … ')}"`);
          if (p.path === '/') {
            if (!/Claude/.test(description(p)) || !/OpenAI/.test(description(p))) out.push(`${p.url}: the description does not say the AI assistant uses your own Claude or OpenAI key`);
            for (const tag of ['og:title', 'twitter:title']) {
              if (decode(p.head.match(new RegExp(`(?:property|name)="${tag}" content="([^"]*)"`))?.[1] ?? '') !== title(p)) out.push(`${p.url}: ${tag} is not the title`);
            }
            const app = graphOf(p).find((n) => isA(n, 'SoftwareApplication'));
            if (app?.applicationCategory !== 'EngineeringApplication' || !String(app?.license).includes('agpl') || app?.sameAs !== 'https://github.com/lambdaclass/stabileo') {
              out.push(`${p.url}: the SoftwareApplication lacks its category, licence or repository`);
            }
          }
          return out;
        });
      expect(problems, report(problems)).toEqual([]);
    });

    it('describes the software honestly: free, offered at no price, from Ergodic Group, built by LambdaClass', () => {
      const problems = ownPages().flatMap((p) =>
        graphOf(p)
          .filter((n) => isA(n, 'SoftwareApplication') || isA(n, 'WebApplication'))
          .flatMap((app) => {
            const out: string[] = [];
            const offers = ([] as Node[]).concat((app.offers as Node[] | undefined) ?? []);
            if (offers.length === 0) out.push(`${p.url}: ${app.name} states no offer`);
            for (const o of offers) if (o.price !== '0') out.push(`${p.url}: ${app.name} states a price of ${o.price}`);
            if (app.isAccessibleForFree !== true) out.push(`${p.url}: ${app.name} is not marked free`);
            if (idOf(app.publisher) !== ERGODIC) out.push(`${p.url}: ${app.name} is not published by Ergodic Group`);
            if (idOf(app.author) !== LAMBDACLASS) out.push(`${p.url}: ${app.name} is not credited to LambdaClass`);
            return out;
          }),
      );
      expect(problems, report(problems)).toEqual([]);
    });

    it('gives every page below the landing a breadcrumb that ends at itself', () => {
      const problems = ownPages()
        .filter((p) => p.path !== '/')
        .flatMap((p) => {
          const crumbs = graphOf(p).find((n) => isA(n, 'BreadcrumbList'));
          const items = (crumbs?.itemListElement as Node[] | undefined) ?? [];
          if (items.length < 2) return [`${p.url}: no breadcrumb`];
          const out: string[] = [];
          if (items[0].item !== `${ORIGIN}/${p.locale}/`) out.push(`${p.url}: breadcrumb starts at ${items[0].item}`);
          if (items.at(-1)!.item !== p.url) out.push(`${p.url}: breadcrumb ends at ${items.at(-1)!.item}`);
          if (items.some((item, i) => item.position !== i + 1 || !item.name)) out.push(`${p.url}: breadcrumb items are unnumbered or unnamed`);
          return out;
        });
      expect(problems, report(problems)).toEqual([]);
    });

    it('states each calculator as a free web application named in its title, linked from every other calculator', () => {
      const tools = ownPages().filter((p) => p.path.startsWith('/tools/'));
      expect(tools.length).toBeGreaterThan(0);
      const problems = tools.flatMap((p) => {
        const out: string[] = [];
        const name = h1(p);
        if (!title(p).toLowerCase().includes(name.toLowerCase())) out.push(`${p.url}: the title "${title(p)}" does not name the calculator "${name}"`);
        const app = graphOf(p).find((n) => isA(n, 'WebApplication'));
        if (!app) return [...out, `${p.url}: no WebApplication`];
        if (app['@id'] !== `${p.url}#calculator`) out.push(`${p.url}: WebApplication @id is ${app['@id']}`);
        if (app.url !== p.url) out.push(`${p.url}: WebApplication url is ${app.url}`);
        if (app.name !== name) out.push(`${p.url}: WebApplication is named "${app.name}", the page "${name}"`);
        if (app.description !== description(p)) out.push(`${p.url}: WebApplication description differs from the meta description`);
        if (app.inLanguage !== p.locale) out.push(`${p.url}: WebApplication inLanguage is ${app.inLanguage}`);
        if (app.applicationCategory !== 'EngineeringApplication') out.push(`${p.url}: WebApplication category is ${app.applicationCategory}`);
        for (const other of tools.filter((o) => o.locale === p.locale && o !== p)) {
          if (!p.body.includes(`href="${new URL(other.url).pathname}"`)) out.push(`${p.url} does not link ${other.url}`);
        }
        return out;
      });
      expect(problems, report(problems)).toEqual([]);
    });

    it('lists every calculator from the tools index', () => {
      const problems = ownPages()
        .filter((p) => p.path === '/tools')
        .flatMap((p) => {
          const list = graphOf(p).find((n) => isA(n, 'ItemList'));
          const listed = new Set(((list?.itemListElement as Node[] | undefined) ?? []).map((i) => i.url));
          return ownPages()
            .filter((t) => t.locale === p.locale && t.path.startsWith('/tools/'))
            .filter((t) => !listed.has(t.url) || !p.body.includes(`href="${new URL(t.url).pathname}"`))
            .map((t) => `${p.url} does not list ${t.url}`);
        });
      expect(problems, report(problems)).toEqual([]);
    });

    it('dates the blog index by its newest post and each calculator by its latest review, not by the build', () => {
      const lastmod = new Map(
        [...readFileSync(join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map(([, url, day]) => [url, day]),
      );
      const reviewed = toolReviews.batches.flatMap((b) => b.reviews.map((r) => r.date)).sort().at(-1);
      const problems = ownPages().flatMap((p) => {
        const day = lastmod.get(p.url);
        if (p.path === '/blog') {
          const newest = ownPages().filter((o) => o.path.startsWith('/blog/')).map((o) => lastmod.get(o.url)!).sort().at(-1);
          return day === newest ? [] : [`${p.url}: lastmod ${day}, newest post ${newest}`];
        }
        if (p.path.startsWith('/tools')) return day === reviewed ? [] : [`${p.url}: lastmod ${day}, latest review ${reviewed}`];
        return [];
      });
      expect(problems, report(problems)).toEqual([]);
    });

    it('states the paper as a scholarly article with its authors', () => {
      const papers = ownPages().filter((p) => p.path === '/paper');
      expect(papers.length).toBeGreaterThan(0);
      const problems = papers.flatMap((p) => {
        const article = graphOf(p).find((n) => isA(n, 'ScholarlyArticle'));
        if (!article) return [`${p.url}: no ScholarlyArticle`];
        const authors = ([] as Node[]).concat((article.author as Node[] | undefined) ?? []);
        const out: string[] = [];
        if (article.headline !== h1(p).replace(/\*$/, '')) out.push(`${p.url}: headline "${article.headline}" is not the paper's title "${h1(p)}"`);
        if (authors.length === 0 || authors.some((a) => !a.name)) out.push(`${p.url}: no named authors`);
        if (article.inLanguage !== 'en') out.push(`${p.url}: the paper is in English, not ${article.inLanguage}`);
        return out;
      });
      expect(problems, report(problems)).toEqual([]);
    });
  });
}
