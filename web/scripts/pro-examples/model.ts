/**
 * The model the PRO examples are written with: entities numbered as they are added, nodes welded
 * by position, and the text of the model code (`model/code/format.ts`) at the end.
 */
import { ALL_PROFILES, profileToSectionFull } from '../../src/lib/data/steel-profiles';
import { floorLoad, type FloorBeam } from '../../src/lib/engine/loads/floor-loads';

export const r = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10)));
const fmt = (o: Record<string, unknown>) => Object.entries(o)
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `${k}=${typeof v === 'string' || typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? String(v) : r(v as number)}`)
  .join(' ');

export type Vec = { x: number; y: number; z: number };

export class Model {
  private out: string[] = [];
  private nodeAt = new Map<string, number>();
  nodes = new Map<number, Vec>();
  members = new Map<number, { i: number; j: number; type: 'frame' | 'truss'; sec: number; rollAngle?: number }>();
  private sections = new Map<string, number>();
  private n = { node: 0, member: 0, quad: 0, support: 0, material: 0, section: 0, case: 0, load: 0, combination: 0, group: 0 };
  private body: string[] = [];
  private loads: string[] = [];
  private tail: string[] = [];

  constructor(private name: string, private header: string[]) {}

  node(x: number, y: number, z: number): number {
    const k = `${r(x)},${r(y)},${r(z)}`;
    const hit = this.nodeAt.get(k);
    if (hit) return hit;
    const id = ++this.n.node;
    this.nodeAt.set(k, id);
    this.nodes.set(id, { x: r(x), y: r(y), z: r(z) });
    return id;
  }

  material(name: string, f: { e: number; nu: number; rho: number; alpha: number; fy?: number; fu?: number; gradeId?: string }): number {
    const id = ++this.n.material;
    this.body.push(`material ${id} ${fmt({ name, ...f })}`);
    return id;
  }

  /** A catalogue profile, as the section picker makes it. */
  profile(name: string): number {
    if (this.sections.has(name)) return this.sections.get(name)!;
    const p = ALL_PROFILES.find((q) => q.name === name);
    if (!p) throw new Error(`no catalogue profile ${name}`);
    const s = profileToSectionFull(p);
    const id = ++this.n.section;
    this.sections.set(name, id);
    this.body.push(`section ${id} ${fmt({ name: p.name, profileFamily: p.family, shape: s.shape, a: s.a, iy: s.iy, iz: s.iz, j: s.j, b: s.b, h: s.h, tw: s.tw, tf: s.tf, t: s.t })}`);
    return id;
  }

  /** A rectangular concrete section, b wide and h deep. */
  rect(name: string, b: number, h: number): number {
    if (this.sections.has(name)) return this.sections.get(name)!;
    const [s, l] = b < h ? [b, h] : [h, b];
    const j = l * s ** 3 * (1 / 3 - 0.21 * (s / l) * (1 - s ** 4 / (12 * l ** 4)));
    const id = ++this.n.section;
    this.sections.set(name, id);
    this.body.push(`section ${id} ${fmt({ name, shape: 'rect', b, h, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12, j })}`);
    return id;
  }

  /** A section given by its properties alone (a cable, a bar). */
  declared(name: string, p: { a: number; iy: number; iz: number; j: number }): number {
    if (this.sections.has(name)) return this.sections.get(name)!;
    const id = ++this.n.section;
    this.sections.set(name, id);
    this.body.push(`section ${id} ${fmt({ name, declared: true, ...p })}`);
    return id;
  }

  member(i: number, j: number, sec: number, mat: number, extra: Record<string, unknown> = {}, type: 'frame' | 'truss' = 'frame'): number {
    const id = ++this.n.member;
    this.members.set(id, { i, j, type, sec, rollAngle: extra.rollAngle as number | undefined });
    const rest = fmt({ materialId: mat, sectionId: sec, ...extra });
    this.body.push(`member ${id} ${type} ${i} ${j} ${rest}`);
    return id;
  }

