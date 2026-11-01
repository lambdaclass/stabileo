// Render the gallery thumbnail of a research experiment from our own run, through the page's
// viewer, and write it to public/research-thumbs/<id>.webp (640 x 400), to be committed.
// The page is opened with the experiment's `thumbnailQuery` (experiments.ts).
//
//   node scripts/research-thumbs.mjs <paperId> [--base http://127.0.0.1:4790]
//
// Needs a running build of the site with the research bundles (make research.wasm, then
// npm run build and vite preview).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
const baseIdx = process.argv.indexOf('--base');
const base = baseIdx > 0 ? process.argv[baseIdx + 1] : 'http://127.0.0.1:4790';
if (!id) {
  console.error('usage: research-thumbs.mjs <paperId> [--base URL]');
  process.exit(2);
}
const src = readFileSync(join(web, 'src/components/research/experiments.ts'), 'utf8');
const block = src.split(/\n  \{\n/).find((b) => b.includes(`paperId: '${id}'`));
const path = block?.match(/path: '([^']+)'/)?.[1];
const file = block?.match(/thumbnail: '([^']+)'/)?.[1];
const query = block?.match(/thumbnailQuery: '([^']+)'/)?.[1] ?? '';
if (!path || !file) {
  console.error(`no experiment ${id} with a path and a thumbnail in experiments.ts`);
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto(`${base}/en${path}/?${query}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.sfv-canvas canvas', { timeout: 60000 });
await page.waitForTimeout(2500);
const dataUrl = await page.evaluate(() => {
  const c = document.querySelector('.sfv-canvas canvas');
  const out = document.createElement('canvas');
  out.width = 640;
  out.height = 400;
  const g = out.getContext('2d');
  g.fillStyle = '#0c1620';
  g.fillRect(0, 0, 640, 400);
  const s = Math.max(640 / c.width, 400 / c.height);
  g.drawImage(c, (640 - c.width * s) / 2, (400 - c.height * s) / 2, c.width * s, c.height * s);
  return out.toDataURL('image/webp', 0.85);
});
await browser.close();
const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
const out = join(web, 'public', file);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`${file}: ${bytes.length} bytes`);
