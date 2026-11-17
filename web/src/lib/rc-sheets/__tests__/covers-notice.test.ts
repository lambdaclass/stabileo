/** The covers notice in words: where each value comes from, the table's arithmetic for it, what the button changes and the button saying so. */
import { describe, it, expect } from 'vitest';
import { defaultDesignData, type ProjectDesignData } from '../../model/design-data';
import { withCirsocCovers } from '../../rc-sheets/cover-data';
import { mainBarCoverMm } from '../../codes/cirsoc201/cover';
import { coverCheckText, coverChanges, coverOrigin, coverShortfalls, coversButton, coversNotice, OLD_DEFAULT_COVER, type CoverWords } from '../covers-notice';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

const fill = (s: string, p: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
const words = (dict: Record<string, string>, locale: string): CoverWords => ({
  t: (k) => dict[k] ?? k,
  tp: (k, p) => fill(dict[k] ?? k, p),
  tpn: (k, n, p) => fill(dict[`${k}.${n === 1 ? 'one' : 'other'}`] ?? k, { ...p, n }),
  inSentence: (l) => l.toLocaleLowerCase(locale),
  locale,
});
const ES = words(es, 'es'), EN = words(en, 'en');
const old = { covers: { beam: 0.025, column: 0.025, slab: 0.025, wall: 0.025, footing: 0.025 } };
const withCovers = (c: Partial<ProjectDesignData['covers']>): ProjectDesignData => ({ ...defaultDesignData(), covers: { ...withCirsocCovers(defaultDesignData()).covers, ...c } });

describe('where a cover comes from', () => {
  it('is the old default only when the project stores 25 mm for every kind', () => {
    expect(OLD_DEFAULT_COVER).toBe(0.025);
    expect(coverOrigin(old, 'beam')).toBe('oldDefault');
    expect(coverOrigin({ covers: { ...old.covers, footing: 0.055 } }, 'beam')).toBe('stored');
    expect(coverOrigin({ covers: { beam: 0.025 } }, 'beam')).toBe('stored');
    expect(coverOrigin({ covers: { beam: 0.025 } }, 'column')).toBe('default');
    expect(coverOrigin({}, 'beam')).toBe('default');
  });
});

describe('a project that kept the program\'s old 25 mm covers', () => {
  const d = withCovers(old.covers);
  const list = coverShortfalls(d, old, mainBarCoverMm);

  it('falls short in beams, columns and footings, by the table\'s own arithmetic', () => {
    expect(list.map((s) => [s.kind, s.cover, s.target, s.origin])).toEqual([['beam', 25, 30, 'oldDefault'], ['column', 25, 30, 'oldDefault'], ['footing', 25, 55, 'oldDefault']]);
    expect(list[0]!.rule).toEqual({ kind: 'main', stirrup: 8, db: 25, base: 35, dbAdd: 5, need: 35 });
    expect(list[1]!.rule).toMatchObject({ kind: 'main', db: 32, need: 37 });
    expect(list[2]!.rule).toEqual({ kind: 'ground' });
  });

  it('says it plainly in Spanish: the value, its origin, cover + stirrup against the table, what follows, what the button changes and that it undoes', () => {
    const n = coversNotice(list, ES);
    expect(n.items[0]).toBe('Vigas: 25 mm (valor por defecto anterior del programa). La tabla pide recubrimiento + estribo ≥ máx(35; db + 5) mm; con estribo Ø8 y barras de hasta Ø25 quedan 25 + 8 = 33 mm, menos que 35 mm. Mínimo: 27 mm.');
    expect(n.items[2]).toBe('Zapatas: 25 mm (valor por defecto anterior del programa). Hormigonadas contra el suelo, la tabla pide al menos 55 mm.');
    expect(n.consequence).toBe('Hasta corregirlos, todas las filas que verifican esos recubrimientos dan «No verifica».');
    expect(n.change).toBe('El botón pasa vigas y columnas de 25 a 30 mm y zapatas de 25 a 55 mm en los datos de diseño del proyecto, y vuelve a dimensionar.');
    expect(n.undo).toBe('Se deshace en un solo paso con Deshacer.');
    expect(n.button).toBe('Pasar a 30 mm (vigas y columnas), 55 mm (zapatas) y volver a dimensionar');
  });

  it('and in English', () => {
    expect(coversButton(list.slice(0, 2), EN)).toBe('Set 30 mm (beams and columns) and design again');
    expect(coversNotice(list, EN).items[0]).toContain('cover + stirrup ≥ max(35; db + 5) mm; with a Ø8 stirrup and bars up to Ø25 that is 25 + 8 = 33 mm, less than 35 mm');
  });

  it('gives a failing row\'s cover check one line of its own', () => {
    expect(coverCheckText(list[0]!, ES)).toBe('El recubrimiento de vigas es 25 mm (valor por defecto anterior del programa), menos que los 27 mm de la tabla; el botón lo pasa a 30 mm.');
  });
});

describe('covers the person stored', () => {
  it('say so, and group what goes from one value to the same other', () => {
    const stored = { covers: { beam: 0.02, column: 0.025 } };
    const list = coverShortfalls(withCovers(stored.covers), stored, mainBarCoverMm);
    expect(list.map((s) => s.origin)).toEqual(['stored', 'stored']);
    expect(coverChanges(list)).toEqual([{ kinds: ['beam'], from: 20, to: 30 }, { kinds: ['column'], from: 25, to: 30 }]);
    expect(coversButton(list, ES)).toBe('Pasar a 30 mm (vigas y columnas) y volver a dimensionar');
    expect(coversNotice(list, ES).items[0]).toContain('(guardado en el proyecto)');
  });

  it('read the slabs\' and walls\' rule without a stirrup, and the exposed elements\' fixed value', () => {
    const d = { ...withCovers({ slab: 0.015 }), exposure: { ...defaultDesignData().exposure, wall: 'exterior' as const }, covers: { ...withCirsocCovers(defaultDesignData()).covers, slab: 0.015, wall: 0.025 } };
    const list = coverShortfalls(d, { covers: { slab: 0.015, wall: 0.025 } }, mainBarCoverMm);
    expect(list.map((s) => s.rule.kind)).toEqual(['mesh', 'exposed']);
    const n = coversNotice(list, ES);
    expect(n.items[0]).toBe('Losas: 15 mm (guardado en el proyecto). La tabla pide recubrimiento ≥ máx(25; db + 5) mm; con barras de hasta Ø16, al menos 25 mm.');
    expect(n.items[1]).toBe('Tabiques: 25 mm (guardado en el proyecto). A la intemperie o en contacto con el suelo, la tabla pide al menos 35 mm.');
  });
});
