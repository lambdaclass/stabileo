// Stabileo DXF template: a complete example building plan using every layer
// convention the CAD → RC draft importer understands. Users download this
// from wizard step 1, draw (or paste) their plan on the STB_* layers, and
// re-import it with zero layer-mapping work.
//
// AUTOCAD COMPATIBILITY: this writes a conservative AutoCAD R12 (AC1009)
// ASCII DXF — the same flavor as lib/dxf/writer.ts, which is known to open
// cleanly in AutoCAD. Specifically:
//   - only LINE, POLYLINE/VERTEX/SEQEND, TEXT entities (NO LWPOLYLINE — it
//     does not exist in AC1009 and is what crashed AutoCAD before; NO MTEXT,
//     NO INSERT/BLOCKS, no handles, no AcDb subclass markers),
//   - strict group-code ordering, every SECTION opened and closed, EOF last,
//   - a single LAYER symbol table; numeric values fixed-format.
//
// The demo building (metres) demonstrates:
//   - 3 × 2 bays, 12 columns with outlines + plain "C#" marks,
//   - column schedule: 40x60 floors 1–3, 30x50 floors 4–10 (schedule beats
//     the drawn 40x40 outlines — precedence demo),
//   - beams sized PER MEMBER from labels (V-INT 18x45, V-PERIM 20x55, V3 25x60,
//     V-BALCON 15x35) and exact schedule rows (V1 20x50, V2 15x40), with one
//     unlabelled beam falling back to the default section (+warning), plus an
//     EDGE-FLUSH eccentric beam drawn as face lines (PR [7] member offset),
//   - walls drawn as single AXIS lines with "e=" thickness labels (T1 e=20,
//     T2 e=15, TABIQUE T3 e=18) — the preferred convention — plus one optional
//     paired-face wall (T4) whose thickness is read from the face spacing,
//   - one slab outline with "L1 h=15" mark; slab schedule makes the roof
//     thinner (L1 10 12),
//   - an opening (warned, not subtracted),
//   - a level schedule: base 3.0 m + floors 2–10 at 2.8 m,
//   - informative load-area notes (loads stay user-confirmed in the wizard),
//   - an STB_IGNORE doodle that must not become structure.

export const STB_TEMPLATE_LAYERS = [
  'STB_GRID',
  'STB_COLUMN_OUTLINE',
  'STB_COLUMN_MARKS',
  'STB_BEAM_FACES',
  'STB_BEAM_CENTERLINE',
  'STB_BEAM_MARKS',
  'STB_WALL_AXIS',
  'STB_WALL_FACES',
  'STB_WALL_MARKS',
  'STB_SLAB_OUTLINE',
  'STB_SLAB_MARKS',
  'STB_OPENING',
  'STB_LEVEL_SCHEDULE',
  'STB_SECTION_SCHEDULE_COLUMNS',
  'STB_SECTION_SCHEDULE_BEAMS',
  'STB_SECTION_SCHEDULE_WALLS',
  'STB_SECTION_SCHEDULE_SLABS',
  'STB_LOAD_AREAS',
  'STB_ROOMS',
  'STB_NOTES',
  'STB_IGNORE',
] as const;

const f = (n: number): string => n.toFixed(4);

const line = (out: string[], layer: string, x1: number, y1: number, x2: number, y2: number): void => {
  out.push(
    '0', 'LINE', '8', layer,
    '10', f(x1), '20', f(y1), '30', '0.0',
    '11', f(x2), '21', f(y2), '31', '0.0',
  );
};

/** R12-safe closed/open polyline (POLYLINE + VERTEX + SEQEND). */
const poly = (out: string[], layer: string, pts: Array<[number, number]>, closed: boolean): void => {
  out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0');
  for (const [x, y] of pts) {
    out.push('0', 'VERTEX', '8', layer, '10', f(x), '20', f(y), '30', '0.0');
  }
  out.push('0', 'SEQEND', '8', layer);
};

const text = (out: string[], layer: string, x: number, y: number, value: string, h = 0.25): void => {
  out.push('0', 'TEXT', '8', layer, '10', f(x), '20', f(y), '30', '0.0', '40', f(h), '1', value);
};

