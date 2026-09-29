/** A company's own section list from a CSV: every row drawable, or refused with its line. */
import { describe, it, expect } from 'vitest';
import { parseSectionsCsv, importSectionsCsv } from '../csv-sections';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';

describe('sections CSV', () => {
  it('reads commas or semicolons with decimal commas, any column order', () => {
    const a = parseSectionsCsv('name,shape,h,b,tw,tf\nPL I,I,300,150,7.1,10.7\n');
    const b = parseSectionsCsv('shape;tf;tw;b;h;name\nI;10,7;7,1;150;300;PL I\n');
    expect(a.refused).toEqual([]);
    expect(b.rows).toEqual(a.rows);
    const r = a.rows[0]!;
    expect(r.shape).toBe('I');
    for (const [k, v] of [['h', 0.3], ['b', 0.15], ['tw', 0.0071], ['tf', 0.0107]] as const) expect(r[k]).toBeCloseTo(v, 12);
  });

  it('refuses a row per line with the reason', () => {
    const r = parseSectionsCsv('name,shape,h,b,t\nx,Z,100,50,2\ny,L,100,,5\nz,RHS,1oo,50,3\n');
    expect(r.rows).toEqual([]);
    expect(r.refused).toEqual([
      { line: 2, kind: 'unknownShape', value: 'Z' },
      { line: 3, kind: 'missing', fields: ['b'] },
      { line: 4, kind: 'notANumber', field: 'h', value: '1oo' },
    ]);
    expect(parseSectionsCsv('foo,bar\n1,2').refused).toEqual([{ line: 1, kind: 'noHeader' }]);
  });
});

(hasCanonicalGeometryExport() ? describe : describe.skip)('sections CSV into the project', () => {
  it('each section takes its outline\'s numbers, and a declared area far from it is reported', () => {
    const r = importSectionsCsv('name,shape,h,b,t,A\nTubo,RHS,100,50,3,8.41\nChapa,rect,200,10,,99\n');
    expect(r.sections).toHaveLength(2);
    const tube = r.sections[0]!;
    // Sharp corners: 100 × 50 less 94 × 44.
    expect(tube.a).toBeCloseTo(0.1 * 0.05 - 0.094 * 0.044, 12);
    // 2.7 % over the rolled 8.41 cm², from the corners: inside the margin. The plate's 99 cm²
    // is a factor of five off, a column mistake.
    expect(r.disagreements.map((d) => d.name)).toEqual(['Chapa']);
    expect(r.disagreements[0]!.gap).toBeCloseTo(0.002 / 0.0099 - 1, 6);
  });
});

(hasCanonicalGeometryExport() ? describe : describe.skip)('a row named like a catalogue profile', () => {
  it('is its own dimensions, not the catalogue profile of that name', () => {
    // An I 400 mm deep named "IPE 300": the name used to look up the IPE 300 and store h = 0.4 m
    // beside the IPE 300's area.
    const r = importSectionsCsv('name,shape,h,b,tw,tf\nIPE 300,I,400,200,10,15\n');
    expect(r.refused).toEqual([]);
    const s = r.sections[0]!;
    expect(s.h).toBeCloseTo(0.4, 12);
    // Sharp-cornered plates: 2 × 200 × 15 + 370 × 10 mm².
    expect(s.a).toBeCloseTo(2 * 0.2 * 0.015 + 0.37 * 0.01, 9);
  });

  it('with the catalogue\'s own dimensions it still takes the profile', () => {
    const r = importSectionsCsv('name,shape,h,b,tw,tf\nIPE 300,I,300,150,7.1,10.7\n');
    // The rolled IPE 300 is 53.8 cm², fillets included.
    expect(r.sections[0]!.a).toBeCloseTo(53.8e-4, 5);
  });

  it('a row that draws no section is refused by line, and the rest are imported', () => {
    const r = importSectionsCsv('name,shape,h,b,tw,tf\nBad,I,100,100,5,60\nGood,I,300,150,7,10\n');
    expect(r.refused).toEqual([{ line: 2, kind: 'badGeometry' }]);
    expect(r.sections.map((s) => s.name)).toEqual(['Good']);
  });
});
