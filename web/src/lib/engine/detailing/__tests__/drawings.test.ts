import { describe, it, expect } from 'vitest';
import { teAt } from '../../../i18n/engine-text';
import {
  ELEVATION_X, LAYERS, PLAN, barArcs, buildSchedule, buildTitleBlock, drawElevation,
  drawSection, project, scheduleToAoa, sheetToDxf, sheetToSvg,
} from '../drawings';
import { assignMarks, type DetailingAssembly } from '../assembly';
import {
  buildStraightBarWithHooks, straightSegment, type BarPath,
} from '../../../codes/cirsoc201/bar-geometry';
import { clause } from '../../../codes/regulation';
import type { BarConflict } from '../collision';

const X = { x: 1, y: 0, z: 0 };
const Z = { x: 0, y: 0, z: 1 };

function straight(id: string, z = -0.25, len = 6, dia = 20): BarPath {
  return {
    id, diameterMm: dia, role: 'longitudinal',
    segments: [straightSegment({ x: 0, y: 0, z }, { x: len, y: 0, z })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: len, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
  };
}

const hooked = buildStraightBarWithHooks({
  id: 'h1', diameterMm: 20, role: 'longitudinal',
  start: { x: 0, y: 0, z: -0.25 }, end: { x: 6, y: 0, z: -0.25 },
  axis: X, hookNormal: Z, endHook: 90, ownerElementIds: [1],
});

function assembly(over: Partial<DetailingAssembly> = {}): DetailingAssembly {
  const bars = over.bars ?? [straight('b1'), straight('b2'), hooked];
  return {
    id: 'L1-B', kind: 'beamLine', label: 'Eje B',
    elementIds: [1], bars, marks: assignMarks(bars), joints: [],
    conflicts: [], unsupported: [], detailingRevision: 3, demandRevision: 5,
    state: 'CONSTRUCTIBLE', maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'v', trace: [], assumptions: [] },
    ...over,
  };
}

const outlines = [{
  points: [
    { x: 0, y: 0, z: -0.30 }, { x: 6, y: 0, z: -0.30 },
    { x: 6, y: 0, z: 0.30 }, { x: 0, y: 0, z: 0.30 },
  ],
  closed: true,
}];

const clauses = [clause('cirsoc-201', '2025', '9.7.3'), clause('cirsoc-201', '2025', '25.2.1')];

function elevation(a = assembly()) {
  return drawElevation({
    assembly: a, outlines, projection: ELEVATION_X, clauses,
    sheetNumber: 'H-01', title: 'Viga eje B — elevación',
    stirrupZones: [{ from: 0, to: 1.2, label: 'Ø8 c/12' }],
  });
}

describe('projection', () => {
  it('maps model coordinates onto the sheet plane', () => {
    expect(project({ x: 3, y: 0, z: 0.5 }, ELEVATION_X)).toEqual({ x: 3, y: 0.5 });
    // A plan view drops z and keeps y as the sheet's up.
    expect(project({ x: 3, y: 2, z: 9 }, PLAN)).toEqual({ x: 3, y: 2 });
  });
});

