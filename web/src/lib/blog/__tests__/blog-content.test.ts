/**
 * The blog's content, checked as data.
 *
 * A post is a structured object in three languages (see ../types.ts), which
 * makes two classes of defect testable that prose in a CMS would not be:
 *
 *  - A translation that lost a section. The three languages must have the same
 *    blocks in the same order, so a Portuguese post cannot quietly ship
 *    missing the case study.
 *  - A number that drifted. Every figure in this post is an output of the
 *    solver and the CIRSOC 201 module, taken from the JAIE 2026 paper. The
 *    tables are compared across languages digit for digit (allowing for the
 *    decimal comma), and the governing values are asserted literally — so
 *    "tidying" 105.6 to 105 fails here rather than being published as
 *    engineering.
 */
import { describe, it, expect } from 'vitest';
import { POSTS, findPost } from '..';
import { readingMinutes, wordCount, addTranslations, inLocale, type Block, type Localized, type PostBody } from '../types';
import { type PublicLocale, dictFor } from '../../i18n/store.svelte';
import { completeLocales } from '../../i18n/locales/all';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED = completeLocales() as PublicLocale[];
const written = (post: { i18n: Partial<Record<PublicLocale, PostBody>> }) =>
  (Object.keys(post.i18n) as PublicLocale[]).filter((l) => post.i18n[l]);

// Thousands may be grouped with a comma, a point or a (non-breaking) space depending on the
// language: "15,833", "15.833" and "15 833" are one number, while "0,976" is a decimal.
const SCREENSHOTS = fileURLToPath(new URL('../../../../public/screenshots/', import.meta.url));

function webpSize(file: string): [number, number] {
  const b = readFileSync(file);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  throw new Error(`${file}: not a WebP`);
}

function normalizeNumber(cell: string): string | null {
  const c = cell.trim();
  if (/^-?[1-9]\d{0,2}(?:[.,\s\u00a0\u202f]\d{3})+$/.test(c)) return c.replace(/[.,\s\u00a0\u202f]/g, '');
  const n = c.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(n) ? n : null;
}

/** The numbers in a table, decimal comma normalised away. */
function numericCells(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k !== 'table') continue;
    for (const row of b.rows) {
      for (const cell of row) {
        const n = normalizeNumber(cell);
        if (n !== null) out.push(n);
      }
    }
  }
  return out;
}

