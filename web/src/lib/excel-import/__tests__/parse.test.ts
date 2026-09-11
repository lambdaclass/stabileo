/**
 * What a hand-typed workbook is allowed to be, and what it is told when it is not.
 *
 * The case that matters most here is the last one: the template we hand people
 * has to parse under our own reader. A template that ships an example the
 * importer rejects is worse than no template — it teaches a shape and then
 * refuses it, and the reader has no way to tell which of the two is wrong.
 */

import { describe, it, expect } from 'vitest';
import { parseWorkbook } from '../parse';
import { SHEETS, headerFor } from '../schema';

/** Build a sheet the way `xlsx.utils.sheet_to_json(..., {header: 1})` hands it over. */
const aoa = (header: string[], ...rows: Array<Array<unknown>>) => [header, ...rows];

/** A small portal frame, complete and valid. */
function goodBook(): Record<string, unknown[][]> {
  return {
    Nodes: aoa(['id', 'x [m]', 'y [m]', 'z [m]'], [1, 0, 0, 0], [2, 6, 0, 0], [3, 6, 4, 0]),
    Materials: aoa(['id', 'name', 'E [MPa]', 'nu', 'rho [kN/m³]'], [1, 'H-25', 25000, 0.2, 24]),
    Sections: aoa(['id', 'name', 'b [m]', 'h [m]'], [1, 'V 20x40', 0.2, 0.4]),
    Members: aoa(
      ['id', 'type', 'nodeI', 'nodeJ', 'material', 'section', 'hingeStart', 'hingeEnd'],
      [1, 'frame', 1, 2, 1, 1, 'no', 'no'],
      [2, 'truss', 2, 3, 1, 1, 'sí', 'no'],
    ),
    Supports: aoa(['node', 'type'], [1, 'fixed'], [2, 'pinned']),
    LoadCases: aoa(['id', 'name', 'type'], [1, 'Permanente', 'D'], [2, 'Sobrecarga', 'L']),
    Combinations: aoa(
      ['combination', 'case', 'factor'],
      ['1.2D+1.6L', 1, 1.2],
      ['1.2D+1.6L', 2, 1.6],
      ['1.0D', 1, 1.0],
    ),
    Loads: aoa(
      ['type', 'case', 'node', 'member', 'fy [kN]', 'qi [kN/m]', 'qj [kN/m]', 'P [kN]', 'a [m]'],
      ['nodal', 1, 3, '', -20, '', '', '', ''],
      ['distributed', 1, '', 1, '', -10, -10, '', ''],
      ['pointOnElement', 2, '', 1, '', '', '', -35, 2.5],
    ),
  };
}

