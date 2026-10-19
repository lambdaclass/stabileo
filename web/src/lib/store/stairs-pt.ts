/**
 * Stairs and post-tensioned slabs, as the design reads them.
 *
 *  · Stairs: the project's parametric stairs (`model/stairs-pt.ts`), each designed as a one-way
 *    slab by `stairDesign`, with its reactions per metre of width, which can be put on the beams
 *    at its foot and its head as line loads on the dead and the live case (one undo step; applying
 *    again replaces what the stair put there before).
 *  · Post-tensioned slabs: the physical slabs declared `postTensioned`, each panel read in x and in
 *    y (`readSlabPanel` for the factored envelope, `panelServiceMoments` for the service moments by
 *    case), its tendons in each direction checked by `ptStripRows`, and the spacing of 8.7.2.3 once.
 *
 * The tendon system and the stairs live in the design data and are undone with it.
 */
import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { designData, patchOwnDesignData } from './design-data';
import { panelServiceMoments, readSlabPanel, type PanelReading } from './slab-panel-reading';
import { concreteFc } from '../model/design-data';
import { stairDesign, type StairDesign } from '../engine/design/slabs/stairs';
import { ptSpacingRow, ptStripRows, stressingOrder, type TendonLayout, type TendonSystem } from '../engine/design/slabs/post-tensioned';
import { worstStatus, type CheckRow } from '../design-contract';
import type { Load } from './model.svelte';
import type { PostTensionData, PtPanelChoice, StairEntry, StairSupport } from '../model/stairs-pt';

export type { StairEntry, PtPanelChoice, PostTensionData, StairSupport };

const statusOf = (rows: readonly CheckRow[]) => (rows.length ? worstStatus(rows.map((r) => r.status)) : 'notVerified');

// ─── Stairs ───

export const stairEntries = (): StairEntry[] => designData().stairs ?? [];

export function saveStair(s: StairEntry): void {
  patchOwnDesignData({ stairs: [...stairEntries().filter((x) => x.id !== s.id), s] });
}
export function removeStair(id: string): void {
  patchOwnDesignData({ stairs: stairEntries().filter((x) => x.id !== id) });
}

/** The concrete a stair is cast in: the model's first concrete material. */
function concreteOf(): { fc: number; density: number } {
  for (const m of modelStore.materials.values()) {
    const fc = concreteFc(m);
    if (fc) return { fc, density: m.rho || 25 };
  }
  return { fc: 25, density: 25 };
}

export interface StairCheck { entry: StairEntry; design: StairDesign; rows: CheckRow[]; status: CheckRow['status'] }

export function stairChecks(): StairCheck[] {
  const dd = designData(), c = concreteOf();
  return stairEntries().map((entry) => {
    const design = stairDesign(entry, { fc: c.fc, fy: dd.rebarFy, cover: dd.covers.slab, barDia: 12, distDia: 8, density: c.density });
    return { entry, design, rows: design.rows, status: statusOf(design.rows) };
  });
}

/**
 * Put a stair's reactions on the beams it lands on: per metre of beam over the stair's width,
 * downward, on the first dead and the first live case. Loads it put there before are replaced.
 * Returns how many loads were written.
 */
