// Programmatic DXF builders for the CAD → RC draft tests, plus the canonical
// "simple architectural plan" fixture used by the parser, classification, and
// generator golden tests:
//
//   - 4 columns: 0.30×0.30 closed rects on "PILARES HA" at the corners of a
//     6 m × 5 m bay, plus one block-insert column at (3, 0),
//   - perimeter beams as LINEs on "VIGAS",
//   - one closed slab outline on "LOSAS" (the full 6×5 rectangle),
//   - a double-line tabique on "TABIQUES" (faces y=2.0 / y=2.2, x∈[0,6]),
//   - grid axes on "EJES", a label on "TEXTOS",
//   - a closed opening rect on "HUECOS" inside the slab,
//   - one ARC on "VIGAS" (curved member → must be skipped with a warning),
//   - one SPLINE on "LOSAS" (unsupported entity → counted).

export function buildDxf(opts: {
  insunits?: number;
  layers?: string[];
  blocks?: string;
  entities: string;
}): string {
  const layerRows = (opts.layers ?? []).flatMap((name) => [
    '0', 'LAYER', '2', name, '70', '0', '62', '7', '6', 'CONTINUOUS',
  ]);
  return [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1009',
    ...(opts.insunits !== undefined ? ['9', '$INSUNITS', '70', String(opts.insunits)] : []),
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', String(opts.layers?.length ?? 0),
    ...layerRows,
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    ...(opts.blocks
      ? ['0', 'SECTION', '2', 'BLOCKS', opts.blocks, '0', 'ENDSEC']
      : []),
    '0', 'SECTION',
    '2', 'ENTITIES',
    opts.entities,
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');
}

export function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return [
    '0', 'LINE', '8', layer,
    '10', String(x1), '20', String(y1), '30', '0',
    '11', String(x2), '21', String(y2), '31', '0',
  ].join('\n');
}

export function dxfLwPolyline(layer: string, pts: Array<[number, number]>, closed: boolean): string {
  const rows = [
    '0', 'LWPOLYLINE', '8', layer,
    '90', String(pts.length),
    '70', closed ? '1' : '0',
  ];
  for (const [x, y] of pts) rows.push('10', String(x), '20', String(y));
  return rows.join('\n');
}

export function dxfArc(
  layer: string, cx: number, cy: number, r: number, a0: number, a1: number,
): string {
  return [
    '0', 'ARC', '8', layer,
    '10', String(cx), '20', String(cy), '30', '0',
    '40', String(r), '50', String(a0), '51', String(a1),
  ].join('\n');
}

export function dxfCircle(layer: string, cx: number, cy: number, r: number): string {
  return [
    '0', 'CIRCLE', '8', layer,
    '10', String(cx), '20', String(cy), '30', '0',
    '40', String(r),
  ].join('\n');
}

export function dxfText(layer: string, x: number, y: number, text: string): string {
  return [
    '0', 'TEXT', '8', layer,
    '10', String(x), '20', String(y), '30', '0',
    '40', '0.2', '1', text,
  ].join('\n');
}

export function dxfInsert(layer: string, blockName: string, x: number, y: number): string {
  return [
    '0', 'INSERT', '8', layer,
    '2', blockName,
    '10', String(x), '20', String(y), '30', '0',
  ].join('\n');
}

export function dxfSpline(layer: string): string {
  // Minimal SPLINE; dxf-parser reads it, our IR rejects it as unsupported.
  return [
    '0', 'SPLINE', '8', layer,
    '70', '8', '71', '3', '72', '0', '73', '4', '74', '0',
    '10', '0', '20', '0', '30', '0',
    '10', '1', '20', '1', '30', '0',
    '10', '2', '20', '0', '30', '0',
    '10', '3', '20', '1', '30', '0',
  ].join('\n');
}

/** Block with a 0.4×0.4 rect centered on the insertion origin. */
export function columnBlock(name: string): string {
  return [
    '0', 'BLOCK', '8', '0',
    '2', name, '70', '0',
    '10', '0', '20', '0', '30', '0',
    '3', name,
    dxfLwPolyline('0', [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]], true),
    '0', 'ENDBLK',
  ].join('\n');
}

export const PLAN_LAYERS = {
  columns: 'PILARES HA',
  beams: 'VIGAS',
  walls: 'TABIQUES',
  slabs: 'LOSAS',
  grid: 'EJES',
  text: 'TEXTOS',
  openings: 'HUECOS',
  mystery: 'CAPA_MISTERIOSA',
};

/** Column rect (side m) centered at (cx, cy). */
function columnRect(cx: number, cy: number, side = 0.3): string {
  const s = side / 2;
  return dxfLwPolyline(
    PLAN_LAYERS.columns,
    [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]],
    true,
  );
}

/** The canonical simple architectural plan (units: metres, $INSUNITS=6). */
export function simplePlanDxf(): string {
  const L = PLAN_LAYERS;
  const entities = [
    // Columns: 4 corner rects + 1 block insert at mid bottom edge
    columnRect(0, 0), columnRect(6, 0), columnRect(6, 5), columnRect(0, 5),
    dxfInsert(L.columns, 'COL_B', 3, 0),
    // Perimeter beams
    dxfLine(L.beams, 0, 0, 6, 0),
    dxfLine(L.beams, 6, 0, 6, 5),
    dxfLine(L.beams, 6, 5, 0, 5),
    dxfLine(L.beams, 0, 5, 0, 0),
    // Curved member on the beams layer → skipped with a warning
    dxfArc(L.beams, 3, 7, 2, 0, 180),
    // Slab outline (closed)
    dxfLwPolyline(L.slabs, [[0, 0], [6, 0], [6, 5], [0, 5]], true),
    // Unsupported entity on a structural layer
    dxfSpline(L.slabs),
    // Tabique: double lines, faces y=2.0 / y=2.2 → centerline y=2.1, t=0.2
    dxfLine(L.walls, 0, 2.0, 6, 2.0),
    dxfLine(L.walls, 0, 2.2, 6, 2.2),
    // Grid axes
    dxfLine(L.grid, -1, 0, 7, 0),
    dxfLine(L.grid, 0, -1, 0, 6),
    // Label
    dxfText(L.text, 3, 2.5, 'PLANTA TIPO'),
    // Opening inside the slab
    dxfLwPolyline(L.openings, [[4, 3.5], [5, 3.5], [5, 4.5], [4, 4.5]], true),
    // A layer nobody recognises (must default to ignore)
    dxfLine(L.mystery, 9, 9, 10, 10),
  ].join('\n');

  return buildDxf({
    insunits: 6,
    layers: Object.values(L),
    blocks: columnBlock('COL_B'),
    entities,
  });
}
