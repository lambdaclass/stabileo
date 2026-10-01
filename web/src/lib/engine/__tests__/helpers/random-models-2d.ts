/**
 * Seeded generators of plane models, built through the model store the way the
 * UI builds them. Used by the advanced-analysis sweep (advanced-sweep-2d.test.ts).
 *
 * Every generator takes a seed and returns what it built, so a failure names a
 * reproducible case: `gable#17` is `generate('gable', 17)`.
 *
 * Families: continuous beams (overhangs, springs, settlements), multi-storey
 * multi-bay frames (inclined legs, hinges), gable frames, arches, trusses
 * (Pratt / Howe / Warren / K / irregular), mixed frame + truss, cantilevers.
 * Loads: uniform, triangular, trapezoidal, partial, point (local, global,
 * angled), point moments, nodal forces and moments, thermal. Sections: the
 * default IPN 300, a very stiff and a very flexible rectangle.
 */
import { modelStore } from '../../../store';

export type Rng = ReturnType<typeof rng>;

/** A small seeded LCG (the same as the explained-methods sweep). */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  // Warm up so nearby seeds diverge.
  for (let i = 0; i < 3; i++) next();
  return {
    next,
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    real: (a: number, b: number, step = 0.5) => a + step * Math.floor((next() * (b - a)) / step + 0.5),
    chance: (p: number) => next() < p,
  };
}

export interface GenMeta {
  family: Family;
  seed: number;
  label: string;
  /** Loads that do not scale with E (a temperature, a settlement). */
  thermal: boolean;
  settlement: boolean;
  springs: boolean;
  inclinedSupport: boolean;
  hinges: boolean;
  /** Only truss members. */
  pureTruss: boolean;
}

export const FAMILIES = ['beam', 'frame', 'gable', 'arch', 'truss', 'mixed', 'cantilever'] as const;
export type Family = typeof FAMILIES[number];

interface Ctx { r: Rng; meta: GenMeta; secs: number[] }

/** Sections: 1 = IPN 300 (default), plus a stiff and a flexible rectangle. */
function addSections(r: Rng): number[] {
  const rect = (name: string, b: number, h: number) => modelStore.addSection({
    name, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12, b, h, shape: 'rect',
  } as never);
  const stiff = rect('R 60x120', 0.6, 1.2);
  const flex = rect('R 8x8', 0.08, 0.08);
  const mid = rect('R 20x40', 0.2, 0.4);
  // Most members keep the default; the others are drawn at random per model.
  return r.chance(0.5) ? [1, 1, 1, mid] : [1, stiff, flex, mid];
}

function member(c: Ctx, a: number, b: number, type: 'frame' | 'truss' = 'frame'): number {
  const id = c.r.chance(0.3) ? modelStore.addElement(b, a, type) : modelStore.addElement(a, b, type);
  const sec = c.r.pick(c.secs);
  if (sec !== 1) modelStore.updateElement(id, { sectionId: sec });
  return id;
}

