/**
 * The characteristics tables: materials, covers, anchorages and laps per diameter, bending, and
 * one table per kind of element with its materials, cover, exposure and the lengths of the
 * diameters it uses. Filled from the project; a kind with nothing designed yet says it shows
 * typical values instead of leaving the cells blank.
 */
import type { DrawingInput } from '../compose';
import { drawTable, type TableSpec } from '../plans/table';
import type { Primitive } from '../primitives';
import type { DetailDef, Tr } from './def';
import { barLengths, ELEMENT_KINDS, tieHook, type DetailValues, type ElementKind } from './values';

type Fmt = (v: number, d: number) => string;
const n0 = (v: number) => String(Math.round(v));
const exposure = (v: DetailValues, k: ElementKind, tr: Tr) => { const x = v.exposure?.[k]; return x ? tr(`plan.det.exp.${x}`) : tr('plan.det.c.notStated'); };

/** A table under a few lines of text, in paper millimetres. */
function tableDrawing(key: string, code: string, title: string, lines: string[], spec: TableSpec): DrawingInput {
  const t = drawTable(spec), h = 2.2, lead = lines.length * h * 1.7 + (lines.length ? 2 : 0);
  const ps: Primitive[] = [...t.primitives];
  lines.forEach((l, i) => ps.push({ kind: 'text', layer: 'TB-TEXT', at: { x: 0, y: t.height + lead - (i + 1) * h * 1.7 + 0.6 }, text: l, height: h }));
  return { key, title: `${code} · ${title}`, primitives: ps, width: t.width, height: t.height + lead, origin: { x: 0, y: 0 }, paper: true };
}

const allDiameters = (v: DetailValues) => [...new Set(ELEMENT_KINDS.flatMap((k) => v.bars[k]))].sort((a, b) => a - b);
const allTies = (v: DetailValues) => [...new Set(ELEMENT_KINDS.map((k) => v.ties[k]))].sort((a, b) => a - b);

function materials(v: DetailValues, tr: Tr): DrawingInput {
  const rows = [
    [tr('plan.det.c.concrete'), `${v.concrete} (f'c = ${n0(v.fc)} MPa)`],
    [tr('plan.det.c.steel'), `${v.steel} (fy = ${n0(v.fy)} MPa)`],
    [tr('plan.det.c.code'), `CIRSOC 201-${v.edition}`],
    [tr('plan.det.c.seismic'), tr(v.seismic ? 'plan.det.c.yes' : 'plan.det.c.no')],
    ...ELEMENT_KINDS.map((k) => [`${tr('plan.det.c.exposure')} · ${tr(`plan.det.kind.${k}`)}`, exposure(v, k, tr)]),
  ];
  return tableDrawing('detail-chars-materials', 'T-01', tr('plan.det.chars-materials.t'), [], { columns: [{ label: tr('plan.det.c.item'), width: 55 }, { label: tr('plan.det.c.value'), width: 60 }], rows });
}

function covers(v: DetailValues, tr: Tr): DrawingInput {
  const rows = ELEMENT_KINDS.map((k) => [tr(`plan.det.kind.${k}`), `${v.cover[k]}`, exposure(v, k, tr)]);
  return tableDrawing('detail-chars-covers', 'T-02', tr('plan.det.chars-covers.t'), [], { columns: [{ label: tr('plan.det.c.element'), width: 40 }, { label: tr('plan.det.c.coverMm'), width: 30, align: 'right' }, { label: tr('plan.det.c.exposure'), width: 45 }], rows });
}

