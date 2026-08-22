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
import { readingMinutes, type Block } from '../types';
import { PUBLIC_LOCALES, dictFor } from '../../i18n/store.svelte';

const LOCALES = PUBLIC_LOCALES;

/** The numbers in a table, decimal comma normalised away. */
function numericCells(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k !== 'table') continue;
    for (const row of b.rows) {
      for (const cell of row) {
        const n = cell.replace(',', '.');
        if (/^-?\d+(\.\d+)?$/.test(n)) out.push(n);
      }
    }
  }
  return out;
}

describe('blog posts', () => {
  it('publishes at least one post', () => {
    expect(POSTS.length).toBeGreaterThan(0);
  });

  it('lists newest first', () => {
    const dates = POSTS.map((p) => p.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
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
          for (const locale of LOCALES) {
            expect(dictFor(locale)[key], `${key} missing from ${locale}`).toBeTruthy();
          }
        }
      });

      for (const locale of LOCALES) {
        it(`${locale}: has a title, an excerpt and no empty block`, () => {
          const body = post.i18n[locale];
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
            } else if (b.k === 'table') {
              expect(b.caption.trim()).not.toBe('');
              expect(b.head.length).toBeGreaterThan(1);
              expect(b.rows.length).toBeGreaterThan(0);
              for (const row of b.rows) expect(row).toHaveLength(b.head.length);
            } else {
              expect(b.t.trim()).not.toBe('');
            }
          }
        });

        it(`${locale}: reports a sane reading time`, () => {
          const minutes = readingMinutes(post.i18n[locale]);
          expect(minutes).toBeGreaterThan(0);
          expect(minutes).toBeLessThan(60);
        });
      }

      it('has the same structure in every language', () => {
        const shape = (l: (typeof LOCALES)[number]) =>
          post.i18n[l].blocks.map((b) =>
            b.k === 'ul' || b.k === 'ol'
              ? `${b.k}:${b.items.length}`
              : b.k === 'table'
                ? `table:${b.head.length}x${b.rows.length}`
                : b.k === 'embed'
                  ? `embed:${b.query}`
                  : b.k,
          );
        for (const locale of LOCALES) {
          expect(shape(locale), `${locale} does not match the English structure`).toEqual(shape('en'));
        }
      });

      it('quotes the same numbers in every language', () => {
        const en = numericCells(post.i18n.en.blocks);
        expect(en.length).toBeGreaterThan(0);
        for (const locale of LOCALES) {
          expect(numericCells(post.i18n[locale].blocks), `${locale} table numbers differ`).toEqual(en);
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