function length(id: number): number {
  const e = modelStore.elements.get(id)!;
  const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** One load of a random kind on a member, local or global. */
function spanLoad(c: Ctx, e: number) {
  const { r } = c;
  const L = length(e);
  const kind = r.int(0, 8);
  const w = -r.real(5, 30, 5);
  const glob = r.chance(0.3);
  const lim = (x: number) => Math.min(L - 0.05, Math.max(0.05, x));
  switch (kind) {
    case 0: modelStore.addDistributedLoad(e, w, w, undefined, glob || undefined); break;
    case 1: modelStore.addDistributedLoad(e, 0, w, undefined, glob || undefined); break;
    case 2: modelStore.addDistributedLoad(e, w / 2, w, undefined, glob || undefined); break;
    case 3: {
      const a = lim(r.next() * L * 0.5);
      const b = lim(a + Math.max(0.2, r.next() * (L - a)));
      if (b > a + 0.1) modelStore.addDistributedLoad(e, w, w * r.real(0, 2, 0.5), undefined, glob || undefined, undefined, a, b);
      else modelStore.addDistributedLoad(e, w, w);
      break;
    }
    case 4: modelStore.addPointLoadOnElement(e, lim(r.next() * L), -r.real(10, 60, 5), glob ? { isGlobal: true } : undefined); break;
    case 5: modelStore.addPointLoadOnElement(e, lim(r.next() * L), 0, { my: r.pick([-1, 1]) * r.real(5, 40, 5) }); break;
    case 6: modelStore.addPointLoadOnElement(e, lim(r.next() * L), -r.real(10, 40, 5), { angle: r.pick([15, 30, -45, 60]) }); break;
    case 7: modelStore.addDistributedLoad(e, w, w, r.pick([20, -30, 45]), true); break;
    case 8: modelStore.addPointLoadOnElement(e, lim(r.next() * L), -r.real(10, 40, 5), { px: r.real(-20, 20, 5) }); break;
  }
}

function maybeThermal(c: Ctx, els: number[]) {
  if (!c.r.chance(0.12)) return;
  const e = c.r.pick(els);
  modelStore.addThermalLoad(e, c.r.real(-30, 40, 5), c.r.real(-20, 20, 5));
  c.meta.thermal = true;
}

// ── Families ─────────────────────────────────────────────────────

function beam(c: Ctx) {
  const { r } = c;
  const spans = r.int(1, 5);
  const xs = [0];
  const overL = r.chance(0.3) ? r.real(1, 2.5) : 0;
  const overR = r.chance(0.3) ? r.real(1, 2.5) : 0;
  const long = r.chance(0.15);
  if (overL) xs.push(overL);
  for (let k = 0; k < spans; k++) xs.push(xs[xs.length - 1] + (long ? r.real(10, 25) : r.real(1.5, 8)));
  if (overR) xs.push(xs[xs.length - 1] + overR);
  const nodes = xs.map((x) => modelStore.addNode(x, 0));
  const els: number[] = [];
  for (let k = 0; k + 1 < nodes.length; k++) els.push(member(c, nodes[k], nodes[k + 1]));
  const first = overL ? 1 : 0, last = nodes.length - 1 - (overR ? 1 : 0);
  modelStore.addSupport(nodes[first], r.pick(['pinned', 'fixed', 'pinned'] as const));
  for (let k = first + 1; k < last; k++) {
    if (r.chance(0.2)) { modelStore.addSupport(nodes[k], 'spring', { ky: r.pick([1e3, 1e4, 1e5]) }); c.meta.springs = true; }
    else modelStore.addSupport(nodes[k], 'rollerX');
  }
  if (last > first) {
    const t = r.pick(['rollerX', 'fixed', 'rollerX', 'pinned', 'spring', 'inclined'] as const);
    if (t === 'spring') { modelStore.addSupport(nodes[last], 'spring', { ky: 5e4, kz: r.chance(0.5) ? 2e4 : undefined }); c.meta.springs = true; }
    else if (t === 'inclined') { modelStore.addSupport(nodes[last], 'rollerX', undefined, { angle: r.pick([15, 30, -20]) }); c.meta.inclinedSupport = true; }
    else modelStore.addSupport(nodes[last], t);
  }
  // A settlement at one support.
  if (r.chance(0.12)) {
    const k = r.int(first, last);
    const sup = [...modelStore.supports.values()].find((s) => s.nodeId === nodes[k]);
    if (sup && sup.type !== 'spring') { modelStore.updateSupport(sup.id, { dz: -0.01 }); c.meta.settlement = true; }
  }
  // Gerber hinges (only where the beam stays stable: next to an interior support).
  if (spans >= 3 && r.chance(0.2)) {
    const k = first + 1 + r.int(0, spans - 3);
    const eid = els[k];
    const e = modelStore.elements.get(eid)!;
    modelStore.toggleHinge(eid, e.nodeI === nodes[k + 1] ? 'start' : 'end');
    c.meta.hinges = true;
  }
  for (const e of els) if (r.chance(0.8)) spanLoad(c, e);
  if (overR && r.chance(0.5)) modelStore.addNodalLoad(nodes[nodes.length - 1], 0, -r.real(5, 20, 5), r.chance(0.3) ? 10 : 0);
  if (r.chance(0.2)) modelStore.addNodalLoad(nodes[r.int(0, nodes.length - 1)], r.real(-10, 10, 5), 0, r.real(-20, 20, 5));
  maybeThermal(c, els);
}

function frame(c: Ctx) {
  const { r } = c;
  const bays = r.int(1, 3), stories = r.int(1, 4);
  const ws = Array.from({ length: bays }, () => r.real(3, 8));
  const hs = Array.from({ length: stories }, () => r.real(2.5, 4.5));
  const lean = r.chance(0.25) ? r.real(-1.5, 1.5) : 0; // inclined first-storey left leg
  const grid: number[][] = [];
  for (let j = 0; j <= stories; j++) {
    grid.push([]);
    let x = 0;
    const y = hs.slice(0, j).reduce((a, b) => a + b, 0);
    for (let i = 0; i <= bays; i++) {
      grid[j].push(modelStore.addNode(j === 0 && i === 0 ? x + lean : x, y));
      if (i < bays) x += ws[i];
    }
  }
  const beams: number[] = [], cols: number[] = [];
  for (let j = 1; j <= stories; j++) {
    for (let i = 0; i <= bays; i++) cols.push(member(c, grid[j - 1][i], grid[j][i]));
    for (let i = 0; i < bays; i++) beams.push(member(c, grid[j][i], grid[j][i + 1]));
  }
  const allPinned = r.chance(0.2);
  for (let i = 0; i <= bays; i++) modelStore.addSupport(grid[0][i], allPinned ? 'pinned' : r.pick(['fixed', 'fixed', 'pinned'] as const));
  if (allPinned && bays === 1 && stories === 1) modelStore.addSupport(grid[0][0], 'fixed');
  // Beam-end hinges on some beams (a fixed-base frame stays stable).
  if (!allPinned && r.chance(0.25)) {
    const b = r.pick(beams);
    modelStore.toggleHinge(b, r.pick(['start', 'end'] as const));
    c.meta.hinges = true;
  }
  // A diagonal brace (truss) in one bay.
  if (r.chance(0.2)) member(c, grid[0][0], grid[1][1 % (bays + 1)], 'truss');
  for (const b of beams) if (r.chance(0.85)) spanLoad(c, b);
  for (let j = 1; j <= stories; j++) if (r.chance(0.6)) modelStore.addNodalLoad(grid[j][0], r.real(5, 30, 5), 0, 0);
  if (r.chance(0.15)) modelStore.addNodalLoad(grid[stories][bays], 0, 0, r.real(-30, 30, 10));
  if (r.chance(0.15)) spanLoad(c, r.pick(cols));
  maybeThermal(c, beams);
}

function gable(c: Ctx) {
  const { r } = c;
  const span = r.real(8, 24), h = r.real(3, 7), rise = r.real(1, 5);
  const n0 = modelStore.addNode(0, 0), n1 = modelStore.addNode(0, h);
  const n2 = modelStore.addNode(span / 2, h + rise);
  const n3 = modelStore.addNode(span, h), n4 = modelStore.addNode(span, 0);
  const c1 = member(c, n0, n1), r1 = member(c, n1, n2), r2 = member(c, n2, n3), c2 = member(c, n3, n4);
  const base = r.pick(['fixed', 'pinned'] as const);
  modelStore.addSupport(n0, base);
  modelStore.addSupport(n4, r.chance(0.2) && base === 'fixed' ? 'rollerX' : base);
  // Three-hinged: a hinge at the apex (only on a pinned-base frame it gives the classic one).
  if (r.chance(0.35)) {
    const e = modelStore.elements.get(r1)!;
    modelStore.toggleHinge(r1, e.nodeI === n2 ? 'start' : 'end');
    c.meta.hinges = true;
  }
  for (const e of [r1, r2]) if (r.chance(0.9)) {
    if (r.chance(0.5)) modelStore.addDistributedLoad(e, -r.real(3, 15, 1), undefined, undefined, true);
    else spanLoad(c, e);
  }
  if (r.chance(0.6)) modelStore.addNodalLoad(n1, r.real(5, 25, 5), 0, 0);
  if (r.chance(0.3)) modelStore.addDistributedLoad(c1, r.real(1, 5, 1));
  if (r.chance(0.2)) modelStore.addNodalLoad(n2, 0, -r.real(10, 50, 10), 0);
  void c2;
  maybeThermal(c, [r1, r2]);
}

function arch(c: Ctx) {
  const { r } = c;
  const nSeg = r.int(4, 12), span = r.real(8, 30), rise = r.real(2, 8);
  const ids: number[] = [];
  for (let k = 0; k <= nSeg; k++) {
    const x = (k * span) / nSeg;
    ids.push(modelStore.addNode(x, (4 * rise * x * (span - x)) / span ** 2));
  }
  const els: number[] = [];
  for (let k = 0; k < nSeg; k++) els.push(member(c, ids[k], ids[k + 1]));
  const kind = r.pick(['twoHinged', 'fixed', 'threeHinged', 'tied'] as const);
  if (kind === 'fixed') { modelStore.addSupport(ids[0], 'fixed'); modelStore.addSupport(ids[nSeg], 'fixed'); }
  else if (kind === 'tied') { modelStore.addSupport(ids[0], 'pinned'); modelStore.addSupport(ids[nSeg], 'rollerX'); member(c, ids[0], ids[nSeg], 'truss'); }
  else { modelStore.addSupport(ids[0], 'pinned'); modelStore.addSupport(ids[nSeg], 'pinned'); }
  if (kind === 'threeHinged' && nSeg % 2 === 0) {
    const e = modelStore.elements.get(els[nSeg / 2])!;
    modelStore.toggleHinge(els[nSeg / 2], e.nodeI === ids[nSeg / 2] ? 'start' : 'end');
    c.meta.hinges = true;
  }
  for (let k = 1; k < nSeg; k++) if (r.chance(0.6)) modelStore.addNodalLoad(ids[k], 0, -r.real(5, 30, 5), 0);
  if (r.chance(0.4)) modelStore.addDistributedLoad(r.pick(els), -r.real(2, 10, 1), undefined, undefined, true);
  if (r.chance(0.3)) modelStore.addNodalLoad(ids[r.int(1, nSeg - 1)], r.real(5, 15, 5), 0, 0);
  maybeThermal(c, els);
}

function truss(c: Ctx) {
  const { r } = c;
  c.meta.pureTruss = true;
  const panels = r.int(2, 8), a = r.real(1.5, 4), h = r.real(1.5, 4);
  const style = r.pick(['pratt', 'howe', 'warren', 'k', 'irregular'] as const);
  const t = (i: number, j: number) => member(c, i, j, 'truss');
  const bottom = Array.from({ length: panels + 1 }, (_, i) => modelStore.addNode(i * a, 0));
  let loadNodes: number[] = [];
  if (style === 'warren') {
    const top = Array.from({ length: panels }, (_, i) => modelStore.addNode((i + 0.5) * a, h));
    for (let i = 0; i < panels; i++) t(bottom[i], bottom[i + 1]);
    for (let i = 0; i + 1 < top.length; i++) t(top[i], top[i + 1]);
    for (let i = 0; i < panels; i++) { t(bottom[i], top[i]); t(top[i], bottom[i + 1]); }
    loadNodes = top;
  } else if (style === 'k') {
    const top = Array.from({ length: panels + 1 }, (_, i) => modelStore.addNode(i * a, h));
    const mid = Array.from({ length: panels - 1 }, (_, i) => modelStore.addNode((i + 1) * a, h / 2));
    for (let i = 0; i < panels; i++) { t(bottom[i], bottom[i + 1]); t(top[i], top[i + 1]); }
    t(bottom[0], top[0]); t(bottom[panels], top[panels]);
    for (let i = 1; i < panels; i++) {
      const m = mid[i - 1];
      t(bottom[i], m); t(m, top[i]);
      const toward = i <= panels / 2 ? i - 1 : i + 1;
      t(m, bottom[toward]); t(m, top[toward]);
    }
    // The K's point away from the middle panel, which needs a diagonal of its own.
    const mc = Math.floor(panels / 2);
    t(bottom[mc], top[mc + 1]);
    loadNodes = top;
  } else {
    const top = Array.from({ length: panels - 1 }, (_, i) => modelStore.addNode((i + 1) * a, style === 'irregular' ? h * (0.6 + 0.8 * r.next()) : h));
    for (let i = 0; i < panels; i++) t(bottom[i], bottom[i + 1]);
    for (let i = 0; i + 1 < top.length; i++) t(top[i], top[i + 1]);
    t(bottom[0], top[0]); t(top[top.length - 1], bottom[panels]);
    for (let i = 0; i < top.length; i++) t(bottom[i + 1], top[i]);
    const mid = panels / 2;
    for (let i = 0; i + 1 < top.length; i++) {
      const pratt = style !== 'howe';
      const left = i + 1 < mid;
      if (pratt === left) t(top[i], bottom[i + 2]); else t(bottom[i + 1], top[i + 1]);
    }
    loadNodes = top;
  }
  const sup = r.pick(['pr', 'pp', 'inclined', 'spring'] as const);
  modelStore.addSupport(bottom[0], 'pinned');
  if (sup === 'pr') modelStore.addSupport(bottom[panels], 'rollerX');
  else if (sup === 'pp') modelStore.addSupport(bottom[panels], 'pinned');
  else if (sup === 'inclined') { modelStore.addSupport(bottom[panels], 'rollerX', undefined, { angle: r.pick([20, -30]) }); c.meta.inclinedSupport = true; }
  else { modelStore.addSupport(bottom[panels], 'spring', { kx: 1e4, ky: 1e5 }); c.meta.springs = true; }
  for (const n of loadNodes) if (r.chance(0.8)) modelStore.addNodalLoad(n, r.chance(0.2) ? r.real(-10, 10, 5) : 0, -r.real(10, 40, 5), 0);
  for (const n of bottom.slice(1, -1)) if (r.chance(0.3)) modelStore.addNodalLoad(n, 0, -r.real(5, 20, 5), 0);
  if (r.chance(0.1)) {
    modelStore.addThermalLoad(r.pick([...modelStore.elements.keys()]), r.real(10, 40, 5), 0);
    c.meta.thermal = true;
  }
}

function mixed(c: Ctx) {
  const { r } = c;
  const kind = r.pick(['kingpost', 'queenpost', 'bracedFrame'] as const);
  if (kind === 'bracedFrame') {
    const w = r.real(4, 8), h = r.real(3, 5);
    const n0 = modelStore.addNode(0, 0), n1 = modelStore.addNode(0, h), n2 = modelStore.addNode(w, h), n3 = modelStore.addNode(w, 0);
    member(c, n0, n1); const b = member(c, n1, n2); member(c, n2, n3);
    member(c, n0, n2, 'truss');
    if (r.chance(0.5)) member(c, n1, n3, 'truss');
    modelStore.addSupport(n0, 'pinned'); modelStore.addSupport(n3, 'pinned');
    // Columns pinned to the beam: a braced pin-jointed frame.
    if (r.chance(0.5)) { modelStore.toggleHinge(b, 'start'); modelStore.toggleHinge(b, 'end'); c.meta.hinges = true; }
    spanLoad(c, b);
    modelStore.addNodalLoad(n1, r.real(5, 30, 5), 0, 0);
    return;
  }
  // A beam trussed from below: post(s) and ties are truss bars, their bottom node is truss-only.
  const L = r.real(6, 16), d = r.real(0.8, 2);
  const n0 = modelStore.addNode(0, 0), nE = modelStore.addNode(L, 0);
  const tops = kind === 'kingpost' ? [modelStore.addNode(L / 2, 0)] : [modelStore.addNode(L / 3, 0), modelStore.addNode((2 * L) / 3, 0)];
  const bots = tops.map((n) => modelStore.addNode(modelStore.nodes.get(n)!.x, -d));
  const chain = [n0, ...tops, nE];
  const beams: number[] = [];
  for (let k = 0; k + 1 < chain.length; k++) beams.push(member(c, chain[k], chain[k + 1]));
  tops.forEach((tn, k) => member(c, tn, bots[k], 'truss'));
  member(c, n0, bots[0], 'truss');
  for (let k = 0; k + 1 < bots.length; k++) member(c, bots[k], bots[k + 1], 'truss');
  member(c, bots[bots.length - 1], nE, 'truss');
  modelStore.addSupport(n0, 'pinned'); modelStore.addSupport(nE, 'rollerX');
  for (const b of beams) if (r.chance(0.9)) modelStore.addDistributedLoad(b, -r.real(5, 20, 5));
}

function cantilever(c: Ctx) {
  const { r } = c;
  const nSeg = r.int(1, 4), L = r.real(1, 6), ang = r.pick([0, 0, 0, 30, 90, -45, 180]) * (Math.PI / 180);
  const ids = Array.from({ length: nSeg + 1 }, (_, k) => modelStore.addNode((k * L * Math.cos(ang)) / nSeg, (k * L * Math.sin(ang)) / nSeg));
  const els: number[] = [];
  for (let k = 0; k < nSeg; k++) els.push(member(c, ids[k], ids[k + 1]));
  if (r.chance(0.2)) { modelStore.addSupport(ids[0], 'spring', { kx: 1e6, ky: 1e6, kz: r.pick([1e3, 1e5]) }); c.meta.springs = true; }
  else modelStore.addSupport(ids[0], 'fixed');
  const tip = ids[nSeg];
  const kind = r.int(0, 3);
  if (kind === 0) modelStore.addNodalLoad(tip, 0, -r.real(5, 50, 5), 0);
  else if (kind === 1) modelStore.addNodalLoad(tip, r.real(-20, 20, 5), r.real(-20, 20, 5), r.real(-20, 20, 5));
  else if (kind === 2) for (const e of els) spanLoad(c, e);
  else modelStore.addNodalLoad(tip, 0, 0, r.real(5, 40, 5));
  maybeThermal(c, els);
}

const BUILDERS: Record<Family, (c: Ctx) => void> = { beam, frame, gable, arch, truss, mixed, cantilever };

/** Build `family#seed` into the model store (after clearing it). */
export function generate(family: Family, seed: number): GenMeta {
  modelStore.clear();
  const r = rng(seed * 31 + FAMILIES.indexOf(family) * 1009);
  const meta: GenMeta = {
    family, seed, label: `${family}#${seed}`,
    thermal: false, settlement: false, springs: false, inclinedSupport: false, hinges: false, pureTruss: false,
  };
  modelStore.batch(() => {
    const secs = addSections(r);
    BUILDERS[family]({ r, meta, secs });
  });
  return meta;
}