describe('elevation sheets', () => {
  it('draws the member outline and every bar', () => {
    const s = elevation();
    expect(s.polylines.filter((p) => p.layer === LAYERS.outline)).toHaveLength(1);
    expect(s.polylines.filter((p) => p.layer === LAYERS.bar)).toHaveLength(3);
  });

  it('draws a hook as an arc polyline, not a right angle', () => {
    // The whole point: the drawing and the clash check read the same geometry.
    const s = elevation(assembly({ bars: [hooked] }));
    const bar = s.polylines.find((p) => p.layer === LAYERS.bar)!;
    expect(bar.points.length).toBeGreaterThan(4);
  });

  /*
   * One label per MARK, not per bar.
   *
   * A mark is a fabrication type, so every stirrup in a zone carries the same one. Labelling
   * each bar put the same `B4 Ø8` on screen once per stirrup — on `rc-design-qa-8` a solid band
   * of overlapping text across the top of the beam, and it got worse the more steel the design
   * produced. Nothing is lost: the second `B4 Ø8` carried nothing the first did not, and the
   * quantity behind a mark is what the schedule states.
   *
   * The three bars here are two identical straights and one hooked, which `assignMarks` groups
   * into two marks — so two labels, not three.
   */
  it('labels each MARK once, with its diameter', () => {
    const s = elevation();
    const marks = s.texts.filter((t) => t.layer === LAYERS.mark);
    expect(new Set(assembly().marks.map((m) => m.mark)).size).toBe(2);
    expect(marks).toHaveLength(2);
    expect(new Set(marks.map((m) => m.text)).size).toBe(2);
    expect(marks[0].text).toMatch(/^B\d+ Ø20$/);
  });

  it('dimensions the stirrup zones', () => {
    const s = elevation();
    expect(s.dimensions).toHaveLength(1);
    expect(s.dimensions[0].label).toBe('Ø8 c/12');
  });

  it('computes extents that contain every drawn entity', () => {
    const s = elevation();
    for (const pl of s.polylines) {
      for (const p of pl.points) {
        expect(p.x).toBeGreaterThanOrEqual(s.extents.min.x - 1e-9);
        expect(p.x).toBeLessThanOrEqual(s.extents.max.x + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(s.extents.min.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(s.extents.max.y + 1e-9);
      }
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(elevation())).toBe(JSON.stringify(elevation()));
  });
});

describe('sections', () => {
  const sectionOutline = [
    { x: -0.15, y: -0.30 }, { x: 0.15, y: -0.30 },
    { x: 0.15, y: 0.30 }, { x: -0.15, y: 0.30 },
  ];

  it('draws bars that cross the cut as circles in true position', () => {
    const s = drawSection({
      assembly: assembly(), atX: 3, outline: sectionOutline,
      projection: ELEVATION_X, clauses, sheetNumber: 'H-02', title: 'Sección',
    });
    expect(s.circles).toHaveLength(3);
    expect(s.circles[0].radius).toBeCloseTo(0.010, 9);
    expect(s.circles[0].centre.y).toBeCloseTo(-0.25, 9);
  });

  it('omits a bar that stops before the cut', () => {
    // A hook that turns short of the cut must not appear in the section.
    const short = straight('short', -0.25, 2);
    const s = drawSection({
      assembly: assembly({ bars: [short] }), atX: 4, outline: sectionOutline,
      projection: ELEVATION_X, clauses, sheetNumber: 'H-02', title: 'Sección',
    });
    expect(s.circles).toHaveLength(0);
  });

  it('scales the circle to the bar diameter', () => {
    const s = drawSection({
      assembly: assembly({ bars: [straight('a', -0.25, 6, 32)] }), atX: 3,
      outline: sectionOutline, projection: ELEVATION_X, clauses,
      sheetNumber: 'H-02', title: 'Sección',
    });
    expect(s.circles[0].radius).toBeCloseTo(0.016, 9);
  });

  it('draws the section outline closed', () => {
    const s = drawSection({
      assembly: assembly(), atX: 3, outline: sectionOutline,
      projection: ELEVATION_X, clauses, sheetNumber: 'H-02', title: 'Sección',
    });
    expect(s.polylines[0].closed).toBe(true);
  });
});

describe('title block honesty', () => {
  it('states the edition, revision and review state', () => {
    const t = buildTitleBlock({
      sheetNumber: 'H-01', title: 'X', assembly: assembly(), clauses,
    });
    expect(t.codeEdition).toBe('CIRSOC 201 2025');
    expect(t.revision).toBe(3);
    expect(t.reviewState).toBe('CONSTRUCTIBLE');
    expect(t.clauses).toEqual(['CIRSOC 201 2025 §25.2.1', 'CIRSOC 201 2025 §9.7.3']);
  });

  it('marks a sheet SUPERSEDED when the review no longer matches the revision', () => {
    const a = assembly({
      detailingRevision: 4,
      review: {
        engineer: 'Ing. P', at: '2026-07-26T10:00:00Z', revision: 3, state: 'REVIEWED',
        provisionalAcknowledged: false, acknowledgedProvisional: [],
      },
    });
    expect(buildTitleBlock({ sheetNumber: 'H', title: 'X', assembly: a, clauses }).superseded).toBe(true);
  });

  it('carries the provisional note when anything on the sheet is provisional', () => {
    const t = buildTitleBlock({
      sheetNumber: 'H', title: 'X',
      assembly: assembly({ maturity: 'IMPLEMENTED_PROVISIONAL' }), clauses,
    });
    // Structured now: the note is rendered by whichever writer emits the sheet, so the
    // same drawing can go out in Spanish while the UI stays English.
    expect(t.provisionalNote?.key).toBe('maturity.provisionalDrawingNote');
    expect(teAt(t.provisionalNote!, 'es')).toMatch(/CÁLCULO PROVISORIO/);
    expect(teAt(t.provisionalNote!, 'es')).toMatch(/no constituye firma profesional/);
    expect(teAt(t.provisionalNote!, 'en')).toMatch(/PROVISIONAL CALCULATION/);
  });

  it('omits the provisional note when everything is validated', () => {
    expect(buildTitleBlock({ sheetNumber: 'H', title: 'X', assembly: assembly(), clauses })
      .provisionalNote).toBeUndefined();
  });

  it('prints conflicts and unsupported conditions as sheet notes', () => {
    const conflict: BarConflict = {
      severity: 'overlap', barA: 'b1', barB: 'b2', at: { x: 1, y: 0, z: 0 },
      clearance: -0.005, required: 0.025, shortfall: 0.030, elementIds: [1],
    };
    const s = elevation(assembly({
      conflicts: [conflict],
      unsupported: [{ key: 'beamTorsion', scope: {}, message: 'torsión no verificada', refs: [] }],
    }));
    expect(s.notes.join('\n')).toMatch(/NO VERIFICADO — beamTorsion/);
    expect(s.notes.join('\n')).toMatch(/CONFLICTO SOLAPE/);
  });

  it('does not clutter the sheet with marginal conflicts', () => {
    const s = elevation(assembly({
      conflicts: [{
        severity: 'marginal', barA: 'a', barB: 'b', at: { x: 0, y: 0, z: 0 },
        clearance: 0.022, required: 0.025, shortfall: 0.003, elementIds: [1],
      }],
    }));
    expect(s.notes).toEqual([]);
  });
});

describe('DXF output', () => {
  it('emits a valid R12 skeleton', () => {
    const dxf = sheetToDxf(elevation());
    expect(dxf).toContain('AC1009');
    expect(dxf.startsWith('0\nSECTION')).toBe(true);
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    // R12 has no LWPOLYLINE.
    expect(dxf).not.toContain('LWPOLYLINE');
  });

  it('uses POLYLINE/VERTEX/SEQEND for bars', () => {
    const dxf = sheetToDxf(elevation());
    expect(dxf).toContain('POLYLINE');
    expect(dxf).toContain('VERTEX');
    expect(dxf).toContain('SEQEND');
  });

  it('emits real ARC entities for hooks', () => {
    // A hook drawn as chords is visually fine and geometrically wrong: a fabricator
    // measuring off the DXF would read the chord, not the arc.
    const arcs = barArcs(hooked, ELEVATION_X);
    expect(arcs.length).toBeGreaterThan(0);
    const dxf = sheetToDxf(elevation(), arcs);
    expect(dxf).toContain('\nARC\n');
    expect(dxf).toMatch(/\n50\n/);
    expect(dxf).toMatch(/\n51\n/);
  });

  it('derives an arc whose radius matches the bend', () => {
    const arcs = barArcs(hooked, ELEVATION_X);
    // Ø20 longitudinal: mandrel 6·d_b = 120 mm inside -> centreline radius 70 mm.
    expect(arcs[0].radius).toBeCloseTo(0.070, 3);
  });

  it('emits no arcs for a straight bar', () => {
    expect(barArcs(straight('s'), ELEVATION_X)).toEqual([]);
  });

  it('writes the title block, clauses and notes into the DXF', () => {
    const dxf = sheetToDxf(elevation(assembly({ maturity: 'IMPLEMENTED_PROVISIONAL' })));
    expect(dxf).toContain('CIRSOC 201 2025');
    expect(dxf).toContain('Revisión 3');
    expect(dxf).toContain('CÁLCULO PROVISORIO');
  });

  it('writes the SUPERSEDED marker when the review is stale', () => {
    const a = assembly({
      detailingRevision: 9,
      review: {
        engineer: 'Ing. P', at: 'x', revision: 3, state: 'REVIEWED',
        provisionalAcknowledged: false, acknowledgedProvisional: [],
      },
    });
    expect(sheetToDxf(elevation(a))).toContain('SUPERSEDED');
  });

  it('never emits NaN', () => {
    expect(sheetToDxf(elevation(), barArcs(hooked, ELEVATION_X))).not.toMatch(/NaN/);
  });
});

describe('SVG output', () => {
  it('produces a well-formed, labelled svg', () => {
    const svg = sheetToSvg(elevation());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Viga eje B — elevación"');
  });

  it('flips the y axis once, in a transform, rather than per coordinate', () => {
    expect(sheetToSvg(elevation())).toContain('scale(1 -1)');
  });

  it('escapes text so a title cannot break the markup', () => {
    const a = assembly();
    const s = drawElevation({
      assembly: a, outlines, projection: ELEVATION_X, clauses,
      sheetNumber: 'H-01', title: 'Viga <b> & "cía"',
    });
    const svg = sheetToSvg(s);
    expect(svg).toContain('&lt;b&gt; &amp; "cía"');
    expect(svg).not.toContain('<b>');
  });

  it('renders the SUPERSEDED watermark', () => {
    const a = assembly({
      detailingRevision: 9,
      review: {
        engineer: 'Ing. P', at: 'x', revision: 3, state: 'REVIEWED',
        provisionalAcknowledged: false, acknowledgedProvisional: [],
      },
    });
    expect(sheetToSvg(elevation(a))).toContain('>SUPERSEDED<');
  });

  it('renders the provisional note in a warning colour', () => {
    const svg = sheetToSvg(elevation(assembly({ maturity: 'IMPLEMENTED_PROVISIONAL' })));
    expect(svg).toContain('CÁLCULO PROVISORIO');
    expect(svg).toContain('#8a5a00');
  });

  it('never emits NaN', () => {
    expect(sheetToSvg(elevation())).not.toMatch(/NaN/);
  });
});

describe('bar bending schedule', () => {
  const marks = assignMarks([
    straight('a', -0.25, 6, 20), straight('b', -0.25, 6, 20),
    straight('c', -0.25, 4, 12),
  ]);

  it('reports quantity, cut length, mass, stock bars and offcut per mark', () => {
    const s = buildSchedule(marks);
    const twenty = s.rows.find((r) => r.diameterMm === 20)!;
    expect(twenty.quantity).toBe(2);
    expect(twenty.cuttingLengthM).toBeCloseTo(6, 6);
    expect(twenty.totalLengthM).toBeCloseTo(12, 6);
    // Two 6 m bars per 12 m stock, no offcut.
    expect(twenty.stockBars).toBe(1);
    expect(twenty.offcutM).toBeCloseTo(0, 9);
  });

  it('computes offcut where the cut does not divide the stock', () => {
    const s = buildSchedule(assignMarks([straight('a', -0.25, 5, 20)]));
    // One 5 m bar: 2 per stock, 2 m waste on the single stock bar used.
    expect(s.rows[0].stockBars).toBe(1);
    expect(s.rows[0].offcutM).toBeCloseTo(2, 6);
  });

  it('flags a mark longer than the stock length as needing a splice', () => {
    const s = buildSchedule(assignMarks([straight('a', -0.25, 14, 20)]));
    expect(s.notes.join(' ')).toMatch(/excede la barra comercial/);
  });

  it('totals across all marks', () => {
    const s = buildSchedule(marks);
    expect(s.totals.quantity).toBe(3);
    expect(s.totals.massKg).toBeCloseTo(s.rows.reduce((x, r) => x + r.massKg, 0), 9);
  });

  it('subtotals by diameter, for ordering', () => {
    const s = buildSchedule(marks);
    expect(s.byDiameter.map((d) => d.diameterMm)).toEqual([12, 20]);
    expect(s.byDiameter.find((d) => d.diameterMm === 20)!.quantity).toBe(2);
  });

  it('respects a project stock length', () => {
    expect(buildSchedule(assignMarks([straight('a', -0.25, 5, 20)]), 6).rows[0].offcutM)
      .toBeCloseTo(1, 6);
  });

  it('exports an XLSX-ready array with the title block and provisional note', () => {
    const title = buildTitleBlock({
      sheetNumber: 'P-01', title: 'Planilla',
      assembly: assembly({ maturity: 'IMPLEMENTED_PROVISIONAL' }), clauses,
    });
    const aoa = scheduleToAoa(buildSchedule(marks), title);
    const flat = aoa.map((r) => r.join('|')).join('\n');
    expect(flat).toContain('CIRSOC 201 2025');
    expect(flat).toContain('CÁLCULO PROVISORIO');
    // Headings come from the dictionary now, and the row carries what the item IS and where
    // it belongs before it carries numbers. They were Spanish literals with an unused
    // `locale` parameter two lines above them, so an English export produced a Spanish book.
    expect(flat).toContain('Marca|Tipo|Función|Elementos|Zona|Ø (mm)|Forma|Cant.');
    expect(flat).toContain('TOTAL');
    expect(flat).toContain('Resumen por diámetro');
    const en = scheduleToAoa(buildSchedule(marks), title, 'en')
      .map((r) => r.join('|')).join('\n');
    expect(en).toContain('Mark|Type|Function|Members|Zone');
    expect(en).toContain('Summary by diameter');
  });

  it('marks the schedule SUPERSEDED too, not just the drawing', () => {
    const a = assembly({
      detailingRevision: 9,
      review: {
        engineer: 'Ing. P', at: 'x', revision: 3, state: 'REVIEWED',
        provisionalAcknowledged: false, acknowledgedProvisional: [],
      },
    });
    const aoa = scheduleToAoa(buildSchedule(marks),
      buildTitleBlock({ sheetNumber: 'P', title: 'X', assembly: a, clauses }));
    expect(aoa.some((r) => String(r[0]).includes('SUPERSEDED'))).toBe(true);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildSchedule(marks))).toBe(JSON.stringify(buildSchedule(marks)));
  });
});