export function applyStairReactions(id: string, supports: { foot?: StairSupport; head?: StairSupport }): number {
  const chk = stairChecks().find((s) => s.entry.id === id);
  if (!chk) return 0;
  const tag = `stair:${id}`;
  const caseOf = (types: string[]) => modelStore.model.loadCases.find((c) => types.includes(c.type))?.id;
  const dead = caseOf(['D', '']) ?? 1, live = caseOf(['L']);
  let written = 0;
  modelStore.batch(() => {
    const kept = modelStore.loads.filter((l) => (l.data as { generatedBy?: string }).generatedBy !== tag);
    if (kept.length !== modelStore.loads.length) modelStore.replaceLoads(kept);
    const first = Math.max(0, ...modelStore.loads.map((l) => l.data.id)) + 1;
    for (const [end, s] of [['foot', supports.foot], ['head', supports.head]] as const) {
      if (!s) continue;
      const r = chk.design.reactions[end];
      for (const st of alongBeam(s.elementId, s.a, chk.entry.width)) {
        const put = (q: number, caseId: number | undefined) => {
          if (q <= 0 || caseId === undefined) return;
          modelStore.addDistributedLoad3D(st.elementId, 0, 0, -q, -q, st.from, st.to, caseId, { frame: 'global' });
          written++;
        };
        put(r.dead, dead); put(r.live, live);
      }
    }
    modelStore.replaceLoads(modelStore.loads.map((l) => (l.data.id >= first ? ({ ...l, data: { ...l.data, generatedBy: tag } } as Load) : l)));
  });
  saveStair({ ...chk.entry, supports });
  return written;
}

/**
 * The stretches of a beam a stair of `width` bears on, starting `a` from the element's node I and
 * continuing onto the collinear elements that follow it (a beam split at the slab's mesh nodes).
 */
export function alongBeam(elementId: number, a: number, width: number): Array<{ elementId: number; from: number; to: number }> {
  const out: Array<{ elementId: number; from: number; to: number }> = [];
  const pos = (id: number) => { const n = modelStore.nodes.get(id)!; return { x: n.x, y: n.y ?? 0, z: n.z ?? 0 }; };
  let e = modelStore.elements.get(elementId), start: number | undefined = e?.nodeI, offset = Math.max(a, 0), left = width;
  const seen = new Set<number>();
  if (!e) return out;
  const a0 = pos(e.nodeI), b0 = pos(e.nodeJ), L0 = Math.hypot(b0.x - a0.x, b0.y - a0.y, b0.z - a0.z);
  const dir = { x: (b0.x - a0.x) / L0, y: (b0.y - a0.y) / L0, z: (b0.z - a0.z) / L0 };
  while (e && left > 1e-9 && !seen.has(e.id)) {
    seen.add(e.id);
    const forward = e.nodeI === start;
    const p = pos(e.nodeI), q = pos(e.nodeJ), L = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    if (offset < L) {
      const len = Math.min(L - offset, left);
      out.push(forward ? { elementId: e.id, from: offset, to: offset + len } : { elementId: e.id, from: L - offset - len, to: L - offset });
      left -= len; offset = 0;
    } else offset -= L;
    const end: number = forward ? e.nodeJ : e.nodeI;
    const collinear = (x: { nodeI: number; nodeJ: number }) => {
      const u = pos(x.nodeI), v = pos(x.nodeJ), l = Math.hypot(v.x - u.x, v.y - u.y, v.z - u.z) || 1;
      return Math.abs(Math.abs(((v.x - u.x) * dir.x + (v.y - u.y) * dir.y + (v.z - u.z) * dir.z) / l) - 1) < 1e-6;
    };
    const next: typeof e | undefined = [...modelStore.elements.values()].find((x) => !seen.has(x.id) && (x.nodeI === end || x.nodeJ === end) && collinear(x));
    start = end; e = next;
  }
  return out;
}

// ─── Post-tensioned slabs ───

export const ptData = (): PostTensionData => designData().postTension ?? {};
export function setTendonSystem(system: TendonSystem | null): void {
  const { system: _old, ...rest } = ptData();
  patchOwnDesignData({ postTension: { ...rest, ...(system ? { system } : {}) } });
}
export function setPtPanel(key: string, c: PtPanelChoice | null): void {
  const panels = { ...(ptData().panels ?? {}) };
  if (c) panels[key] = c; else delete panels[key];
  patchOwnDesignData({ postTension: { ...ptData(), panels } });
}

export interface PtPanel {
  key: string; groupId: number; name: string; h: number;
  readings: Partial<Record<'x' | 'y', PanelReading>>;
  choice: PtPanelChoice | undefined;
  /** Per direction: the balancing load, kN/m², and the effective force, kN/m. */
  balance: Partial<Record<'x' | 'y', { wb: number; pe: number; wDead: number }>>;
  rows: CheckRow[]; status: CheckRow['status'];
}

