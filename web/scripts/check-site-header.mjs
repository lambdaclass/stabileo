// One header for every public page: components/site/SiteHeader.svelte. Fails if another
// component renders the site's top nav (its class, its landmark label) or imports a retired one.
//   node scripts/check-site-header.mjs [dir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? new URL('../src', import.meta.url).pathname;
const ALLOWED = 'components/site/SiteHeader.svelte';
const PATTERNS = [/<nav[^>]*class="nav[\s"]/, /class="nav-links"/, /landing\.navPrimary/, /\b(LandingNav|BlogNav)\b/];
const bad = [];
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '__tests__') walk(p);
    } else if (p.endsWith('.svelte')) {
      const rel = relative(root, p);
      if (rel === ALLOWED) continue;
      const src = readFileSync(p, 'utf8');
      for (const re of PATTERNS) if (re.test(src)) bad.push(`${rel}: ${re}`);
    }
  }
}
walk(root);
if (bad.length) {
  console.error('A component other than SiteHeader renders the site header:\n' + bad.join('\n'));
  process.exit(1);
}
console.log('site header: one implementation');