function anchorage(v: DetailValues, tr: Tr, ds = allDiameters(v), key = 'detail-chars-anchorage', code = 'T-03', title = tr('plan.det.chars-anchorage.t'), lead: string[] = [tr('plan.det.c.anchorageNote')]): DrawingInput {
  const cols = [{ label: 'Ø', width: 12, align: 'right' as const }, { label: 'ld', width: 16, align: 'right' as const }, { label: 'ld sup', width: 18, align: 'right' as const }, { label: 'lst', width: 16, align: 'right' as const }, { label: 'lst sup', width: 18, align: 'right' as const }, { label: 'ldh', width: 16, align: 'right' as const }, { label: 'ldc', width: 16, align: 'right' as const }, { label: tr('plan.det.c.lapC'), width: 22, align: 'right' as const }, ...(v.seismic ? [{ label: tr('plan.det.c.ldhSeismic'), width: 26, align: 'right' as const }] : [])];
  const rows = ds.map((d) => { const L = barLengths(v, d); return [`${d}`, n0(L.ld), n0(L.ldTop), n0(L.lap), n0(L.lapTop), n0(L.ldh), n0(L.ldc), n0(L.lapC), ...(v.seismic ? [n0(L.ldhSeismic)] : [])]; });
  return tableDrawing(key, code, title, lead, { columns: cols, rows });
}

function bending(v: DetailValues, tr: Tr): DrawingInput {
  const rows = allDiameters(v).map((d) => { const L = barLengths(v, d); return [`${d}`, n0(L.mandrel), n0(L.hook90), n0(L.hook180)]; });
  const tieRows = allTies(v).map((t) => { const h = tieHook(t); return [`${t}`, n0(h.mandrel), '—', `135°: ${n0(h.ext)}`]; });
  return tableDrawing('detail-chars-bending', 'T-04', tr('plan.det.chars-bending.t'), [tr('plan.det.c.bendingNote')], {
    columns: [{ label: 'Ø', width: 12, align: 'right' }, { label: tr('plan.det.c.mandrel'), width: 28, align: 'right' }, { label: tr('plan.det.c.hook90'), width: 26, align: 'right' }, { label: tr('plan.det.c.hook180'), width: 30, align: 'right' }],
    rows: [...rows, [tr('plan.det.c.ties'), '', '', ''], ...tieRows],
  });
}

function perKind(k: ElementKind, code: string, v: DetailValues, tr: Tr): DrawingInput {
  const lines = [
    `${tr('plan.det.c.concrete')}: ${v.concrete} · ${tr('plan.det.c.steel')}: ${v.steel}`,
    `${tr('plan.det.c.cover')}: ${v.cover[k]} mm · ${tr('plan.det.c.exposure')}: ${exposure(v, k, tr)}`,
    `${tr('plan.det.c.barsUsed')}: ${v.bars[k].map((d) => `Ø${d}`).join(', ')} · ${tr('plan.det.c.tie')}: Ø${v.ties[k]}`,
    ...(v.typical.includes(k) ? [tr('plan.det.c.typical')] : []),
  ];
  return anchorage(v, tr, [...v.bars[k]].sort((a, b) => a - b), `detail-chars-${k}`, code, tr(`plan.det.chars-${k}.t`), lines);
}

const KIND_TARGET: Record<ElementKind, string> = { slab: 'slabs', beam: 'beams', column: 'columns', wall: 'walls', footing: 'foundations', stair: 'stairs' };
const table = (id: string, code: string, target: string, f: (v: DetailValues, tr: Tr, fmt: Fmt) => DrawingInput): DetailDef => ({ id, code, family: 'tables', target, draw: f, render: (v, tr, fmt) => ({ drawing: f(v, tr, fmt), note: tr(`plan.det.${id}.n`) }) });

export const TABLES: DetailDef[] = [
  table('chars-materials', 'T-01', 'notes', (v, tr) => materials(v, tr)),
  table('chars-covers', 'T-02', 'notes', (v, tr) => covers(v, tr)),
  table('chars-anchorage', 'T-03', 'notes', (v, tr) => anchorage(v, tr)),
  table('chars-bending', 'T-04', 'notes', (v, tr) => bending(v, tr)),
  ...ELEMENT_KINDS.map((k, i) => table(`chars-${k}`, `T-${String(5 + i).padStart(2, '0')}`, KIND_TARGET[k], (v, tr) => perKind(k, `T-${String(5 + i).padStart(2, '0')}`, v, tr))),
];
