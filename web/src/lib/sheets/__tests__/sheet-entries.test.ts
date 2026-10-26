/** The set as an ordered list of entries, and its title block template. */
import { describe, it, expect } from 'vitest';
import { addEntry, defaultEntries, duplicateEntry, fillLine, moveEntry, parseSetTemplate, removeEntry } from '../sheet-entries';

describe('the set as a list', () => {
  const base = defaultEntries(['formwork', 'columns', 'beams']);
  it('reorders, duplicates (a kind twice with another configuration), adds and removes', () => {
    expect(moveEntry(base, 'beams', 0).map((e) => e.id)).toEqual(['beams', 'formwork', 'columns']);
    const d = duplicateEntry(base, 'formwork');
    expect(d.map((e) => e.id)).toEqual(['formwork', 'formwork-2', 'columns', 'beams']);
    expect(d[1]!.kind).toBe('formwork');
    expect(addEntry(d, 'formwork').at(-1)!.id).toBe('formwork-3');
    expect(removeEntry(d, 'columns').map((e) => e.id)).toEqual(['formwork', 'formwork-2', 'beams']);
  });
});

describe('the title block template', () => {
  it('fills its variables and leaves an unstated one blank, not as its name', () => {
    expect(fillLine('{obra} · {expediente}', { obra: 'Edificio Sur', expediente: 'EX-12' })).toBe('Edificio Sur · EX-12');
    expect(fillLine('{obra} · {expediente}', { obra: 'Edificio Sur' })).toBe('Edificio Sur');
    expect(fillLine('{profesional} · Mat. {matricula}', {})).toBe('Mat.');
  });
  it('a set template reads back, and anything else is refused', () => {
    const t = { kind: 'stabileo-sheet-set', version: 1, name: 'Estudio', format: 'A1', prefix: 'E-', start: 1, entries: [{ id: 'a', kind: 'beams' }] };
    expect(parseSetTemplate(JSON.stringify(t)).entries).toHaveLength(1);
    expect(() => parseSetTemplate('{"kind":"other"}')).toThrow();
  });
});
