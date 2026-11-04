/**
 * A sheet as DXF R12 (AC1009), in paper millimetres: the declared layer table with its line types,
 * the geometry, and every dimension as a DIMENSION entity whose anonymous block holds its lines and
 * text (what R12 readers draw). Text is written as it is; the code page is ANSI 1252.
 */
import { dimensionGeometry, type Primitive } from './primitives';
import { LAYERS, layerDef, type LayerStyle } from './layers';

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

export function sheetToDxf(ps: readonly Primitive[], layerOf: LayerStyle = layerDef): string {
  const o: string[] = [];
  const w = (...kv: Array<string | number>) => { for (const x of kv) o.push(String(x)); };
  w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$DWGCODEPAGE', 3, 'ANSI_1252', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'TABLES');
  w(0, 'TABLE', 2, 'LTYPE', 70, 2);
  w(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, '0.0');
  w(0, 'LTYPE', 2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, '5.0', 49, '3.0', 49, '-2.0');
  w(0, 'ENDTAB');
  const used = new Set(ps.map((p) => p.layer));
  const layers = [...LAYERS.filter((l) => used.has(l.name) || l.name.startsWith('SHEET')), ...[...used].filter((u) => !LAYERS.some((l) => l.name === u)).map((name) => layerOf(name))].map((l) => layerOf(l.name));
  w(0, 'TABLE', 2, 'LAYER', 70, layers.length);
  for (const l of layers) w(0, 'LAYER', 2, l.name, 70, 0, 62, l.color, 6, l.dashed ? 'DASHED' : 'CONTINUOUS');
  w(0, 'ENDTAB', 0, 'ENDSEC');
  // Blocks: one anonymous block per dimension.
  const dims = ps.filter((p): p is Extract<Primitive, { kind: 'dimension' }> => p.kind === 'dimension');
  w(0, 'SECTION', 2, 'BLOCKS');
  dims.forEach((d, i) => {
    const g = dimensionGeometry(d), name = `*D${i + 1}`;
    w(0, 'BLOCK', 8, '0', 2, name, 70, 1, 10, 0, 20, 0, 30, 0, 3, name);
    for (const [a, b] of [...g.ext, g.line]) w(0, 'LINE', 8, d.layer, 10, n(a.x), 20, n(a.y), 30, 0, 11, n(b.x), 21, n(b.y), 31, 0);
    for (const e of g.line) w(0, 'LINE', 8, d.layer, 10, n(e.x - 0.8), 20, n(e.y - 0.8), 30, 0, 11, n(e.x + 0.8), 21, n(e.y + 0.8), 31, 0);
    w(0, 'TEXT', 8, d.layer, 10, n(g.textAt.x), 20, n(g.textAt.y), 30, 0, 40, n(d.height ?? 2.5), 1, d.text ?? `${Math.round(g.length)}`, 50, n(g.angle), 72, 1, 11, n(g.textAt.x), 21, n(g.textAt.y), 31, 0);
    w(0, 'ENDBLK', 8, '0');
  });
  w(0, 'ENDSEC');
  w(0, 'SECTION', 2, 'ENTITIES');
  let k = 0;
  for (const p of ps) {
    switch (p.kind) {
      case 'line': w(0, 'LINE', 8, p.layer, 10, n(p.a.x), 20, n(p.a.y), 30, 0, 11, n(p.b.x), 21, n(p.b.y), 31, 0); break;
      case 'polyline':
        w(0, 'POLYLINE', 8, p.layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, p.closed ? 1 : 0);
        for (const q of p.points) w(0, 'VERTEX', 8, p.layer, 10, n(q.x), 20, n(q.y), 30, 0);
        w(0, 'SEQEND', 8, p.layer);
        break;
      case 'circle': w(0, 'CIRCLE', 8, p.layer, 10, n(p.c.x), 20, n(p.c.y), 30, 0, 40, n(p.r)); break;
      case 'arc': w(0, 'ARC', 8, p.layer, 10, n(p.c.x), 20, n(p.c.y), 30, 0, 40, n(p.r), 50, n(p.start), 51, n(p.end)); break;
      case 'text': {
        const al = p.align === 'center' ? 1 : p.align === 'right' ? 2 : 0;
        w(0, 'TEXT', 8, p.layer, 10, n(p.at.x), 20, n(p.at.y), 30, 0, 40, n(p.height), 1, p.text, 50, n(p.rotation ?? 0));
        if (al) w(72, al, 11, n(p.at.x), 21, n(p.at.y), 31, 0);
        break;
      }
      case 'dimension': {
        const g = dimensionGeometry(p);
        k++;
        w(0, 'DIMENSION', 8, p.layer, 2, `*D${k}`, 10, n(g.line[1].x), 20, n(g.line[1].y), 30, 0, 11, n(g.textAt.x), 21, n(g.textAt.y), 31, 0, 70, 1, 1, p.text ?? '', 13, n(p.a.x), 23, n(p.a.y), 33, 0, 14, n(p.b.x), 24, n(p.b.y), 34, 0);
        break;
      }
    }
  }
  w(0, 'ENDSEC', 0, 'EOF');
  return o.join('\n') + '\n';
}
