import { FROZEN_SERVICES_NOTICE } from '../src/lib/frozen-services';
/**
 * A build kept under its commit: `https://snapshots.stabileo.com/@<sha>/…` serves that commit's site forever
 * (research/DESIGN.md §5, docs/DEPLOY.md "Snapshots"). The plain address is always the latest.
 *
 * ── How a build lives under a prefix without touching the normal build ──
 *
 * The application reads `location.pathname` in many places and writes root-relative addresses
 * (`/en/blog/`, `/app/basic`) into links and history. Rather than thread a base path through all of
 * them, which would change the production bundle, a snapshot build (and only a snapshot build):
 *
 *  1. builds with Vite's `base` = `/@<sha>/`, so every emitted asset, chunk, worker and WASM URL is
 *     under the prefix;
 *  2. compiles every free reference to `location` / `window.location` in `src/` to
 *     `__stabileoLocation`, whose `pathname` and `href` are the address WITHOUT the prefix, so the
 *     routing reads `/en/research/…` exactly as on the plain site;
 *  3. ships a small classic script in the page's head (`snapshotRuntime`) that defines
 *     `__stabileoLocation`, puts the prefix back on whatever the application writes (history,
 *     `location.assign`, `window.open`, root-relative links, images and fetches of the site's own
 *     files; never `/api/`, which is unavailable on the snapshot host) and shows the version banner.
 *
 * With `BASE_PATH` unset or `/` the plugin does nothing at all, so the normal build is byte-for-byte
 * what it was (checked: docs/DEPLOY.md "Snapshots").
 */
import { researchBuildMetadata } from './research-build';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { transformWithEsbuild, type Plugin } from 'vite';

export const REPO_URL = 'https://github.com/lambdaclass/stabileo';

export type Snapshot = {
  /** The prefix without its trailing slash: `/@9aad844`. */
  prefix: string;
  /** The short commit in the prefix. */
  short: string;
  /** The full commit the build is made from. */
  commit: string;
  /** The commit's date (committer, ISO 8601). */
  date: string;
};

/** `/@<7–40 hex>/`: the only bases a snapshot is built with. */
const SNAPSHOT_BASE = /^\/@([0-9a-f]{7,40})\/$/;

/**
 * The snapshot a `BASE_PATH` asks for, or null for a normal build. The prefix must name the commit
 * being built (`SNAPSHOT_COMMIT`, else `git rev-parse HEAD`): a snapshot labelled with another
 * commit would be a permanent link to the wrong code.
 */
export function snapshotFor(basePath: string | undefined, cwd: string): Snapshot | null {
  if (!basePath || basePath === '/') return null;
  const m = SNAPSHOT_BASE.exec(basePath);
  if (!m) throw new Error(`BASE_PATH ${JSON.stringify(basePath)}: a snapshot base is /@<commit>/ (7 to 40 lowercase hex digits)`);
  const git = (args: string) => execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  const commit = process.env.SNAPSHOT_COMMIT || git('rev-parse HEAD');
  if (!commit.startsWith(m[1])) throw new Error(`BASE_PATH ${basePath} does not name the commit being built (${commit})`);
  const date = process.env.SNAPSHOT_DATE || git(`show -s --format=%cI ${commit}`);
  return { prefix: basePath.slice(0, -1), short: m[1], commit, date };
}

/**
 * The page's runtime half: a classic script, run before the application's modules. Self-contained
 * (it is serialised into index.html), ES2017, no imports.
 */
export function snapshotRuntime(s: Snapshot): string {
  const config = JSON.stringify({ prefix: s.prefix, short: s.short, commit: s.commit, date: s.date, repo: REPO_URL, servicesNotice: FROZEN_SERVICES_NOTICE });
  return `(${runtime.toString()})(${config});`;
}