/** Whether a self-weight rule loads the shells in a dead case. */
function selfWeightOn(): boolean {
  const dead = new Set(modelStore.model.loadCases.filter((c) => c.type === 'D' || c.type === '').map((c) => c.id));
  return (modelStore.model.analysis?.selfWeight ?? []).some((s) => dead.has(s.caseId) && s.direction === 'Z' && s.factor < 0);
}

const missing = (key: string, title: string): CheckRow => ({ code: 'cirsoc-201', edition: '2025', clause: '—', title, titleKey: key, formula: 'not stated', inputs: [], ratio: null, status: 'notVerified' });

export function ptPanels(): PtPanel[] {
  const pd = ptData(), dd = designData(), sw = selfWeightOn(), out: PtPanel[] = [];
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'slab' || g.physical.typology !== 'postTensioned') continue;
    const key = `S${g.id}`, choice = pd.panels?.[key];
    const rx = readSlabPanel(g, 'x'), ry = readSlabPanel(g, 'y');
    if (!rx || !ry) continue;
    const h = rx.quads[0]!.thickness, mat = modelStore.materials.get(rx.quads[0]!.materialId);
    const wSelf = (mat?.rho || 25) * h;
    const rows: CheckRow[] = [], balance: PtPanel['balance'] = {};
    if (!pd.system) rows.push(missing('check.pt.system', 'Tendon system'));
    const dirs = (['x', 'y'] as const).filter((d) => choice?.[d]);
    if (!dirs.length) rows.push(missing('check.pt.layout', 'Tendon layout'));
    if (pd.system) for (const dir of dirs) {
      const r = dir === 'x' ? rx : ry, other = dir === 'x' ? ry : rx;
      const wDead = r.dead + (sw ? wSelf : 0);
      const service = panelServiceMoments(r);
      if (wDead <= 0 || !service.length) { rows.push({ ...missing('check.pt.service', 'Service moments'), formula: 'solve the model with its dead and live cases', location: dir }); continue; }
      const factored = r.pos.map((p, i) => ({ at: p.at, pos: p.m, neg: r.neg[i]?.m ?? 0 }));
      const strip = ptStripRows(pd.system, choice![dir]!, { h, span: r.span, width: r.width, fc: r.fc, fy: dd.rebarFy, transverse: other.span, service, factored, wDead, wSelf, ...(choice?.bonded ? { bonded: choice.bonded } : {}) });
      balance[dir] = { wb: strip.wb, pe: strip.pe, wDead };
      rows.push(...strip.rows.map((x) => ({ ...x, title: `${x.title}, ${dir}`, location: x.location ? `${dir}, ${x.location}` : dir })));
    }
    if (dirs.length) rows.push(ptSpacingRow(h, dirs.map((d) => ({ dir: d, layout: choice![d]!, width: (d === 'x' ? rx : ry).width }))));
    out.push({ key, groupId: g.id, name: g.name, h, readings: { x: rx, y: ry }, choice, balance, rows, status: statusOf(rows) });
  }
  return out;
}

/**
 * The order to stress the floor: panel by panel in the order they are listed, the x tendons and
 * then the y tendons, each direction from the middle of the panel outwards.
 */
export function stressingPlan(): Array<{ key: string; name: string; dir: 'x' | 'y'; layout: TendonLayout; order: number[] }> {
  const out: Array<{ key: string; name: string; dir: 'x' | 'y'; layout: TendonLayout; order: number[] }> = [];
  for (const p of ptPanels()) for (const dir of ['x', 'y'] as const) {
    const l = p.choice?.[dir];
    if (l && l.count > 0) out.push({ key: p.key, name: p.name, dir, layout: l, order: stressingOrder(l.count) });
  }
  return out;
}
