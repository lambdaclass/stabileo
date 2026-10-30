/**
 * Renders the 1200x630 social-preview card at public/og/stabileo-social.png.
 *
 * Usage:
 *   npm run dev -- --port 4001 --strictPort     # in another terminal, serves the fonts
 *   npx tsx scripts/make-og-card.ts
 *   npx tsx scripts/make-og-card.ts --base http://127.0.0.1:5173
 *
 * The card is generated rather than hand-drawn so it stays in step with the
 * landing: it uses the same ink/vermillion palette, the same self-hosted
 * typefaces, and the same solved truss dataset the hero animates (load at
 * midspan, tension red, compression blue). Nothing on it is a claim that is not
 * already verified on the page itself — no numbers, no screenshots, no pricing.
 *
 * Output is PNG because that is what every crawler accepts. Optimise it after
 * generating; an image encoder must not become a dependency of this app:
 *
 *   npx --yes sharp-cli -i public/og/stabileo-social.png -o public/og \
 *     -- png --quality 90 --compressionLevel 9 --palette
 *
 * Port 4000 belongs to another workstream's dev server and is refused here.
 */
import { chromium } from 'playwright';
import { NODES, MEMBERS, FORCES, DECK, FORCE_MAX, FORCE_EPS } from '../src/components/landing/truss-data.ts';

const FORBIDDEN_PORT = '4000';
const DEFAULT_BASE = 'http://127.0.0.1:4001';

function resolveBase(): string {
  const i = process.argv.indexOf('--base');
  const raw = (i !== -1 ? process.argv[i + 1] : undefined) ?? process.env.STABILEO_SCREENSHOT_BASE ?? DEFAULT_BASE;
  const url = new URL(raw);
  if (url.port === FORBIDDEN_PORT) {
    throw new Error(`Refusing port ${FORBIDDEN_PORT}: reserved for another workstream's dev server.`);
  }
  return url.origin;
}

const BASE = resolveBase();
const OUT = 'public/og/stabileo-social.png';

const INK = '#0c1620';
const PAPER = '#f4f7fa';
const ACCENT = '#e5482a';
const BLUE = '#2c6cb4';
const SLATE = '#8fa3b3';

/** Load at midspan — the symmetric, most legible frame of the hero animation. */
const CASE = Math.floor((DECK.length - 1) / 2);

function trussSvg(): string {
  const byId = new Map(NODES.map((n, i) => [n.id, i]));
  const parts: string[] = [];
  MEMBERS.forEach((m, k) => {
    const a = NODES[byId.get(m.a)!];
    const b = NODES[byId.get(m.b)!];
    const f = FORCES[CASE][k];
    const mag = Math.abs(f) / FORCE_MAX;
    const stroke = Math.abs(f) < FORCE_EPS ? SLATE : f > 0 ? ACCENT : BLUE;
    const op = Math.abs(f) < FORCE_EPS ? 0.45 : 0.5 + 0.5 * mag;
    const wdt = (Math.abs(f) < FORCE_EPS ? 1.6 : 2.2 + 2.6 * mag) + (m.kind === 'bottom' ? 1.2 : 0);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${wdt.toFixed(2)}" stroke-opacity="${op.toFixed(2)}" stroke-linecap="round"/>`);
  });
  for (const n of NODES) parts.push(`<circle cx="${n.x}" cy="${n.y}" r="3" fill="${PAPER}"/>`);
  for (const id of [DECK[0], DECK[DECK.length - 1]]) {
    const n = NODES[byId.get(id)!];
    parts.push(`<path d="M${n.x} ${n.y} l-10 17 h20 z" fill="none" stroke="${SLATE}" stroke-width="1.6"/>`);
    parts.push(`<line x1="${n.x - 15}" y1="${n.y + 17}" x2="${n.x + 15}" y2="${n.y + 17}" stroke="${SLATE}" stroke-width="1.6"/>`);
  }
  return `<svg viewBox="16 14 528 152" width="520" height="150" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

const html = `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family:'Space Grotesk'; src:url('${BASE}/fonts/space-grotesk.woff2') format('woff2'); font-weight:700; }
  @font-face { font-family:'IBM Plex Sans'; src:url('${BASE}/fonts/ibm-plex-sans.woff2') format('woff2'); font-weight:400; }
  @font-face { font-family:'IBM Plex Mono'; src:url('${BASE}/fonts/ibm-plex-mono-500.woff2') format('woff2'); font-weight:500; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; background:${INK}; color:${PAPER};
         font-family:'IBM Plex Sans',sans-serif; overflow:hidden; }
  .card { width:1200px; height:630px; padding:72px 80px; display:flex; flex-direction:column;
          position:relative; }
  .copy { max-width:640px; }
  .eyebrow { display:flex; align-items:center; gap:16px; font-family:'IBM Plex Mono',monospace;
             font-size:19px; letter-spacing:.17em; text-transform:uppercase; color:${ACCENT}; }
  .rule { width:52px; height:3px; background:${ACCENT}; }
  h1 { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:68px; line-height:1.03;
       letter-spacing:-.032em; margin-top:24px; }
  .sub { margin-top:20px; font-size:25px; line-height:1.45; color:${SLATE}; max-width:30ch; }
  /* lower-right quadrant, clear of the copy column and the footer rule */
  .fig { position:absolute; right:76px; bottom:128px; opacity:.96; }
  .foot { margin-top:auto; display:flex; align-items:center; gap:22px;
          font-family:'IBM Plex Mono',monospace; font-size:20px; letter-spacing:.11em; color:${SLATE}; }
  .mark { display:flex; align-items:center; gap:13px; }
  .logo { width:38px; height:38px; border-radius:5px; background:${ACCENT}; color:#fff;
          font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:24px;
          display:grid; place-items:center; }
  .name { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:29px; color:${PAPER};
          letter-spacing:-.015em; }
  .dot { color:${ACCENT}; }
</style>
<div class="card">
  <div class="copy">
    <p class="eyebrow"><span class="rule"></span>STRUCTURAL ANALYSIS &middot; IN THE BROWSER</p>
    <h1>Structural analysis,<br>in a browser tab.</h1>
    <p class="sub">Free and open source. The solver runs on your machine.</p>
  </div>
  <div class="fig">${trussSvg()}</div>
  <div class="foot">
    <span class="mark"><span class="logo">S</span><span class="name">Stabileo</span></span>
    <span class="dot">&middot;</span><span>STABILEO.COM</span>
    <span class="dot">&middot;</span><span>AGPL-3.0</span>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`wrote ${OUT} (1200x630) using the truss solution for a load at ${DECK[CASE]}`);
