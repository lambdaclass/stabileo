/**
 * H1-A — the audit harness. It MEASURES; it does not assert.
 *
 * The point of a separate phase is to stop guessing which of the viewer's differences from the
 * rest of PRO are defects and which are just a different look. So this walks four screens in
 * three languages at two widths and prints structural facts: horizontal overflow, heading
 * sequence, controls with no accessible name, small text under AA, and the chrome each surface
 * paints itself with — font, radius, surface, hairline.
 *
 * It is `@audit`-tagged and excluded from nothing, because it cannot fail on a finding. What it
 * finds becomes assertions in H1-B..E, in the files those phases touch.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.env.H1A_OUT ?? 'e2e/.artifacts/h1a';

/** Everything the audit reads off one subtree, computed in the page. */
const PROBE = `(rootSel) => {
  const root = document.querySelector(rootSel);
  if (!root) return { missing: rootSel };

  const lum = (c) => {
    const m = c.match(/\\d+(\\.\\d+)?/g); if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map(Number);
    const f = [r, g, b].map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  /** The first ancestor with a non-transparent background — what the text actually sits on. */
  const groundOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const a = bg.match(/rgba?\\([^)]*?([\\d.]+)\\)/);
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && (!a || Number(a[1]) > 0.5)) return bg;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const ratio = (fg, bg) => {
    const [a, b] = [lum(fg), lum(bg)];
    if (a === null || b === null) return null;
    const [x, y] = a > b ? [a, b] : [b, a];
    return (x + 0.05) / (y + 0.05);
  };

  const all = [root, ...root.querySelectorAll('*')];

  // ── horizontal overflow, excluding elements whose job is to scroll ──
  const overflow = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    // \`.sr-only\` is clipped ON PURPOSE and an SVG child's scrollWidth means nothing. The first
    // version of this reported both and made twelve findings out of zero.
    if (el.closest('.sr-only') || el.classList.contains('sr-only')) continue;
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      overflow.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().split(' ')[0],
        testid: el.getAttribute('data-testid'),
        by: el.scrollWidth - el.clientWidth,
      });
    }
  }

  // ── heading sequence: a jump is a hierarchy defect ──
  const headings = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || '').trim().slice(0, 40) }));
  const jumps = [];
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) {
      jumps.push(\`h\${headings[i - 1].level} → h\${headings[i].level} at "\${headings[i].text}"\`);
    }
  }

  // ── controls a screen reader cannot name ──
  /**
   * The accessible name, near enough to the real algorithm to stop lying.
   *
   * The first version read only aria-label / title / textContent OF THE CONTROL, and reported
   * twenty-five unnamed inputs. Every one of them was a checkbox, radio or range inside a
   * \`<label>\` carrying visible text — named, correctly, by the wrapper. Sources, in order:
   * aria-labelledby, aria-label, a wrapping label, label[for], title, own text, and for an
   * <input> its placeholder or value.
   */
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\\s+/).map((id) => document.getElementById(id))
        .filter(Boolean).map((n) => n.textContent.trim()).join(' ').trim();
      if (t) return t;
    }
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const wrapping = el.closest('label');
    if (wrapping) {
      const t = wrapping.textContent.trim();
      if (t) return t;
    }
    if (el.id) {
      const forEl = document.querySelector('label[for="' + el.id + '"]');
      if (forEl && forEl.textContent.trim()) return forEl.textContent.trim();
    }
    const title = (el.getAttribute('title') || '').trim();
    if (title) return title;
    const own = (el.textContent || '').trim();
    if (own) return own;
    return (el.getAttribute('placeholder') || el.getAttribute('value') || '').trim();
  };

  const unnamed = [];
  for (const el of root.querySelectorAll('button,a[href],select,input,[role="tab"],[role="button"]')) {
    if (el.type === 'hidden') continue;
    const name = nameOf(el);
    if (!name) {
      unnamed.push({
        tag: el.tagName.toLowerCase(), testid: el.getAttribute('data-testid'),
        cls: (el.className || '').toString().split(' ')[0],
      });
    }
  }

  // ── small text under AA ──
  const lowContrast = [];
  for (const el of all) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;  // SVG text, again
    if (!el.childNodes.length) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const r = ratio(cs.color, groundOf(el));
    if (r !== null && r < (large ? 3 : 4.5)) {
      lowContrast.push({
        cls: (el.className || '').toString().split(' ')[0],
        testid: el.getAttribute('data-testid'),
        px: Math.round(px * 10) / 10, ratio: Math.round(r * 100) / 100,
        // The pair, so a finding is actionable without a second run.
        fg: cs.color, ground: groundOf(el),
        text: (el.textContent || '').trim().slice(0, 32),
      });
    }
  }

  // ── the chrome this surface paints itself with ──
  const tally = (fn) => {
    const m = {};
    for (const el of all) { const v = fn(getComputedStyle(el)); if (v) m[v] = (m[v] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  };

  return {
    box: { scroll: root.scrollWidth, client: root.clientWidth },
    nodes: all.length,
    overflow: overflow.slice(0, 12),
    headings: headings.map((h) => \`h\${h.level} \${h.text}\`),
    headingJumps: jumps,
    unnamed: unnamed.slice(0, 12),
    lowContrast: lowContrast.slice(0, 12),
    fonts: tally((cs) => cs.fontFamily.split(',')[0].replace(/["']/g, '')),
    radii: tally((cs) => (cs.borderRadius !== '0px' ? cs.borderRadius : null)),
    fontSizes: tally((cs) => cs.fontSize),
  };
}`;

