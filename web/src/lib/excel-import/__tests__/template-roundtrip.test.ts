/**
 * The file we hand people, read back by the reader we hand them.
 *
 * `parse.test.ts` already checks the template's example rows, but it assembles
 * them from `SHEETS` — so it proves the schema agrees with itself and nothing
 * about the workbook. Everything between the two is untested there: sheet
 * names as xlsx writes them, headers with a unit in brackets, empty cells in
 * the middle of a row, numbers that survive a serialisation round trip.
 *
 * That gap is where a template goes wrong. `defval` alone accounts for it —
 * without it a Loads row whose middle columns are blank comes back short, and
 * every value after the gap lands under the wrong key, which produces a model
 * that imports cleanly and is not the one in the file.
 *
 * So this writes the real bytes and reads them back.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTemplateWorkbook } from '../template';
import { parseWorkbook } from '../parse';
import { applyWorkbook } from '../apply';
import { modelStore } from '../../store';
import { SHEETS, INSTRUCTIONS_SHEET } from '../schema';

/** Write the workbook to a buffer and read it back the way the importer does. */
function roundTrip(): Record<string, unknown[][]> {
  const wb = buildTemplateWorkbook(XLSX as never);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const back = XLSX.read(buf, { type: 'array' });

  const sheets: Record<string, unknown[][]> = {};
  for (const name of back.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(back.Sheets[name], {
      header: 1,
      defval: '',
      blankrows: false,
    }) as unknown[][];
  }
  return sheets;
}

describe('the downloaded template', () => {
  it('contains every sheet the format defines, plus the instructions', () => {
    const sheets = roundTrip();
    for (const s of SHEETS) expect(Object.keys(sheets)).toContain(s.name);
    expect(Object.keys(sheets)).toContain(INSTRUCTIONS_SHEET);
  });

  it('imports with no problems at all', () => {
    const r = parseWorkbook(roundTrip());
    expect(r.problems, JSON.stringify(r.problems, null, 1)).toEqual([]);
  });

  it('does not count the instructions sheet as a stray', () => {
    /*
     * It is prose, and it is ours. A reader who imports the template back
     * unchanged must not be told their own template contains a sheet we do
     * not recognise.
     */
    expect(roundTrip() && parseWorkbook(roundTrip()).unknownSheets).toEqual([]);
  });

  it('produces a model whose members and loads point at things that exist', () => {
    const { model } = parseWorkbook(roundTrip());
    const nodes = new Set(model.nodes.map((n) => n.id));
    const elems = new Set(model.elements.map((e) => e.id));
    const quads = new Set(model.quads.map((q) => q.id));
    const cases = new Set(model.loadCases.map((c) => c.id));

    expect(model.nodes.length).toBeGreaterThan(0);
    for (const e of model.elements) {
      expect(nodes.has(e.nodeI), `member ${e.id} → node ${e.nodeI}`).toBe(true);
      expect(nodes.has(e.nodeJ), `member ${e.id} → node ${e.nodeJ}`).toBe(true);
    }
    for (const q of model.quads) {
      for (const nd of q.nodes) expect(nodes.has(nd), `quad ${q.id} → node ${nd}`).toBe(true);
    }
    for (const l of model.loads) {
      const d = l.data as Record<string, number>;
      expect(cases.has(d.caseId), `a ${l.type} load names case ${d.caseId}`).toBe(true);
      if (d.nodeId !== undefined) expect(nodes.has(d.nodeId)).toBe(true);
      if (d.elementId !== undefined) expect(elems.has(d.elementId)).toBe(true);
      if (d.quadId !== undefined) expect(quads.has(d.quadId)).toBe(true);
    }
  });

  it('keeps a row aligned when its middle columns are blank', () => {
    /*
     * The Loads sheet is mostly empty by design — a nodal row leaves the
     * distributed and thermal columns alone. If the gap collapsed, `qi` would
     * be read out of the cell that holds `fy`, and the import would be wrong
     * rather than rejected. The thermal example is the far end of the row, so
     * it only survives if nothing before it shifted.
     */
    const { model } = parseWorkbook(roundTrip());
    const thermal = model.loads.find((l) => l.type === 'thermal');
    expect(thermal, 'the thermal example row must survive the round trip').toBeDefined();
    expect((thermal!.data as Record<string, number>).dtUniform).toBe(20);

    const nodal = model.loads.find((l) => l.type === 'nodal');
    expect((nodal!.data as Record<string, number>).fy).toBe(-20);
    expect((nodal!.data as Record<string, number>).qI, 'a nodal load has no qI').toBeUndefined();
  });

  it('delivers load VALUES to the store, not just load rows', () => {
    /*
     * The regression the parse-level tests could not see: the parser wrote
     * keys the loader never reads (`deltaT`, `m`, `direction`, `qI` on the
     * 3D arm), so loads arrived with their values undefined while the report
     * counted them. A value out the far side is the only proof the whole
     * chain agrees on the keys. The template's own rows are the case: its
     * thermal ΔT, and its nodal gravity load written in fy by a reader who
     * thinks in x–y.
     */
    const outcome = applyWorkbook(roundTrip());
    expect(outcome.problems, JSON.stringify(outcome.problems)).toEqual([]);

    const thermal = modelStore.loads.find((l) => l.type === 'thermal');
    expect(thermal, 'the thermal example must reach the store').toBeDefined();
    expect((thermal!.data as { dtUniform: number }).dtUniform).toBe(20);

    const nodal = modelStore.loads.find((l) => l.type === 'nodal');
    expect((nodal!.data as { fz: number }).fz, 'fy gravity becomes fz on the x–z plane').toBe(-20);

    // The three types the format used to refuse: all of them now arrive,
    // with their values, on the thing they point at.
    expect(modelStore.model.quads.size, 'the quad from the Quads sheet').toBeGreaterThan(0);
    const surface = modelStore.loads.find((l) => l.type === 'surface3d');
    expect(surface, 'the surface example must reach the store').toBeDefined();
    expect((surface!.data as { q: number }).q).toBe(-5);

    const point3d = modelStore.loads.find((l) => l.type === 'pointOnElement3d');
    expect(point3d, 'the 3D point load must reach the store').toBeDefined();
    expect((point3d!.data as { py: number }).py).toBe(-35);

    const thermalQuad = modelStore.loads.find((l) => l.type === 'thermalQuad3d');
    expect(thermalQuad, 'the thermal quad example must reach the store').toBeDefined();
    expect((thermalQuad!.data as { dtUniform: number }).dtUniform).toBe(12);
  });
});