describe('reading a workbook', () => {
  it('takes a complete one without complaint', () => {
    const r = parseWorkbook(goodBook());
    expect(r.problems, JSON.stringify(r.problems)).toEqual([]);
    expect(r.counts).toMatchObject({
      Nodes: 3, Members: 2, Materials: 1, Sections: 1,
      Supports: 2, LoadCases: 2, Combinations: 2, Loads: 3,
    });
  });

  it('derives a rectangle rather than asking for the arithmetic', () => {
    const s = parseWorkbook(goodBook()).model.sections[0];
    expect(s.a).toBeCloseTo(0.08, 10);
    expect(s.iz).toBeCloseTo((0.2 * 0.4 ** 3) / 12, 12);
    expect(s.iy).toBeCloseTo((0.4 * 0.2 ** 3) / 12, 12);
  });

  it('resolves a rolled profile from its name alone', () => {
    /*
     * The case the template's second example row is about. Nobody carries the
     * inertia of an IPE 300 in their head, so requiring it would reintroduce
     * the transcription step this importer removes.
     */
    const b = goodBook();
    b.Sections = aoa(['id', 'name'], [1, 'IPE 300'], [2, 'ipe300'], [3, 'HEB  200']);
    const r = parseWorkbook(b);
    expect(r.problems.filter((p) => p.sheet === 'Sections')).toEqual([]);
    const [ipe, ipeNoSpace, heb] = r.model.sections;
    expect(ipe.a, 'IPE 300 is 53.8 cm²').toBeCloseTo(53.8e-4, 5);
    expect(ipeNoSpace.a, 'spacing and case are forgiven').toBeCloseTo(ipe.a as number, 12);
    expect(heb.a).toBeGreaterThan(0);
    expect(ipe.tw, 'the catalogue brings thicknesses a typed row would not').toBeGreaterThan(0);
  });

  it('says the name is not in the catalogue rather than that the row is wrong', () => {
    const b = goodBook();
    b.Sections = aoa(['id', 'name'], [1, 'IPE 999']);
    const p = parseWorkbook(b).problems.find((x) => x.sheet === 'Sections')!;
    expect(p.message).toContain('catálogo');
    expect(p.message).toContain('IPE 999');
  });

  it('prefers an explicit property over the one it would have derived', () => {
    const b = goodBook();
    b.Sections = aoa(['id', 'name', 'b [m]', 'h [m]', 'A [m²]'], [1, 'V', 0.2, 0.4, 0.07]);
    expect(parseWorkbook(b).model.sections[0].a).toBe(0.07);
  });

  it('groups the long-form combination rows by name', () => {
    const combos = parseWorkbook(goodBook()).model.combinations;
    expect(combos.map((c) => c.name)).toEqual(['1.2D+1.6L', '1.0D']);
    expect(combos[0].factors).toEqual([{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }]);
  });

  it('reads a hinge from whatever a person types for yes', () => {
    const b = goodBook();
    for (const yes of ['sí', 'SI', 'yes', 'x', 'TRUE', 1]) {
      b.Members = aoa(
        ['id', 'type', 'nodeI', 'nodeJ', 'material', 'section', 'hingeStart'],
        [1, 'frame', 1, 2, 1, 1, yes],
      );
      expect(parseWorkbook(b).model.elements[0].hingeStart, `for ${yes}`).toBe(true);
    }
  });

  it('accepts a comma as a decimal point', () => {
    /*
     * A Spanish-locale spreadsheet writes 1,25. Rejecting that would blame the
     * reader for a separator their operating system chose.
     */
    const b = goodBook();
    b.Nodes = aoa(['id', 'x [m]', 'y [m]'], [1, '1,25', '0'], [2, '6', '0']);
    expect(parseWorkbook(b).model.nodes[0].x).toBe(1.25);
  });

  it('carries every importable load type through with the keys the loader reads', () => {
    /*
     * The assertions are the keys in loadFixture's switch, not the column
     * names: `my` (not `m`), `dtUniform` (not `deltaT`), `qYI`…`qZJ` (not
     * `qI`/`qJ` on the 3D arm), `isGlobal` (not `direction`). The first draft
     * wrote column-shaped keys and every one of these rows loaded with its
     * values gone; this pins the loader's contract so it cannot drift back.
     */
    const b = goodBook();
    b.Loads = aoa(
      ['type', 'case', 'node', 'member', 'fz [kN]', 'mz [kN·m]', 'mx [kN·m]', 'qi [kN/m]', 'qj [kN/m]', 'qzi [kN/m]', 'qzj [kN/m]', 'dir', 'dT [°C]', 'dTg [°C]'],
      ['nodal', 1, 3, '', -12, 6, '', '', '', '', '', '', '', ''],
      ['nodal3d', 1, 3, '', -12, '', 4, '', '', '', '', '', '', ''],
      ['distributed', 1, '', 1, '', '', '', -10, -10, '', '', 'global', '', ''],
      ['distributed3d', 1, '', 1, '', '', '', -8, -3, -5, -2, '', '', ''],
      ['thermal', 2, '', 1, '', '', '', '', '', '', '', '', 20, 4],
    );
    const loads = parseWorkbook(b).model.loads;
    expect(loads.map((l) => l.type)).toEqual(['nodal', 'nodal3d', 'distributed', 'distributed3d', 'thermal']);
    expect(loads[0].data).toMatchObject({ nodeId: 3, fz: -12, my: 6, caseId: 1 });
    expect(loads[1].data).toMatchObject({ nodeId: 3, fz: -12, mx: 4, caseId: 1 });
    expect(loads[2].data).toMatchObject({ elementId: 1, qI: -10, qJ: -10, isGlobal: true });
    expect(loads[3].data).toMatchObject({ elementId: 1, qYI: -8, qYJ: -3, qZI: -5, qZJ: -2 });
    expect(loads[4].data).toMatchObject({ elementId: 1, dtUniform: 20, dtGradient: 4, caseId: 2 });
  });
});