describe('blog posts', () => {
  it('publishes at least one post', () => {
    expect(POSTS.length).toBeGreaterThan(0);
  });

  it('lists in the curated reading order, and that order is unambiguous', () => {
    const orders = POSTS.map((p) => p.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    // Two posts sharing an order makes the index depend on array position,
    // which is exactly the accident `order` exists to remove.
    expect(new Set(orders).size).toBe(POSTS.length);
  });

  it('publishes in the same direction it is read', () => {
    // Not a hard requirement — `order` decides and dates are free to diverge
    // later — but while they do agree, a post dated before the one above it
    // is far more likely to be a typo than a decision.
    const dates = POSTS.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  for (const post of POSTS) {
    describe(post.slug, () => {
      it('has a URL-safe, unique slug and an ISO date', () => {
        expect(post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(POSTS.filter((p) => p.slug === post.slug)).toHaveLength(1);
        expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(findPost(post.slug)).toBe(post);
      });

      it('credits its authors and tags itself with keys that exist', () => {
        expect(post.authors.length).toBeGreaterThan(0);
        for (const author of post.authors) expect(author.trim()).not.toBe('');
        for (const key of post.tagKeys) {
          for (const locale of REQUIRED) {
            expect(dictFor(locale)[key], `${key} missing from ${locale}`).toBeTruthy();
          }
        }
      });

      it('is written in every complete language', () => {
        for (const locale of REQUIRED) expect(post.i18n[locale], `${locale} body missing`).toBeTruthy();
      });

      for (const locale of written(post)) {
        it(`${locale}: has a title, an excerpt and no empty block`, () => {
          const body = post.i18n[locale]!;
          expect(body, `${locale} body missing`).toBeTruthy();
          expect(body.title.trim()).not.toBe('');
          expect(body.excerpt.trim()).not.toBe('');
          expect(body.blocks.length).toBeGreaterThan(5);

          for (const b of body.blocks) {
            if (b.k === 'ul' || b.k === 'ol') {
              expect(b.items.length).toBeGreaterThan(0);
              for (const item of b.items) expect(item.trim()).not.toBe('');
            } else if (b.k === 'embed') {
              // The label is what a reader sees before deciding to load an
              // application into the page; it has to say what they are getting.
              expect(b.label.trim().length).toBeGreaterThan(30);
              expect(b.query).toMatch(/example=/);
            } else if (b.k === 'img') {
              expect(b.alt.trim().length, `${b.base}: alt`).toBeGreaterThan(30);
              expect(b.caption.trim()).not.toBe('');
            } else if (b.k === 'table') {
              expect(b.caption.trim()).not.toBe('');
              expect(b.head.length).toBeGreaterThan(1);
              expect(b.rows.length).toBeGreaterThan(0);
              for (const row of b.rows) expect(row).toHaveLength(b.head.length);
            } else if (b.k === 'photo') {
              expect(b.alt.trim().length).toBeGreaterThan(20);
              expect(b.caption.trim()).not.toBe('');
            } else {
              expect(b.t.trim()).not.toBe('');
            }
          }
        });

        it(`${locale}: reports a sane reading time`, () => {
          const minutes = readingMinutes(post.i18n[locale]!);
          expect(minutes).toBeGreaterThan(0);
          expect(minutes).toBeLessThan(60);
        });
      }

      it('has the same structure in every language', () => {
        const shape = (l: PublicLocale) =>
          post.i18n[l]!.blocks.map((b) =>
            b.k === 'ul' || b.k === 'ol'
              ? `${b.k}:${b.items.length}`
              : b.k === 'table'
                ? `table:${b.head.length}x${b.rows.length}`
                : b.k === 'embed'
                  ? `embed:${b.mode ?? 'basic'}:${b.query}`
                  : b.k === 'photo'
                    ? `photo:${b.src}:${b.w}x${b.h}`
                  : b.k === 'link'
                    ? `link:${b.slug}`
                    : b.k === 'ext'
                      ? `ext:${b.href}`
                      : b.k === 'img'
                        ? `img:${b.base}:${b.w}x${b.h}`
                        : b.k,
          );
        for (const locale of written(post)) {
          expect(shape(locale), `${locale} does not match the English structure`).toEqual(shape('en'));
        }
      });

      it('quotes the same numbers in every language', () => {
        const en = numericCells(post.i18n.en.blocks);
        expect(en.length).toBeGreaterThan(0);
        for (const locale of written(post)) {
          expect(numericCells(post.i18n[locale]!.blocks), `${locale} table numbers differ`).toEqual(en);
        }
      });

      it('links only to posts that exist, and never to itself', () => {
        // A link block whose slug resolves to nothing renders nothing — so the
        // failure has to be caught here, where it is loud, and not on the page.
        for (const locale of written(post)) {
          for (const b of post.i18n[locale]!.blocks) {
            if (b.k !== 'link') continue;
            expect(findPost(b.slug), `${locale}: no post "${b.slug}"`).toBeTruthy();
            expect(b.slug).not.toBe(post.slug);
          }
        }
      });

      it('links outside the blog only to the project\'s own repository', () => {
        // An external link is a promise about where the reader lands; the
        // only place this blog vouches for is the project's repository.
        for (const locale of written(post)) {
          for (const b of post.i18n[locale]!.blocks) {
            if (b.k !== 'ext') continue;
            expect(b.href, `${locale}: ${b.href}`).toMatch(/^https:\/\/github\.com\/lambdaclass\/stabileo\/[\w./#-]+$/);
            expect(b.label.trim()).not.toBe('');
          }
        }
      });

      it('shows at least one screenshot or photo, and every screenshot it shows is committed at the size it declares', () => {
        const images = post.i18n.en.blocks.filter((b): b is Extract<Block, { k: 'img' }> => b.k === 'img');
        expect(images.length + post.i18n.en.blocks.filter((b) => b.k === 'photo').length).toBeGreaterThan(0);
        for (const img of images) {
          for (const w of [800, 1600]) {
            for (const ext of ['avif', 'webp']) {
              expect(existsSync(`${SCREENSHOTS}${img.base}-${w}.${ext}`), `${img.base}-${w}.${ext}`).toBe(true);
            }
          }
          expect(webpSize(`${SCREENSHOTS}${img.base}-1600.webp`), img.base).toEqual([img.w, img.h]);
          expect(webpSize(`${SCREENSHOTS}${img.base}-800.webp`)[0], img.base).toBe(800);
        }
        const alts = (l: PublicLocale) => post.i18n[l]!.blocks.flatMap((b) => (b.k === 'img' ? [b.alt] : []));
        for (const locale of written(post).filter((l) => l !== 'en')) {
          alts(locale).forEach((alt, i) => expect(alt, `${locale} alt ${i} is the English one`).not.toBe(alts('en')[i]));
        }
      });

      it('shows only photos that are committed at both widths, in both formats', async () => {
        const { existsSync } = await import('node:fs');
        const { join } = await import('node:path');
        for (const b of post.i18n.en.blocks) {
          if (b.k !== 'photo') continue;
          for (const file of [`${b.src}-800.avif`, `${b.src}-800.webp`, `${b.src}-1600.avif`, `${b.src}-1600.webp`]) {
            expect(existsSync(join(__dirname, '../../../../public/photos', file)), file).toBe(true);
          }
        }
      });

      it('does not translate the slug', () => {
        // A link that changes with the reader's language is a link that breaks
        // when it is shared.
        expect(post.slug).toBe(post.slug.toLowerCase());
      });
    });
  }
});

describe('the determinism-boundary post keeps the solver’s numbers', () => {
  const post = findPost('the-determinism-boundary');

  it('exists', () => {
    expect(post).toBeTruthy();
  });

  it('quotes the portal frame exactly as the solver reported it', () => {
    // §6.1: the beam fails at 25×40 and passes at 30×55, and the DEMAND RISES
    // when the section grows — that inversion is the point of the post, so it
    // is asserted rather than left to prose.
    const nums = numericCells(post!.i18n.en.blocks);
    expect(nums.slice(0, 6)).toEqual(['80.8', '73.3', '1.10', '105.6', '108.6', '0.97']);
    expect(Number(nums[3])).toBeGreaterThan(Number(nums[0]));
  });

  it('quotes the removed column exactly as the solver reported it', () => {
    // §6.3: intact, after the column is removed, and resized.
    const nums = numericCells(post!.i18n.en.blocks);
    expect(nums.slice(6)).toEqual([
      '54.2', '125.3', '0.43',
      '203.9', '125.3', '1.63',
      '189.8', '313.7', '0.61',
    ]);
  });
});

describe('the bars-or-finite-elements post keeps the engine’s numbers', () => {
  const post = findPost('bars-or-finite-elements');
  const tables = () => post!.i18n.en.blocks.filter((b) => b.k === 'table') as Extract<Block, { k: 'table' }>[];

  it('exists', () => {
    expect(post).toBeTruthy();
  });

  it('shows a straight bar giving the closed form however it is split', () => {
    // The whole first argument: 2, 4, 10 or 50 frame elements, one number,
    // and it is 5qL⁴/384EI. A row that differs is not a rounding tweak — it
    // would mean the matrix is not exact, and the section would be false.
    const [hermite] = tables();
    const values = hermite.rows.map((r) => r[1]);
    expect(new Set(values)).toEqual(new Set(['1.5625']));
    const q = 10, L = 6, EI = 30000e3 * (0.2 * 0.6 ** 3) / 12;
    expect(((5 * q * L ** 4) / (384 * EI)) * 1000).toBeCloseTo(1.5625, 6);
  });

  it('quotes the slenderness table as the engine reported it', () => {
    const slender = tables()[1];
    expect(slender.rows.map((r) => r.slice(2, 4))).toEqual([
      ['12.500', '12.567'],
      ['1.5625', '1.5961'],
      ['0.19531', '0.21206'],
      ['0.042188', '0.052145'],
      ['0.012500', '0.019017'],
    ]);
    // The frame column is the closed form, 5qL⁴/384EI, to the digits printed.
    const q = 10, L = 6, E = 30000e3, b = 0.2;
    for (const r of slender.rows) {
      const h = Number(r[1]);
      const eb = ((5 * q * L ** 4) / (384 * E * (b * h ** 3) / 12)) * 1000;
      const decimals = r[2].split('.')[1]?.length ?? 0;
      expect(Math.abs(Number(r[2]) - eb)).toBeLessThanOrEqual(0.5 * 10 ** -decimals + 1e-12);
    }
    // The percentage column is what a calculator gives from the two columns
    // beside it. It was computed from unrounded output while those columns
    // were rounded, and four rows of five disagreed with a reader's check.
    for (const r of slender.rows) {
      const low = (1 - Number(r[2]) / Number(r[3])) * 100;
      expect(`${low.toFixed(1)} %`).toBe(r[4]);
    }
    // Bars always below shells — the post's central claim, asserted rather
    // than left to prose — and the gap widens as the beam gets deeper.
    const gaps = slender.rows.map((r) => 1 - Number(r[2]) / Number(r[3]));
    for (const g of gaps) expect(g).toBeGreaterThan(0);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  it('adds up the hand check at L/h = 3', () => {
    // Euler-Bernoulli plus Timoshenko's shear term, qL²/(8κGA) with κ = 5/6.
    // The reader is told to do this with a calculator, so the test does too.
    const q = 10, L = 6, b = 0.2, h = 2, E = 30000e3, nu = 0.2;
    const eb = (5 * q * L ** 4) / (384 * (E * b * h ** 3) / 12);
    const shear = (q * L ** 2) / (8 * (5 / 6) * (E / (2 * (1 + nu))) * b * h);
    expect((eb * 1000).toFixed(4)).toBe('0.0422');
    expect((shear * 1000).toFixed(4)).toBe('0.0108');
    expect(((eb + shear) * 1000).toFixed(4)).toBe('0.0530');
    expect(tables()[2].rows.map((r) => r[1])).toEqual(['0.0422', '0.0530', '0.0521', '0.0523']);
  });

  it('keeps each wall ratio consistent with its own displacements', () => {
    for (const row of tables()[3].rows) {
      const ratio = Number(row[3]) / Number(row[2]);
      expect(ratio.toFixed(2), row[0]).toBe(row[4].split(' ')[0]);
    }
  });
});

describe('reading time', () => {
  it('counts the linked post\u2019s title a link block renders', () => {
    const body = { title: 'One', excerpt: 'Two', blocks: [{ k: 'link', slug: 'other', t: 'Read next:' }] } as unknown as PostBody;
    expect(wordCount(body)).toBe(4);
    expect(wordCount(body, () => 'The other post')).toBe(7);
  });
});

describe('the safety-advisories post quotes the advisories', () => {
  const post = findPost('safety-advisories');

  it('exists, and lists every advisory in docs/advisories', async () => {
    expect(post).toBeTruthy();
    const { readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const ids = readdirSync(join(__dirname, '../../../../../docs/advisories'))
      .map((f) => /^(SA-\d{4}-\d{3})-/.exec(f)?.[1])
      .filter((x): x is string => !!x)
      .sort();
    const summary = post!.i18n.en.blocks.find((b) => b.k === 'table') as Extract<Block, { k: 'table' }>;
    expect(summary.rows.map((r) => r[0]).sort()).toEqual(ids);
  });

  it('known wrong result: #1782 — lists every advisory in every written language', async () => {
    const { readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const ids = readdirSync(join(__dirname, '../../../../../docs/advisories'))
      .map((f) => /^(SA-\d{4}-\d{3})-/.exec(f)?.[1])
      .filter((x): x is string => !!x)
      .sort();
    for (const locale of written(post!)) {
      const summary = post!.i18n[locale]!.blocks.find((b) => b.k === 'table') as Extract<Block, { k: 'table' }>;
      expect(summary.rows.map((r) => r[0]).sort(), `${locale}: advisory list`).toEqual(ids);
    }
  });

  it.each<[PublicLocale, string, string]>([
    ['en', 'Low', 'Fixed after 0.5.0; on stabileo.com since 9 November 2026'],
    ['es', 'Baja', 'Corregido después de 0.5.0; en stabileo.com desde el 9 de noviembre de 2026'],
    ['pt', 'Baixa', 'Corrigido depois da 0.5.0; em stabileo.com desde 9 de novembro de 2026'],
    ['de', 'Niedrig', 'Behoben nach 0.5.0; auf stabileo.com seit dem 9. November 2026'],
    ['fr', 'Faible', 'Corrigé après 0.5.0 ; sur stabileo.com depuis le 9 novembre 2026'],
    ['tr', 'Düşük', "0.5.0'dan sonra düzeltildi; 9 Kasım 2026'dan beri stabileo.com'da"],
  ])('%s: publishes SA-2026-049 through 053 as fixed and retains 053’s low severity', (locale, severity, fixedStatus) => {
    const blocks = post!.i18n[locale]!.blocks;
    const summary = blocks.find((b) => b.k === 'table') as Extract<Block, { k: 'table' }>;
    const status = blocks.find((b) => b.k === 'note') as Extract<Block, { k: 'note' }>;
    for (const number of ['049', '050', '051', '052', '053']) {
      const id = `SA-2026-${number}`;
      const row = summary.rows.find((r) => r[0] === id);
      expect(row, `${locale}: ${id} missing`).toBeDefined();
      expect(row![3], `${locale}: ${id} status`).toBe(fixedStatus);
      expect(status.t).toContain(id);
    }
    expect(summary.rows.find((r) => r[0] === 'SA-2026-053')![2]).toBe(severity);
  });

  it.skip.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Draft: fix not yet merged or deployed'],
    ['es', 'Alta', 'Borrador: corrección aún no integrada ni publicada'],
    ['pt', 'Alta', 'Rascunho: correção ainda não integrada nem publicada'],
    ['de', 'Hoch', 'Entwurf: Korrektur noch nicht zusammengeführt oder veröffentlicht'],
    ['fr', 'Élevée', 'Brouillon : correction pas encore fusionnée ni publiée'],
    ['tr', 'Yüksek', 'Taslak: düzeltme henüz birleştirilmedi veya yayınlanmadı'],
  ])('known wrong result: #1753 — %s: lists SA-2026-054 as a high-severity draft in the summary and status note', (locale, severity, draftStatus) => {
    const blocks = post!.i18n[locale]!.blocks;
    const summary = blocks.find((b) => b.k === 'table') as Extract<Block, { k: 'table' }>;
    const row = summary.rows.find((r) => r[0] === 'SA-2026-054');
    expect(row, `${locale}: linear-stiffness advisory missing`).toBeDefined();
    expect(row!.slice(2)).toEqual([severity, draftStatus]);
    const status = blocks.find((b) => b.k === 'note') as Extract<Block, { k: 'note' }>;
    expect(status.t).toContain(`SA-2026-054 — ${draftStatus}.`);
  });

  it('quotes each documented case exactly as its advisory states it', () => {
    // Correct / reported, per advisory, as each advisory's documented-case table states it
    // (docs/advisories/SA-2026-*.md).
    const cases = post!.i18n.en.blocks.filter((b) => b.k === 'table')[1] as Extract<Block, { k: 'table' }>;
    expect(cases.rows.map((r) => [r[0], r[2], r[3]])).toEqual([
      ['SA-2026-024', '65.61', '56.01'],
      ['SA-2026-023', '78.57', '101.57'],
      ['SA-2026-013', '35.0', '0'],
      ['SA-2026-014', '176.47', '424.3'],
      ['SA-2026-015', '5.18', '4.34'],
      ['SA-2026-011', '0', '-14.4'],
      ['SA-2026-017', '124', '84'],
      ['SA-2026-008', '1.00', '0.81'],
      ['SA-2026-007', '2993', '5860'],
      ['SA-2026-006', '0.92', '2.52'],
      ['SA-2026-005', '-56.67', '-41.67'],
      ['SA-2026-019', '14.04', '9.76'],
      ['SA-2026-012', '1012.5', '101250'],
      ['SA-2026-016', '-7.29', '-6.18'],
      ['SA-2026-018', '0', '101'],
      ['SA-2026-020', '158.2', '182.7'],
      ['SA-2026-009', '1.000', '1.225'],
    ]);
  });
});

describe('translations added as files', () => {
  const item = () => ({ slug: 'a-post', i18n: { en: { title: 'en' }, es: { title: 'es' }, pt: { title: 'pt' } } as Localized<{ title: string }> });

  it('attach to the item their file names', () => {
    const post = item();
    addTranslations([post], (p) => p.slug, { './translations/de/a-post.ts': { title: 'de' } });
    expect(inLocale(post.i18n, 'de').title).toBe('de');
    expect(inLocale(post.i18n, 'fr').title).toBe('en');
  });

  it('refuse a file that names nothing', () => {
    expect(() => addTranslations([item()], (p) => p.slug, { './translations/de/no-such-post.ts': { title: 'de' } })).toThrow();
  });
});
