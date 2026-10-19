/**
 * The design as tables for other programs: the decisions and results of each element and every
 * check (two sheets of the project workbook), and the forces of each physical member, element by
 * element along it, for every solved case and combination (a CSV of its own, also a sheet).
 *
 * A physical member is a physical group of the model (a beam line, a column stack); a bar that
 * belongs to none is its own member. Its elements are ordered along it and each carries its
 * distance from the member's start, so a spreadsheet can plot the member's diagrams whole.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { physicalGroups } from './physical';
import { memoriaInput } from './memoria-inputs';
import { CAUTIOUS_FAMILIES, memoElementState } from '../report/memoria/types';
import { toCsv } from '../engine/result-tables';
import { safeText, type WorkbookSheet } from '../export/workbook-cells';

type Tr = (key: string, params?: Record<string, string | number>) => string;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** One row per designed element and one per check, in the language of the export. */
export function designSheets(tr: Tr, locale: string): WorkbookSheet[] {
  const m = memoriaInput(tr, locale);
  /*
   * Two scopes, named in the headers: a check row's status is a LOCAL check of the section; the
   * element's state is the member's verdict (`memoElementState`: its rows and what holds it, the
   * holds listed in `held by`). A row reading ok never stands for the element.
   */
  const elements: WorkbookSheet['rows'] = [['element', 'family', 'level', 'governing check', 'clause', 'worst local utilization', 'member state', 'checks', 'held by']];
  const checks: WorkbookSheet['rows'] = [['element', 'family', 'check', 'code', 'clause', 'formula', 'demand', 'capacity', 'unit', 'utilization', 'local check status', 'combination', 'location']];
  for (const e of m.elements) {
    const gov = e.rows.reduce<typeof e.rows[number] | undefined>((a, r) => (!a || (r.status === 'fail' && a.status !== 'fail') || ((r.ratio ?? -1) > (a.ratio ?? -1) && (r.status === 'fail') === (a.status === 'fail')) ? r : a), undefined);
    const steel = CAUTIOUS_FAMILIES.has(e.family);
    // A row not evaluated, or a hold of the member's verdict, is not a pass (`memoElementState`).
    const st = memoElementState(e);
    elements.push([safeText(e.name), e.family, safeText(e.level ?? ''), safeText(gov ? (gov.titleKey ? tr(gov.titleKey) : gov.title) : ''), gov?.clause ?? '',
      gov?.ratio !== null && gov?.ratio !== undefined && Number.isFinite(gov.ratio) ? r4(gov.ratio) : '',
      tr(st === 'none' ? 'memo.state.none' : st === 'fail' ? (steel ? 'memo.state.steelFail' : 'memo.state.fail') : st === 'open' ? 'memo.state.open' : (steel ? 'memo.state.steelOk' : 'memo.state.ok')), e.rows.length,
      safeText((e.heldBy ?? []).join('; '))]);
    for (const r of e.rows) {
      checks.push([safeText(e.name), e.family, safeText(r.titleKey ? tr(r.titleKey) : r.title), r.code, r.clause ?? '', safeText(r.formula ?? ''),
        r.demand ?? '', r.capacity ?? '', r.unit ?? '', r.ratio !== null && Number.isFinite(r.ratio) ? r4(r.ratio) : '', r.status, safeText(r.combination ?? ''), safeText(r.location ?? '')]);
    }
  }
  // The project's verdict, its own sheet: the element and check sheets are never read as it.
  const verdict: WorkbookSheet['rows'] = [['project state', 'reason'], [safeText(m.verdict?.text ?? ''), ''], ...(m.verdict?.reasons ?? []).map((r) => ['', safeText(r)])];
  return [{ name: 'Design elements', rows: elements }, { name: 'Design checks', rows: checks }, { name: 'Design verdict', rows: verdict }];
}

