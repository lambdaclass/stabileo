import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import katex from 'katex';
import { PAPER, BODY, REFERENCES, PDF_HREF, ORIGINAL_PDF_HREF, type PaperBlock } from '../jaie-2026';
import { paperLatex } from '../latex';
import { segments } from '../inline';

const PUBLIC = resolve(__dirname, '../../../../public');
const of = <K extends PaperBlock['k']>(k: K) => BODY.filter((b): b is Extract<PaperBlock, { k: K }> => b.k === k);
const texts = (): string[] =>
  BODY.flatMap((b) =>
    b.k === 'p' || b.k === 'h1' || b.k === 'h2' ? [b.t]
    : b.k === 'ol' ? b.items
    : b.k === 'table' ? [b.caption, ...b.head, ...b.rows.flat()]
    : b.k === 'figure' ? [b.caption]
    : [],
  );

describe('the JAIE 2026 paper, in English', () => {
  it('has sections 1 to 9 in order, each subsection under its section', () => {
    expect(of('h1').map((h) => h.n)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    let section = '';
    for (const b of BODY) {
      if (b.k === 'h1') section = b.n;
      if (b.k === 'h2') expect(b.n.startsWith(`${section}.`), b.n).toBe(true);
    }
  });

  it('numbers its equations, tables and figures 1 to 4 and refers to each one', () => {
    for (const k of ['eq', 'table', 'figure'] as const) expect(of(k).map((b) => b.n), k).toEqual([1, 2, 3, 4]);
    const prose = texts().join(' ');
    for (const n of [1, 2, 3, 4]) {
      expect(prose, `Table ${n}`).toMatch(new RegExp(`Table ${n}\\b`));
      expect(prose, `Figure ${n}`).toMatch(new RegExp(`Figure ${n}\\b`));
    }
  });

  it('cites every reference, and only references that exist', () => {
    const cited = new Set(texts().flatMap((t) => segments(t).flatMap((s) => (s.k === 'cite' ? s.n : []))));
    expect([...cited].sort((a, b) => a - b)).toEqual(REFERENCES.map((_, i) => i + 1));
  });

  it('leaves no inline markup unbalanced and every formula renders in KaTeX', () => {
    for (const t of texts()) {
      const plain = segments(t).filter((s) => s.k === 'text').map((s) => (s as { t: string }).t).join('');
      expect(plain, t.slice(0, 60)).not.toMatch(/[$*]|\[\^/);
      for (const s of segments(t)) if (s.k === 'math') expect(() => katex.renderToString(s.tex, { throwOnError: true }), s.tex).not.toThrow();
    }
    for (const e of of('eq')) expect(() => katex.renderToString(e.tex, { displayMode: true, throwOnError: true }), e.tex).not.toThrow();
  });

  it('keeps every table rectangular and every figure and the PDF in public/', () => {
    for (const t of of('table')) for (const row of t.rows) expect(row.length, `Tabla ${t.n}`).toBe(t.head.length);
    for (const f of of('figure')) expect(existsSync(resolve(PUBLIC, f.src.slice(1))), f.src).toBe(true);
    for (const pdf of [PDF_HREF, ORIGINAL_PDF_HREF]) expect(existsSync(resolve(PUBLIC, pdf.slice(1))), pdf).toBe(true);
  });

  it('carries the front matter: four authors with their affiliations, keywords and both abstracts', () => {
    expect(PAPER.authors).toHaveLength(4);
    const marks = new Set(PAPER.affiliations.map(([m]) => m));
    for (const a of PAPER.authors) for (const m of a.marks.split(',')) expect(marks.has(m), a.name).toBe(true);
    expect(PAPER.keywords.split(', ')).toHaveLength(4);
    expect(PAPER.abstract.length).toBeGreaterThan(800);
  });

  it('writes numbers the English way: no decimal commas left from the Spanish', () => {
    const plain = texts().flatMap((t) => segments(t).filter((x) => x.k === 'text').map((x) => (x as { t: string }).t));
    for (const t of plain) expect(t, t.slice(0, 60)).not.toMatch(/\d,\d{1,2}(?!\d)/);
  });

  it('has its PDF typeset from the current text (run `make paper.pdf` after changing it)', () => {
    expect(readFileSync(resolve(__dirname, '../jaie-2026.tex'), 'utf8')).toBe(paperLatex());
  });
});
