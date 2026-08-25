/**
 * The built site must not carry anything that only exists on a developer's
 * machine.
 *
 * ── The defect ──
 *
 * index.html swapped in the yellow development favicon with an inline script
 * that checked `location.hostname`. The script was correct. It still shipped
 * the wrong icon to everybody, because scripts/prerender.ts drives the built
 * site in a headless browser served from localhost: the swap fired, and the
 * capture of `document.head` happened after it. Nineteen pages went out
 * declaring `/favicon-dev.svg`, and it sat in the tab on stabileo.com until
 * somebody noticed by eye.
 *
 * ── Why this is not an e2e test ──
 *
 * It was one, and driving a browser over seven pages to read seven strings
 * cost seven contexts. CI answered with `browser.newContext: Test ended` and
 * took two unrelated @smoke specs down with it — the known wedge documented
 * in .github/workflows/ci.yml. The property being asserted is a property of
 * the files, so it is read from the files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const describeBuilt = existsSync(join(DIST, 'index.html')) ? describe : describe.skip;

function htmlFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, out);
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

describeBuilt('the build carries nothing that is local-only', () => {
  it('finds the pages to check', () => {
    expect(htmlFiles(DIST).length).toBeGreaterThan(10);
  });

  for (const needle of ['favicon-dev', 'localhost', '127.0.0.1']) {
    it(`no page mentions "${needle}"`, () => {
      const guilty = htmlFiles(DIST).filter((f) => readFileSync(f, 'utf8').includes(needle));
      expect(guilty, `these pages leak "${needle}":\n${guilty.join('\n')}`).toEqual([]);
    });
  }

  it('every page names the production icon', () => {
    const wrong = htmlFiles(DIST).filter((f) => {
      const href = readFileSync(f, 'utf8').match(/<link rel="icon"[^>]*href="([^"]+)"/)?.[1];
      // 404.html carries no icon of its own; every rendered page must.
      return href !== undefined && href !== '/favicon.svg';
    });
    expect(wrong).toEqual([]);
  });
});