describe('a row fails on its own', () => {
  it('keeps the good rows when one is broken', () => {
    const b = goodBook();
    b.Nodes = aoa(['id', 'x [m]', 'y [m]'], [1, 0, 0], [2, 'ocho', 0], [3, 6, 4]);
    const r = parseWorkbook(b);
    expect(r.model.nodes.map((n) => n.id), 'the other two must survive').toEqual([1, 3]);
    expect(r.problems[0]).toMatchObject({ sheet: 'Nodes', row: 3, column: 'x' });
  });

  it('names the Excel row, not the array index', () => {
    const b = goodBook();
    b.Nodes = aoa(['id', 'x [m]', 'y [m]'], [1, 0, 0], [2, 6, 0], [3, '', 4]);
    // Header is row 1, so the third data row is row 4 on screen.
    expect(parseWorkbook(b).problems[0].row).toBe(4);
  });

  it('says which reference is missing rather than that something is', () => {
    const b = goodBook();
    b.Members = aoa(
      ['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'],
      [1, 'frame', 1, 99, 1, 1],
    );
    const p = parseWorkbook(b).problems.find((x) => x.sheet === 'Members')!;
    expect(p.message).toContain('nodeJ=99');
  });

  it('rejects an unknown load type and lists the ones it knows', () => {
    const b = goodBook();
    b.Loads = aoa(['type', 'case', 'node'], ['puntual', 1, 3]);
    const p = parseWorkbook(b).problems.find((x) => x.sheet === 'Loads')!;
    expect(p.message).toContain('puntual');
    expect(p.message).toContain('nodal3d');
  });

  it('will not attach a member load to a node', () => {
    const b = goodBook();
    b.Loads = aoa(['type', 'case', 'node', 'member'], ['distributed', 1, 3, '']);
    expect(parseWorkbook(b).problems[0].message).toContain('barra');
  });

  it('rejects a support type it does not know, because the solver would restrain nothing', () => {
    /*
     * The solver's restraint switch ends in `default: return false` — an
     * unknown type is a support holding no DOF, and the import would say
     * success. "Fixed" with a capital is the typo a hand-filled sheet will
     * actually contain, and it must NOT fail: the match is case-insensitive.
     */
    const b = goodBook();
    b.Supports = aoa(['node', 'type'], [1, 'Fixed'], [2, 'empotrado'], [3, 'pinned']);
    const r = parseWorkbook(b);
    expect(r.model.supports.map((s) => s.type)).toEqual(['fixed', 'pinned']);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ sheet: 'Supports', row: 3 });
    expect(r.problems[0].message).toContain('empotrado');
  });

  it('refuses custom3d rather than importing a support with no restraints', () => {
    const b = goodBook();
    b.Supports = aoa(['node', 'type'], [1, 'custom3d']);
    const r = parseWorkbook(b);
    expect(r.model.supports).toHaveLength(0);
    expect(r.problems[0].message).toContain('custom3d');
  });

  it('rejects a member type it does not know instead of silently making it a frame', () => {
    // "trus" was a frame before this check, with the stiffness that implies.
    const b = goodBook();
    b.Members = aoa(
      ['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'],
      [1, 'trus', 1, 2, 1, 1],
      [2, 'truss', 2, 3, 1, 1],
    );
    const r = parseWorkbook(b);
    expect(r.model.elements.map((e) => e.type)).toEqual(['truss']);
    expect(r.problems[0].message).toContain('trus');
  });

  it('rejects a distributed direction it does not know instead of importing local', () => {
    const b = goodBook();
    b.Loads = aoa(
      ['type', 'case', 'member', 'qi [kN/m]', 'qj [kN/m]', 'dir'],
      ['distributed', 1, 1, -10, -10, 'vertical'],
    );
    const r = parseWorkbook(b);
    expect(r.model.loads).toHaveLength(0);
    expect(r.problems[0]).toMatchObject({ sheet: 'Loads', column: 'dir' });
    expect(r.problems[0].message).toContain('vertical');
  });

  it('refuses the load types the loader cannot deliver, by name', () => {
    /*
     * `loadFixture` has no case for pointOnElement3d, and the two quad loads
     * have no Quads sheet to point at. Parsing them "successfully" would drop
     * the row between parse and store with the report saying nothing.
     */
    const b = goodBook();
    b.Loads = aoa(
      ['type', 'case', 'member', 'P [kN]', 'a [m]'],
      ['pointOnElement3d', 1, 1, -35, 2.5],
      ['surface3d', 1, 1, -5, ''],
      ['thermalQuad3d', 1, 1, '', ''],
    );
    const r = parseWorkbook(b);
    expect(r.model.loads).toHaveLength(0);
    expect(r.problems).toHaveLength(3);
    expect(r.problems[0].message).toContain('pointOnElement3d');
    expect(r.problems[1].message).toContain('surface3d');
    expect(r.problems[2].message).toContain('thermalQuad3d');
  });

  it('reports an unknown column once, without dropping the sheet', () => {
    const b = goodBook();
    b.Nodes = aoa(['id', 'x [m]', 'y [m]', 'temperatura'], [1, 0, 0, 5], [2, 6, 0, 5]);
    const r = parseWorkbook(b);
    expect(r.model.nodes).toHaveLength(2);
    expect(r.problems.filter((p) => p.column === 'temperatura')).toHaveLength(1);
  });

  it('lists sheets it does not know instead of failing on them', () => {
    const b = goodBook();
    b['Mis notas'] = aoa(['lo que sea'], ['nada']);
    const r = parseWorkbook(b);
    expect(r.unknownSheets).toEqual(['Mis notas']);
    expect(r.problems.filter((p) => p.sheet === 'Mis notas')).toEqual([]);
  });
});

describe('the template we ship', () => {
  /*
   * THE test this file exists for. `template.ts` writes the header from
   * `headerFor` and the rows from `SheetSpec.examples`; this reassembles
   * exactly that and reads it back. If an example row ever stops satisfying
   * the parser — a column reordered, a load type renamed — the workbook we
   * hand people would teach a shape we reject, and this fails first.
   */
  it('parses under our own reader, with no problems', () => {
    const book: Record<string, unknown[][]> = {};
    for (const s of SHEETS) book[s.name] = [s.columns.map(headerFor), ...s.examples];

    const r = parseWorkbook(book);
    expect(r.problems, JSON.stringify(r.problems, null, 1)).toEqual([]);
    expect(r.unknownSheets).toEqual([]);
  });

  it('and its examples describe a model with something in every sheet', () => {
    const book: Record<string, unknown[][]> = {};
    for (const s of SHEETS) book[s.name] = [s.columns.map(headerFor), ...s.examples];
    const { counts } = parseWorkbook(book);
    for (const s of SHEETS) {
      expect(counts[s.name], `${s.name} has no usable example row`).toBeGreaterThan(0);
    }
  });
});