/* eslint-disable no-restricted-globals */
function runtime(cfg: { prefix: string; short: string; commit: string; date: string; repo: string; servicesNotice: Record<string, string> }) {
  const namespace = `stabileo-snapshot:${cfg.commit}:`;
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    let backing: Storage;
    let failure: unknown;
    try { backing = window[name]; } catch (error) { failure = error; }
    const source = () => {
      if (!backing) throw failure;
      return backing;
    };
    const keys = () => Array.from({ length: source().length }, (_, i) => source().key(i)!)
      .filter(key => key.startsWith(namespace));
    const storage = {
      get length() { return keys().length; },
      key(index: number) { return keys()[index]?.slice(namespace.length) ?? null; },
      getItem(key: string) { return source().getItem(namespace + String(key)); },
      setItem(key: string, value: string) { source().setItem(namespace + String(key), String(value)); },
      removeItem(key: string) { source().removeItem(namespace + String(key)); },
      clear() { keys().forEach(key => source().removeItem(key)); },
    };
    Object.defineProperty(window, name, { value: storage });
  }
  Object.defineProperty(window, 'indexedDB', { value: undefined });

  const P = cfg.prefix;
  const L = window.location;
  const under = (p: string) => p === P || p.indexOf(P + '/') === 0;
  const strip = (p: string) => (p === P ? '/' : under(p) ? p.slice(P.length) : p);
  /**
   * A root-relative address of this site ('/en/blog/') → under the prefix. Absolute URLs are left
   * alone: the canonical and hreflang links name the latest site on purpose.
   */
  const add = <T>(u: T): T | string => {
    if (u == null || u instanceof URL) return u;
    const s = String(u);
    if (!/^\/(?!\/)/.test(s)) return u;
    let url: URL;
    try {
      url = new URL(s, L.href);
    } catch {
      return u;
    }
    // Not the backend (/api) and not another snapshot or the index (/@…).
    if (url.origin !== L.origin || under(url.pathname) || /^\/(api(\/|$)|@)/.test(url.pathname)) return u;
    return P + url.pathname + url.search + url.hash;
  };

  const loc = {
    get pathname() { return strip(L.pathname); },
    set pathname(v: string) { L.pathname = add(v) as string; },
    get href() { return L.origin + strip(L.pathname) + L.search + L.hash; },
    set href(v: string) { L.href = add(v) as string; },
    get search() { return L.search; },
    set search(v: string) { L.search = v; },
    get hash() { return L.hash; },
    set hash(v: string) { L.hash = v; },
    get origin() { return L.origin; },
    get host() { return L.host; },
    get hostname() { return L.hostname; },
    get port() { return L.port; },
    get protocol() { return L.protocol; },
    assign(u: string) { L.assign(add(u) as string); },
    replace(u: string) { L.replace(add(u) as string); },
    reload() { L.reload(); },
    toString() { return loc.href; },
  };
  Object.defineProperty(window, '__stabileoLocation', { value: loc });

  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = history[m];
    history[m] = function (this: History, state: unknown, title: string, url?: string | URL | null) {
      orig.call(this, state, title, url == null ? url : (add(url) as string));
      banner();
    };
  }
  const open = window.open;
  window.open = function (this: Window, u?: string | URL, ...rest: [string?, string?]) {
    return open.call(this, u == null ? u : (add(u) as string), ...rest);
  } as typeof window.open;
  const fetch0 = window.fetch;
  window.fetch = function (this: Window, input: RequestInfo | URL, init?: RequestInit) {
    return fetch0.call(this, typeof input === 'string' ? (add(input) as string) : input, init);
  } as typeof window.fetch;

  // Links and images written root-relative: rewritten as they enter the document, so hovering,
  // copying and opening in a new tab all name the snapshot.
  const fixSrcset = (v: string) => v.split(',').map((part) => part.replace(/^(\s*)(\S+)/, (_m, sp: string, url: string) => sp + add(url))).join(',');
  const fix = (el: Element) => {
    if (el.hasAttribute('data-snapshot-exit')) return;
    for (const a of ['href', 'src']) {
      const v = el.getAttribute(a);
      if (v != null) {
        const w = add(v);
        if (w !== v) el.setAttribute(a, w as string);
      }
    }
    const ss = el.getAttribute('srcset');
    if (ss != null) {
      const w = fixSrcset(ss);
      if (w !== ss) el.setAttribute('srcset', w);
    }
  };
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    return setAttribute.call(this, name, this.tagName === 'IFRAME' && name.toLowerCase() === 'src' ? add(value) as string : value);
  };
  if (typeof HTMLIFrameElement !== 'undefined') {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      ...descriptor,
      set(value: string) { descriptor.set!.call(this, add(value)); },
    });
  }
  const SEL = 'a[href],link[href],iframe[src],img[src],img[srcset],source[src],source[srcset]';
  const fixTree = (n: unknown) => {
    if (!(n instanceof Element) && !(n instanceof DocumentFragment)) return;
    if (n instanceof Element && n.matches(SEL)) fix(n);
    n.querySelectorAll(SEL).forEach(fix);
  };
  // Before insertion, not after: a <link rel="preload"> or an <img> starts loading the moment it is
  // inserted, before an observer hears of it.
  const wrap = (proto: object, names: string[]) => {
    for (const name of names) {
      const target = proto as Record<string, (...a: unknown[]) => unknown>;
      const orig = target[name];
      if (typeof orig !== 'function') continue;
      target[name] = function (this: unknown, ...args: unknown[]) {
        args.forEach(fixTree);
        return orig.apply(this, args);
      };
    }
  };
  wrap(Node.prototype, ['appendChild', 'insertBefore', 'replaceChild']);
  wrap(Element.prototype, ['append', 'prepend', 'before', 'after', 'replaceWith', 'insertAdjacentElement']);
  wrap(CharacterData.prototype, ['before', 'after', 'replaceWith']);
  wrap(DocumentFragment.prototype, ['append', 'prepend']);
  // What the parser inserts, and attributes changed later.
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        if ((r.target as Element).matches(SEL)) fix(r.target as Element);
        continue;
      }
      r.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (el.matches(SEL)) fix(el);
        el.querySelectorAll(SEL).forEach(fix);
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'src', 'srcset'] });

  // The version banner: which version this is, the latest one, what changed since.
  const TEXT: Record<string, [string, string, string, string]> = {
    de: ['Sie sehen die Version vom', 'Hier ist die neueste Version', 'Änderungen seitdem (GitHub)', 'Ausblenden'],
    fr: ['Vous consultez la version du', 'La dernière version est ici', 'Modifications depuis (GitHub)', 'Masquer'],
    tr: ['Görüntülediğiniz sürümün tarihi:', 'En son sürüm burada', 'O zamandan beri yapılan değişiklikler (GitHub)', 'Gizle'],
    en: ['You’re viewing the version of', 'The latest version is here', 'What changed since (GitHub)', 'Hide'],
    es: ['Estás viendo la versión del', 'La última versión está acá', 'Qué cambió desde entonces (GitHub)', 'Ocultar'],
    pt: ['Você está vendo a versão de', 'A versão mais recente está aqui', 'O que mudou desde então (GitHub)', 'Ocultar'],
  };
  let el: HTMLElement | null = null;
  function banner() {
    const path = strip(L.pathname);
    const lang = /^\/(es|pt|en|de|fr|tr)(\/|$)/.exec(path)?.[1] ?? 'en';
    const [lead, latest, compare, hide] = TEXT[lang];
    let hidden = false;
    try {
      hidden = sessionStorage.getItem('stabileo-snapshot-banner') === 'hidden';
    } catch {
      /* storage blocked */
    }
    if (hidden || !document.body) return;
    if (!el) {
      el = document.createElement('div');
      el.id = 'stabileo-snapshot-banner';
      el.setAttribute('role', 'region');
      el.innerHTML =
        '<style>#stabileo-snapshot-banner{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;flex-wrap:wrap;gap:.25rem 1rem;align-items:center;justify-content:center;padding:.5rem 3.75rem .5rem 1rem;min-height:44px;box-sizing:border-box;background:#0c1620;color:#f4f7fa;border-top:2px solid #e5482a;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
        '#stabileo-snapshot-banner a{display:inline-flex;align-items:center;min-height:44px;min-width:44px;color:#ffd7cc;text-decoration:underline;text-underline-offset:2px}#stabileo-snapshot-banner a:focus-visible,#stabileo-snapshot-banner button:focus-visible{outline:2px solid #ffd7cc;outline-offset:2px}' +
        '#stabileo-snapshot-banner button{position:absolute;right:.5rem;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:4px;background:transparent;color:#f4f7fa;font-size:1.25rem;cursor:pointer}' +
        '#stabileo-snapshot-banner code{font-family:"IBM Plex Mono",ui-monospace,monospace}</style>' +
        '<span data-lead></span><span data-services></span><a data-latest></a><a data-compare rel="noopener"></a><button type="button">×</button>';
      el.querySelector('button')!.addEventListener('click', () => {
        el!.remove();
        try {
          sessionStorage.setItem('stabileo-snapshot-banner', 'hidden');
        } catch {
          /* storage blocked */
        }
      });
      document.body.appendChild(el);
    }
    const day = new Date(cfg.date).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    el.setAttribute('aria-label', lead + ' ' + day);
    el.setAttribute('lang', lang);
    el.querySelector('[data-services]')!.textContent = cfg.servicesNotice[lang];
    const leadEl = el.querySelector('[data-lead]')!;
    leadEl.textContent = lead + ' ' + day + ' (';
    const code = document.createElement('code');
    code.textContent = cfg.short;
    leadEl.append(code, ').');
    // Built here, not through add(): this one leaves the snapshot.
    const toLatest = el.querySelector('[data-latest]') as HTMLAnchorElement;
    toLatest.textContent = latest;
    toLatest.setAttribute('data-snapshot-exit', '');
    toLatest.href = L.origin.replace('://snapshots.', '://') + path + L.search + L.hash;
    const toCompare = el.querySelector('[data-compare]') as HTMLAnchorElement;
    toCompare.textContent = compare;
    toCompare.href = cfg.repo + '/compare/' + cfg.commit + '...main';
    el.querySelector('button')!.setAttribute('aria-label', hide);
  }
  window.addEventListener('popstate', banner);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner);
  else banner();
}