/** The physical members: their elements in order along them, with each element's start distance. */
export function physicalMembers(): Array<{ name: string; kind: string; elements: Array<{ id: number; at: number; length: number }> }> {
  const m = modelStore.model, nodes = m.nodes;
  const P = (id: number) => nodes.get(id);
  const len = (id: number) => { const e = m.elements.get(id), a = e && P(e.nodeI), b = e && P(e.nodeJ); return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0; };
  const out: Array<{ name: string; kind: string; elements: Array<{ id: number; at: number; length: number }> }> = [];
  const used = new Set<number>();
  for (const g of physicalGroups()) {
    const ids = (g.members.elements ?? []).filter((id) => m.elements.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => used.add(id));
    // Ordered from one end: by distance of each element's first node from the group's extreme node.
    const pts = ids.flatMap((id) => { const e = m.elements.get(id)!; return [P(e.nodeI), P(e.nodeJ)]; }).filter((p): p is NonNullable<typeof p> => !!p);
    const origin = pts.reduce((a, p) => ((p.z ?? 0) < (a.z ?? 0) - 1e-9 || (Math.abs((p.z ?? 0) - (a.z ?? 0)) < 1e-9 && (p.x < a.x - 1e-9 || (Math.abs(p.x - a.x) < 1e-9 && p.y < a.y))) ? p : a));
    const dist = (id: number) => { const e = m.elements.get(id)!, a = P(e.nodeI)!, b = P(e.nodeJ)!; const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 }; return Math.hypot(c.x - origin.x, c.y - origin.y, c.z - (origin.z ?? 0)); };
    const sorted = [...ids].sort((p, q) => dist(p) - dist(q));
    let at = 0;
    out.push({ name: g.name, kind: g.physical.kind, elements: sorted.map((id) => { const L = len(id), r = { id, at: r4(at), length: r4(L) }; at += L; return r; }) });
  }
  for (const e of m.elements.values()) if (!used.has(e.id)) out.push({ name: e.name || `E${e.id}`, kind: 'element', elements: [{ id: e.id, at: 0, length: r4(len(e.id)) }] });
  return out;
}

/** The forces of every physical member, element by element, under every solved case and combination. */
export function physicalForceRows(): WorkbookSheet['rows'] {
  const m = modelStore.model;
  const caseName = new Map(m.loadCases.map((c) => [c.id, c.name]));
  const comboName = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
  const sources = [
    ...[...resultsStore.perCase3D].map(([id, r]) => ({ kind: 'case', name: caseName.get(id) ?? String(id), r })),
    ...[...resultsStore.perCombo3D].map(([id, r]) => ({ kind: 'combination', name: comboName.get(id) ?? String(id), r })),
  ];
  if (sources.length === 0 && resultsStore.results3D) sources.push({ kind: 'single', name: 'solve', r: resultsStore.results3D });
  const rows: WorkbookSheet['rows'] = [['member', 'kind', 'element', 'x start (m)', 'length (m)', 'source', 'name',
    'N i (kN)', 'Vy i (kN)', 'Vz i (kN)', 'T i (kN·m)', 'My i (kN·m)', 'Mz i (kN·m)', 'N j (kN)', 'Vy j (kN)', 'Vz j (kN)', 'T j (kN·m)', 'My j (kN·m)', 'Mz j (kN·m)']];
  const members = physicalMembers();
  for (const src of sources) {
    const by = new Map(src.r.elementForces.map((f) => [f.elementId, f]));
    for (const pm of members) for (const el of pm.elements) {
      const f = by.get(el.id);
      if (!f) continue;
      rows.push([safeText(pm.name), pm.kind, el.id, el.at, el.length, src.kind, safeText(src.name),
        r4(f.nStart), r4(f.vyStart), r4(f.vzStart), r4(f.mxStart), r4(f.myStart), r4(f.mzStart), r4(f.nEnd), r4(f.vyEnd), r4(f.vzEnd), r4(f.mxEnd), r4(f.myEnd), r4(f.mzEnd)]);
    }
  }
  return rows;
}

export const physicalForcesCsv = () => { const rows = physicalForceRows(); return toCsv(rows[0]!.map(String), rows.slice(1)); };