const probe = (page: Page, sel: string) =>
  page.evaluate(new Function('return ' + PROBE)() as never, sel);

/* ── the four routes ─────────────────────────────────────────────── */

async function toDesignStage(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
}

async function toDetailing(page: Page) {
  await toDesignStage(page);
  const d = page.getByTestId('detailing-disclosure');
  if (await d.count() && await d.getAttribute('open') === null) {
    await d.locator('> summary').click();
  }
  const generate = page.getByTestId('cmd-generate-detailing');
  if (await generate.count() && await generate.isEnabled()) {
    await generate.click();
    await expect
      .poll(() => page.evaluate(() =>
        (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
          .detailingAssemblies().length), { timeout: 60_000 })
      .toBeGreaterThan(0);
  }
}

async function toDocuments(page: Page) {
  await toDetailing(page);
  await openDocumentsStage(page);
}

async function toWorkspace(page: Page) {
  await toDocuments(page);
  const before = await page.evaluate(() =>
    (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds());
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() =>
      (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
      { timeout: 120_000 })
    .toBeGreaterThan(before);
}

const SCREENS = [
  { id: 'design', sel: '[data-testid="pro-panel"], .pro-panel', go: toDesignStage },
  { id: 'detailing', sel: '[data-testid="detailing-workflow"]', go: toDetailing },
  // `documents-stage`, not `.documents`. The first version named a testid that does not exist
  // and fell through to `.documents`, which is ONE card inside the stage — 8 nodes measured
  // against the stage's real tree, so that screen was reported clean without being looked at.
  { id: 'documents', sel: '[data-testid="documents-stage"]', go: toDocuments },
  { id: 'workspace', sel: '[data-testid="rebar-workspace"]', go: toWorkspace },
] as const;

function save(name: string, data: unknown) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
}

for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@audit ${locale} at 1280×720`, () => {
    test.slow();
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    for (const screen of SCREENS) {
      test(`${screen.id}`, async ({ pro: page }) => {
        await screen.go(page);
        const r = await probe(page, screen.sel);
        save(`${locale}-1280-${screen.id}`, r);
        console.log(`H1A ${locale} 1280 ${screen.id} ${JSON.stringify(r)}`);
      });
    }
  });
}

/** The narrow case, one language. 1024 is the width the PRO rail is tightest at in practice. */
test.describe('@audit es at 1024×700', () => {
  test.slow();
  test.use({ appLocale: 'es', viewport: { width: 1024, height: 700 } });

  for (const screen of SCREENS) {
    test(`${screen.id} narrow`, async ({ pro: page }) => {
      await screen.go(page);
      const r = await probe(page, screen.sel);
      save(`es-1024-${screen.id}`, r);
      console.log(`H1A es 1024 ${screen.id} ${JSON.stringify(r)}`);
    });
  }
});