/**
 * Vite's half: inactive (returns no plugin) for a normal build. For a snapshot it rewrites the
 * application's `location` reads and puts the runtime in index.html.
 */
export function snapshotPlugin(s: Snapshot | null, root: string): Plugin[] {
  if (!s) return [];
  const src = resolve(root, 'src') + '/';
  return [
    {
      name: 'stabileo-snapshot',
      enforce: 'post',
      configResolved(c) {
        // The desktop app (`--mode desktop`) and the admin site are never snapshots.
        if (c.mode !== 'production') throw new Error(`a snapshot is a production build of the site, not mode ${c.mode}`);
      },
      async transform(code, id) {
        const file = id.split('?')[0];
        if (!file.startsWith(src) || !/\.(svelte|[cm]?[jt]s)$/.test(file) || /[?&](worker|type=style)/.test(id) || /\.worker\.[jt]s$/.test(file)) return null;
        if (!/\blocation\b/.test(code)) return null;
        const out = await transformWithEsbuild(code, file + '.js', {
          loader: 'js',
          format: 'esm',
          target: 'esnext',
          define: { location: '__stabileoLocation', 'window.location': '__stabileoLocation' },
          sourcemap: true,
        });
        return { code: out.code, map: out.map };
      },
      // What the host's index (/@/) and the deploy's never-overwrite check read.
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'SNAPSHOT.json',
          source: JSON.stringify({ commit: s.commit, short: s.short, prefix: `${s.prefix}/`, date: s.date, ...researchBuildMetadata(root) }, null, 2) + '\n',
        });
        this.emitFile({ type: 'asset', fileName: 'snapshot-runtime.js', source: snapshotRuntime(s) });
      },
      transformIndexHtml: {
        order: 'post',
        handler: () => [{ tag: 'script', attrs: { src: `${s.prefix}/snapshot-runtime.js` }, injectTo: 'head-prepend' }],
      },
    },
  ];
}