const rect = (out: string[], layer: string, cx: number, cy: number, b: number, h: number): void =>
  poly(out, layer, [
    [cx - b / 2, cy - h / 2], [cx + b / 2, cy - h / 2],
    [cx + b / 2, cy + h / 2], [cx - b / 2, cy + h / 2],
  ], true);

/** Build the template DXF (ASCII, AutoCAD R12 / AC1009, units = m). */
export function buildStabileoTemplateDxf(): string {
  const XS = [0, 5, 10, 15];
  const YS = [0, 6, 12];
  const e: string[] = [];

  // Grid axes (preview-only)
  for (const x of XS) line(e, 'STB_GRID', x, -1.5, x, 13.5);
  for (const y of YS) line(e, 'STB_GRID', -1.5, y, 16.5, y);

  // Columns: 0.4×0.4 drawn outlines + plain marks C1…C12. The column SCHEDULE
  // below drives the sizes per floor (40x60 then 30x50), overriding the drawn
  // 0.4×0.4 geometry — the precedence demo. (Per-column dims may also be written
  // on the mark, e.g. "C1 40x40"; here we let the schedule own column sizing.)
  let cn = 1;
  for (const y of YS) {
    for (const x of XS) {
      rect(e, 'STB_COLUMN_OUTLINE', x, y, 0.4, 0.4);
      text(e, 'STB_COLUMN_MARKS', x + 0.3, y + 0.3, `C${cn}`, 0.18);
      cn++;
    }
  }

  // Beams: each drawn line is ONE beam whose section can differ per member.
  // Sizes come from the label next to the line (e.g. "V-INT 18x45") or, for a
  // few marks, from an explicit schedule row (V1, V2). Interior, perimeter and
  // balcony-support beams use different depths on purpose — beam sizing is
  // per-member, not one global section.
  //   • H @ y=6  interior         V-INT  18x45 (label)
  //   • H @ y=12 perimeter        V-PERIM 20x55 (label)
  //   • V @ x=0  perimeter        V2     15x40 (schedule)
  //   • V @ x=5  interior         V3     25x60 (label)
  //   • V @ x=10 interior         (no spec) → default + warning
  //   • V @ x=15 balcony support  V-BALCON 15x35 (label)
  line(e, 'STB_BEAM_CENTERLINE', 0, 6, 15, 6);
  text(e, 'STB_BEAM_MARKS', 3.5, 6.35, 'V-INT 18x45', 0.18);
  line(e, 'STB_BEAM_CENTERLINE', 0, 12, 15, 12);
  text(e, 'STB_BEAM_MARKS', 3.5, 12.35, 'V-PERIM 20x55', 0.18);
  line(e, 'STB_BEAM_CENTERLINE', 0, 0, 0, 12);
  text(e, 'STB_BEAM_MARKS', 0.35, 3, 'V2 15x40', 0.18);
  line(e, 'STB_BEAM_CENTERLINE', 5, 0, 5, 12);
  text(e, 'STB_BEAM_MARKS', 5.35, 9, 'V3 25x60', 0.18);
  line(e, 'STB_BEAM_CENTERLINE', 10, 0, 10, 12); // intentionally unlabelled → default
  line(e, 'STB_BEAM_CENTERLINE', 15, 0, 15, 12);
  text(e, 'STB_BEAM_MARKS', 14.5, 2, 'V-BALCON 15x35', 0.18);

  // EDGE-FLUSH eccentric perimeter beam along y = 0, drawn as FACE lines: the
  // beam's outer face is flush with the column outer face (y = +0.20), so the
  // physical centerline sits at y = 0.125 — an eccentricity the importer
  // detects and records as element.offset. Its section (V1 20x50) comes from a
  // schedule row.
  line(e, 'STB_BEAM_FACES', 0, 0.05, 15, 0.05);
  line(e, 'STB_BEAM_FACES', 0, 0.20, 15, 0.20);
  text(e, 'STB_BEAM_MARKS', 11.5, 0.5, 'V1 20x50', 0.18);

  // Walls/tabiques — PREFERRED convention: a single AXIS line + a label whose
  // "e=" gives the thickness in cm (T1 e=20, T2 e=15, TABIQUE T3 e=18). No
  // two-face pairing needed.
  line(e, 'STB_WALL_AXIS', 2.5, 0, 2.5, 6);
  text(e, 'STB_WALL_MARKS', 2.7, 3, 'T1 e=20', 0.18);
  line(e, 'STB_WALL_AXIS', 7.5, 0, 7.5, 4);
  text(e, 'STB_WALL_MARKS', 7.7, 2, 'T2 e=15', 0.18);
  line(e, 'STB_WALL_AXIS', 12.5, 0, 12.5, 6);
  text(e, 'STB_WALL_MARKS', 12.7, 3, 'TABIQUE T3 e=18', 0.18);
  // ADVANCED / OPTIONAL: a wall drawn as two parallel FACE lines — the importer
  // infers the thickness from the face spacing (here 0.18 m). Use only when a
  // real DXF already has both faces; the axis+label form above is preferred.
  // Placed along the y=6 grid line between columns (10,6)–(15,6) so it sits on
  // the structure (walls rest on beams), not floating in mid-span.
  line(e, 'STB_WALL_FACES', 10, 5.91, 15, 5.91);
  line(e, 'STB_WALL_FACES', 10, 6.09, 15, 6.09);
  text(e, 'STB_WALL_MARKS', 12.2, 6.4, 'T4 (paired faces - advanced)', 0.16);

  // Slab: one closed outline for the full plant + thickness mark.
  poly(e, 'STB_SLAB_OUTLINE', [[0, 0], [15, 0], [15, 12], [0, 12]], true);
  text(e, 'STB_SLAB_MARKS', 11.5, 9.4, 'L1 h=15', 0.2);

  // Balcony / balcón–voladizo: a cantilever slab protruding from the middle of
  // the right side (x=15), supported ONLY along its x=15 edge, which lies on
  // the perimeter beam at x=15 — so it shares nodes with that beam (the beam is
  // split at the balcony edge nodes) and has NO exterior columns.
  poly(e, 'STB_SLAB_OUTLINE', [[15, 4], [17, 4], [17, 8], [15, 8]], true);
  text(e, 'STB_SLAB_MARKS', 15.6, 6, 'BALCON h=15', 0.18);

  // Opening (stairs/elevator): warned, not subtracted in v1.
  poly(e, 'STB_OPENING', [[6.5, 8], [8, 8], [8, 10], [6.5, 10]], true);

  // Level schedule: "LEVELS <floor|from-to> <height m>".
  text(e, 'STB_LEVEL_SCHEDULE', 18, 12.0, 'LEVELS 1 3.0');
  text(e, 'STB_LEVEL_SCHEDULE', 18, 11.5, 'LEVELS 2-10 2.8');

  // Section schedules: "<mark|*> <from>[-<to>] <bxh cm | t cm>". Read as a
  // table: Mark / Floors / Section.
  //   Columns: wildcard rows size every column by floor (40x60 → 30x50).
  //   Beams:   EXACT marks V1/V2 pin those beams; the rest take their size from
  //            the label drawn next to them (an exact label beats a wildcard).
  //   Slabs:   exact L1 rows make the roof (floor 10) thinner (12 vs 15 cm).
  text(e, 'STB_SECTION_SCHEDULE_COLUMNS', 18, 10.5, 'C* 1-3 40x60');
  text(e, 'STB_SECTION_SCHEDULE_COLUMNS', 18, 10.0, 'C* 4-10 30x50');
  text(e, 'STB_SECTION_SCHEDULE_BEAMS', 18, 9.0, 'V1 1-10 20x50');
  text(e, 'STB_SECTION_SCHEDULE_BEAMS', 18, 8.5, 'V2 1-10 15x40');
  text(e, 'STB_SECTION_SCHEDULE_SLABS', 18, 7.0, 'L1 1-9 15');
  text(e, 'STB_SECTION_SCHEDULE_SLABS', 18, 6.5, 'L1 10 12');

  // Load areas: informative only — D/L/Lr stay user-confirmed in the wizard.
  text(e, 'STB_LOAD_AREAS', 18, 5.5, 'VIVIENDA L=2.0 kN/m2 (informative)');
  text(e, 'STB_LOAD_AREAS', 18, 5.0, 'AZOTEA Lr=1.0 kN/m2 (informative)');

  // Room/use labels (STB_ROOMS): drive room-based live loads when enabled.
  // Spread across the 15×12 plan so each slab quad has a nearby label; the
  // balcony gets its own balcony category (5.0 kN/m²). Three named categories:
  // living (ESTAR), private (DORMITORIO/BAÑO/COCINA), balcony (BALCÓN).
  text(e, 'STB_ROOMS', 3.5, 3, 'DORMITORIO', 0.3);
  text(e, 'STB_ROOMS', 10, 3, 'ESTAR', 0.3);
  text(e, 'STB_ROOMS', 3.5, 9, 'BAÑO', 0.3);
  text(e, 'STB_ROOMS', 10, 9, 'COCINA', 0.3);
  text(e, 'STB_ROOMS', 16, 6, 'BALCON', 0.3);

  // Conventions cheat-sheet (plain TEXT, one line each — no MTEXT).
  const notes = [
    'STABILEO DXF TEMPLATE - draw in METERS on the STB_ layers.',
    'COLUMNS: closed polylines on STB_COLUMN_OUTLINE; marks C1, C2 ... on STB_COLUMN_MARKS (the column schedule sets sizes per floor).',
    'BEAMS: one centerline per beam on STB_BEAM_CENTERLINE; label each with mark + section in cm, e.g. V-INT 18x45 / V1 20x50 / V-BALCON 15x35. Sizes differ per beam. Flush faces on STB_BEAM_FACES model an eccentric offset.',
    'WALLS: PREFERRED = single axis on STB_WALL_AXIS + label T1 e=20 / TABIQUE T3 e=18 (e = cm). Two parallel faces on STB_WALL_FACES (thickness = spacing) are also supported for real DXFs.',
    'SLABS: closed outlines on STB_SLAB_OUTLINE; marks L1 h=15 (cm). Openings on STB_OPENING.',
    'BALCONY/VOLADIZO: a slab supported on ONE edge (on a beam) with no exterior columns is kept as a cantilever.',
    'SCHEDULES: rows <mark|*> <from>-<to> <bxh|t> in cm on STB_SECTION_SCHEDULE_*. An EXACT mark (V1) overrides the drawing and a wildcard (V*); a beam label overrides a wildcard schedule.',
    'LEVELS: rows LEVELS <n|a-b> <height m> on STB_LEVEL_SCHEDULE pre-fill the wizard floors.',
    'LOADS: STB_LOAD_AREAS is informative only - confirm D/L/Lr in the wizard. STB_IGNORE is skipped.',
    'ROOMS: room/use labels on STB_ROOMS (ESTAR/DORMITORIO/BANO/BALCON/...) drive room-based live loads when enabled.',
  ];
  notes.forEach((nt, i) => text(e, 'STB_NOTES', 0, -2.5 - i * 0.6, nt, 0.3));

  // Something the importer must ignore.
  line(e, 'STB_IGNORE', 18, 2, 21, 3.5);

  // ── Assemble: HEADER, TABLES/LAYER, ENTITIES, EOF (R12) ──
  const dxf: string[] = [];
  // HEADER — $ACADVER only ($INSUNITS omitted: an AC1009 reader can choke on
  // post-R12 header vars; the drawing is in metres and the wizard defaults to m).
  dxf.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC');
  // TABLES — single LAYER symbol table.
  dxf.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(STB_TEMPLATE_LAYERS.length));
  for (const name of STB_TEMPLATE_LAYERS) {
    dxf.push('0', 'LAYER', '2', name, '70', '0', '62', '7', '6', 'CONTINUOUS');
  }
  dxf.push('0', 'ENDTAB', '0', 'ENDSEC');
  // ENTITIES
  dxf.push('0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC');
  // EOF
  dxf.push('0', 'EOF');
  // CRLF line endings — what AutoCAD writes; most tolerant.
  return dxf.join('\r\n') + '\r\n';
}