  /** A member cut at every node already on its line, so it shares them (a mesh edge, a bracket). */
  line(a: Vec, b: Vec, sec: number, mat: number, pieces: number, extra: Record<string, unknown> = {}, type: 'frame' | 'truss' = 'frame'): number[] {
    const ids: number[] = [];
    let prev = this.node(a.x, a.y, a.z);
    for (let k = 1; k <= pieces; k++) {
      const t = k / pieces;
      const next = this.node(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      ids.push(this.member(prev, next, sec, mat, extra, type));
      prev = next;
    }
    return ids;
  }

  quad(ns: [number, number, number, number], mat: number, t: number): number {
    const id = ++this.n.quad;
    this.body.push(`quad ${id} ${JSON.stringify(ns)} materialId=${mat} thickness=${r(t)}`);
    return id;
  }

  support(node: number, type: 'fixed3d' | 'pinned3d'): void {
    this.tail.push(`support ${++this.n.support} ${node} ${type}`);
  }

  case(type: string, name: string): number {
    const id = ++this.n.case;
    this.tail.push(`case ${id} ${type} ${JSON.stringify(name)}`);
    return id;
  }

  combination(name: string, terms: Array<[number, number]>): void {
    this.tail.push(`combination ${++this.n.combination} ${JSON.stringify(name)} ${terms.map(([c, f]) => `${c}*${r(f)}`).join(' ')}`);
  }

  nodal(node: number, caseId: number, f: Partial<Record<'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz', number>>): void {
    this.loads.push(`load nodal3d ${++this.n.load} ${fmt({ nodeId: node, fx: f.fx ?? 0, fy: f.fy ?? 0, fz: f.fz ?? 0, mx: f.mx ?? 0, my: f.my ?? 0, mz: f.mz ?? 0, caseId })}`);
  }

  /** A member load in global components, per metre of member. */
  global(el: number, caseId: number, q: { x?: number; y?: number; z?: number }, qj = q): void {
    this.loads.push(`load distributed3d ${++this.n.load} ${fmt({ elementId: el, qXI: q.x ?? 0, qXJ: qj.x ?? 0, qYI: q.y ?? 0, qYJ: qj.y ?? 0, qZI: q.z ?? 0, qZJ: qj.z ?? 0, frame: 'global', caseId })}`);
  }

  /** A member load in the member's local axes, as the floor-load tool gives it. */
  local(el: number, caseId: number, l: { qYI: number; qYJ: number; qZI: number; qZJ: number; a?: number; b?: number }): void {
    this.loads.push(`load distributed3d ${++this.n.load} ${fmt({ elementId: el, ...l, caseId })}`);
  }

  surface(quad: number, caseId: number, q: number): void {
    this.loads.push(`load surface3d ${++this.n.load} ${fmt({ quadId: quad, q, caseId })}`);
  }

  group(kind: string, name: string, members: Record<string, number[]>, data?: Record<string, unknown>): number {
    const id = ++this.n.group;
    this.tail.push(`group ${id} ${kind} ${JSON.stringify(name)} ${fmt({ members, data })}`);
    return id;
  }

  constraint(c: Record<string, unknown>): void { this.tail.push(`constraint ${JSON.stringify(c)}`); }
  setting(key: string, v: unknown): void { this.tail.push(`${key} ${JSON.stringify(v)}`); }

  /** Spread q (kN/m², down) over the panels of the beams at height z, into `caseId`. */
  floor(z: number, q: number, caseId: number): number {
    const beams: FloorBeam[] = [];
    for (const [id, m] of this.members) {
      const a = this.nodes.get(m.i)!, b = this.nodes.get(m.j)!;
      if (Math.abs(a.z - z) < 1e-6 && Math.abs(b.z - z) < 1e-6) beams.push({ id, nodeI: m.i, nodeJ: m.j, type: m.type, sectionId: m.sec, rollAngle: m.rollAngle });
    }
    const res = floorLoad({ nodes: this.nodes, beams, q, distribution: 'twoWay' });
    for (const l of res.loads) this.local(l.elementId, caseId, { qYI: l.qYI, qYJ: l.qYJ, qZI: l.qZI, qZJ: l.qZJ, a: l.a, b: l.b });
    return res.totalKN;
  }

  text(): string {
    const nodes = [...this.nodes].map(([id, p]) => `node ${id} ${p.x} ${p.y} ${p.z}`);
    return [
      'stabileo-model 1', ...this.header.map((h) => `# ${h}`),
      `name ${JSON.stringify(this.name)}`, 'mode pro', 'axes zUpStrongAxis', '',
      ...nodes, '', ...this.body, '', ...this.tail, '', ...this.loads, '',
    ].join('\n');
  }
}

// The grade declared, so steel design can check the members (IRAM-IAS U 500-503: F-24 is 240 MPa).
export const STEEL = { e: 200000, nu: 0.3, rho: 77, alpha: 1.2e-5, fy: 240, fu: 370, gradeId: 'iram-f24' };
export const concrete = (fc: number) => ({ e: Math.round(4700 * Math.sqrt(fc)), nu: 0.2, rho: 25, alpha: 1e-5, fy: fc });
export const GRAVITY = (caseId: number) => ({ caseId, direction: 'Z', factor: -1 });
export const range = (n: number) => Array.from({ length: n }, (_, k) => k);

