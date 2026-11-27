import { describe, it, expect } from 'vitest';
import { buildIndex, fold, search, typoDistance, type SearchDoc } from '../search';

const doc = (id: string, fields: SearchDoc['fields'], secondary = false): SearchDoc<string> => ({ id, fields, secondary, item: id });

const DOCS = [
  doc('pdelta', { title: ['P-Δ (2.º orden)', 'P-Δ (2nd order)'], description: ['Equilibrio sobre la estructura deformada'], keywords: ['pdelta', 'segundo orden'] }),
  doc('buckling', { title: ['Pcr (Euler)'], description: ['Carga crítica de pandeo', 'Critical buckling load'], keywords: ['pandeo', 'buckling'] }),
  doc('stress', { title: ['Análisis de sección', 'Section analysis'], description: ['Tensiones σ y τ en un punto'], keywords: ['Navier'] }),
  doc('flex', { title: ['Calculadora de hormigón armado', 'Reinforced concrete calculator'], description: ['Flexión según CIRSOC 201'], keywords: ['φMn'] }),
  doc('so-buckling-phi', { title: ['Pandeo por conteo de modos (φ)', 'Buckling by mode count (φ)'] }, true),
  doc('so-pdelta-phi', { title: ['Segundo orden con funciones φ', 'Second order with φ functions'] }, true),
  doc('influence', { title: ['Línea de influencia', 'Influence line'], description: ['Müller-Breslau'] }),
];
const index = buildIndex(DOCS);
const ids = (q: string) => search(index, q).map((h) => h.doc.id);

describe('fold', () => {
  it('spells Greek letters out and drops accents, case and punctuation', () => {
    expect(fold('P-Δ (2.º orden)')).toBe('p delta 2 o orden');
    expect(fold('Flexión φMn')).toBe('flexion phi mn');
    expect(fold('λ₁ = σ²')).toBe('lambda 1 sigma 2');
    expect(fold('Müller-Breslau')).toBe('muller breslau');
  });
});

describe('typoDistance', () => {
  it('counts a swap of neighbours as one edit', () => {
    expect(typoDistance('pandoe', 'pandeo', 1)).toBe(1);
    expect(typoDistance('influnce', 'influence', 2)).toBe(1);
    expect(typoDistance('abc', 'xyz', 1)).toBeGreaterThan(1);
  });
});

describe('search', () => {
  it('finds φ by its name and its Spanish spelling', () => {
    for (const q of ['phi', 'fi', 'φ', 'PHI']) {
      const found = ids(q);
      expect(found, q).toContain('so-buckling-phi');
      expect(found, q).toContain('so-pdelta-phi');
      expect(found, q).toContain('flex');
    }
  });

  it('reads P-Δ however it is typed', () => {
    for (const q of ['pdelta', 'p-delta', 'P-Δ', 'p delta', 'p-∆']) expect(ids(q)[0], q).toBe('pdelta');
  });

  it('a one-letter alias matches only a word that is that letter, so delta does not list every "de"', () => {
    expect(ids('delta')).toEqual(['pdelta']);
  });

  it('matches second order in several spellings', () => {
    for (const q of ['segundo orden', '2do orden', 'second order', '2nd order']) expect(ids(q), q).toContain('pdelta');
  });

  it('ignores accents and case', () => {
    expect(ids('ANALISIS DE SECCION')[0]).toBe('stress');
    expect(ids('flexion')).toContain('flex');
    expect(ids('muller')).toContain('influence');
  });

  it('finds the English words while the panel speaks another language', () => {
    expect(ids('buckling')[0]).toBe('buckling');
    expect(ids('concrete')).toEqual(['flex']);
  });

  it('matches two Han characters inside a keyword', () => {
    const index = buildIndex([doc('moving', { keywords: ['移动荷载'] })]);
    expect(search(index, '荷载').map(h => h.doc.id)).toEqual(['moving']);
    expect(search(index, '荷')).toEqual([]);
  });

  it('matches the start of a word', () => {
    expect(ids('pand')[0]).toBe('buckling');
    expect(ids('influ')).toContain('influence');
  });

  it('forgives a small typo', () => {
    expect(ids('pandoe')).toContain('buckling');
    expect(ids('influnce')).toContain('influence');
  });

  it('ranks a title match over a description match, and a function over its method', () => {
    expect(ids('pandeo')[0]).toBe('buckling');
    expect(ids('pandeo')).toContain('so-buckling-phi');
    expect(ids('pandeo').indexOf('buckling')).toBeLessThan(ids('pandeo').indexOf('so-buckling-phi'));
  });

  it('needs every word to match', () => {
    expect(ids('pandeo navier')).toEqual([]);
    expect(ids('zzzz')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });
});
