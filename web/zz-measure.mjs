import { chromium } from '@playwright/test';

const base = process.argv[2];
const label = process.argv[3] ?? base;
const throttle = process.argv.includes('--throttle');
const only = process.env.ROUTES?.split(',');
const routes = only ?? [
  '/en/', '/en/blog/', '/en/research/',
  '/en/research/benchmarks/lee-frame-1968/',
  '/en/research/optimization/andreassen-2011/',
  '/en/tools/', '/en/tools/simply-supported-beam/',
];
const viewports = process.env.VP === 'mobile' ? [[390, 844]] : process.env.VP === 'desktop' ? [[1440, 900]] : [[1440, 900], [390, 844]];

function category(url, type) {
  if (/research-wasm|\/research\/.*\.wasm/.test(url)) return 'researchWasm';
  if (/\.wasm(\?|$)/.test(url)) return 'wasm';
  if (/replay|\.bin(\?|$)|\.json(\.gz)?(\?|$)/.test(url)) return 'data';
  if (/\.woff2?(\?|$)/.test(url) || type === 'Font') return 'font';
  if (/\.(png|jpe?g|webp|avif|svg)(\?|$)/.test(url) || type === 'Image') return 'image';
  if (/\.css(\?|$)/.test(url) || type === 'Stylesheet') return 'css';
  if (/\.m?js(\?|$)/.test(url) || type === 'Script') return 'js';
  return 'other';
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const out = [];
for (const [w, h] of viewports) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, deviceScaleFactor: w < 500 ? 3 : 1 });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    const reqs = new Map();
    const bytes = {};
    const big = [];
    cdp.on('Network.responseReceived', e => reqs.set(e.requestId, { url: e.response.url, type: e.type }));
    cdp.on('Network.loadingFinished', e => {
      const r = reqs.get(e.requestId); if (!r) return;
      const c = category(r.url, r.type);
      bytes[c] = (bytes[c] ?? 0) + e.encodedDataLength;
      bytes.total = (bytes.total ?? 0) + e.encodedDataLength;
      big.push([e.encodedDataLength, r.url.replace(base, '')]);
    });
    await page.addInitScript(() => {
      const s = { t0: performance.now(), samples: [] };
      window.__probe = s;
      const tick = () => {
        const l = document.querySelector('#app .landing');
        s.samples.push([Math.round(performance.now()), Math.round(window.scrollY), l ? Math.round(l.scrollTop) : -1, (document.scrollingElement?.scrollTop ?? 0) | 0]);
      };
      setInterval(tick, 100);
      const origSIV = Element.prototype.scrollIntoView;
      s.calls = [];
      Element.prototype.scrollIntoView = function (...a) { s.calls.push(['scrollIntoView', this.tagName + '.' + this.className, new Error().stack.split('\n').slice(2, 5).join(' | ')]); return origSIV.apply(this, a); };
      const origFocus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function (...a) { s.calls.push(['focus', this.tagName + '.' + this.className, JSON.stringify(a), new Error().stack.split('\n').slice(2, 5).join(' | ')]); return origFocus.apply(this, a); };
      const origScrollTo = Element.prototype.scrollTo;
      Element.prototype.scrollTo = function (...a) { s.calls.push(['el.scrollTo', this.tagName + '.' + this.className, JSON.stringify(a)]); return origScrollTo.apply(this, a); };
      new PerformanceObserver(l => { for (const e of l.getEntries()) s.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const t0 = Date.now();
    await page.goto(base + route, { waitUntil: 'commit' });
    let h1 = null, canvas = null;
    try { await page.locator('#app .landing h1').first().waitFor({ state: 'visible', timeout: 30000 }); h1 = Date.now() - t0; } catch {}
    if (route.includes('/research/') && route !== '/en/research/' || route.includes('/tools/') && route !== '/en/tools/') {
      try { await page.locator('#app canvas').first().waitFor({ state: 'visible', timeout: 30000 }); canvas = Date.now() - t0; } catch {}
    }
    await page.waitForTimeout(6000);
    const res = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
      const pick = sel => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return `${s.fontSize}/${s.lineHeight}/${s.fontFamily.split(',')[0]}/${s.fontWeight}`; };
      const hdr = document.querySelector('#app .site-header, #app nav.nav');
      return {
        fcp: Math.round(fcp ?? -1), lcp: window.__probe.lcp,
        nav: pick('#app .site-header .nav-link') , navName: pick('#app .site-header .nav-name'), navH: hdr?.getBoundingClientRect().height,
        samples: window.__probe.samples, calls: window.__probe.calls,
        scrollH: document.querySelector('#app .landing')?.scrollHeight, docH: document.documentElement.scrollHeight,
      };
    });
    const maxScroll = Math.max(...res.samples.map(s => Math.max(s[1], s[2], s[3])));
    big.sort((a, b) => b[0] - a[0]);
    const rec = { label, vp: `${w}x${h}`, route, h1, canvas, fcp: res.fcp, lcp: res.lcp, kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), top: big.slice(0, 5).map(([b, u]) => `${Math.round(b / 1024)}K ${u.slice(0, 90)}`), nav: res.nav, navName: res.navName, navH: res.navH, maxScroll, scrolled: res.samples.filter(s => s[1] || s[2] > 0 || s[3]).slice(0, 4), calls: res.calls.slice(0, 8), scrollH: res.scrollH, docH: res.docH };
    console.log(JSON.stringify(rec));
    out.push(rec);
    await ctx.close();
  }
}
await browser.close();
