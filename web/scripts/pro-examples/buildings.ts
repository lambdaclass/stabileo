/**
 * The PRO examples that are buildings: axes and named levels, columns and beams on the axes,
 * slabs and walls meshed as shells on one conforming grid, each slab panel and wall declared as
 * the physical element it is, and the load generator's settings each one states, from which the
 * gallery writes its loads and combinations (`generator-settings.ts`). No earthquake: a person adds
 * it from the generator, with the site's zone and soil.
 */
import { Model, STEEL, concrete, r } from './model';
import { generatorRegulations, type GeneratorSettings } from './generator-settings';
import { defaultRoofConfig } from '../../src/components/pro/auto-loads-sections';

interface Axis { name: string; at: number }
interface LevelDef { name: string; z: number }
type Box = { x0: number; x1: number; y0: number; y1: number };

const EPS = 1e-6;
const within = (b: Box, x: number, y: number) => x > b.x0 + EPS && x < b.x1 - EPS && y > b.y0 + EPS && y < b.y1 - EPS;

/** The coordinates through `fixed`, each gap split into equal parts no longer than `step`. */
function meshLine(fixed: number[], step: number): number[] {
  const s = [...new Set(fixed.map(r))].sort((a, b) => a - b);
  const out = [s[0]!];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!, b = s[i]!, n = Math.max(1, Math.ceil((b - a) / step - 1e-9));
    for (let k = 1; k <= n; k++) out.push(r(a + ((b - a) * k) / n));
  }
  return out;
}

/** The values of `list` from `a` to `b`, both ends included, in that direction. */
function between(list: number[], a: number, b: number): number[] {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const v = list.filter((x) => x >= lo - EPS && x <= hi + EPS);
  return a <= b ? v : v.reverse();
}

class Building {
  readonly m: Model;
  readonly xs: number[];
  readonly ys: number[];

  constructor(name: string, header: string[], readonly ax: { x: Axis[]; y: Axis[] }, readonly levels: LevelDef[], mesh: { x?: number[]; y?: number[]; step: number }) {
    this.m = new Model(name, header);
    this.xs = meshLine([...ax.x.map((a) => a.at), ...(mesh.x ?? [])], mesh.step);
    this.ys = meshLine([...ax.y.map((a) => a.at), ...(mesh.y ?? [])], mesh.step);
    this.m.setting('grid', {
      axes: [
        ...ax.x.map((a, i) => ({ id: `ax-x${i + 1}`, name: a.name, axis: 'x', at: a.at })),
        ...ax.y.map((a, i) => ({ id: `ax-y${i + 1}`, name: a.name, axis: 'y', at: a.at })),
      ],
      levels: levels.map((l, i) => ({ id: `lv-${i}`, name: l.name, z: l.z })),
    });
  }

  z(k: number): number { return this.levels[k]!.z; }
  private node(x: number, y: number, z: number): number { return this.m.node(x, y, z); }

  /** A beam along X at `y` from `x0` to `x1` on level `k`, cut at the mesh. */
  beamX(k: number, y: number, x0: number, x1: number, sec: number, mat: number): void {
    const xs = between(this.xs, x0, x1);
    for (let i = 1; i < xs.length; i++) this.m.member(this.node(xs[i - 1]!, y, this.z(k)), this.node(xs[i]!, y, this.z(k)), sec, mat);
  }

  /** A beam along Y at `x` from `y0` to `y1` on level `k`, cut at the mesh. */
  beamY(k: number, x: number, y0: number, y1: number, sec: number, mat: number): void {
    const ys = between(this.ys, y0, y1);
    for (let i = 1; i < ys.length; i++) this.m.member(this.node(x, ys[i - 1]!, this.z(k)), this.node(x, ys[i]!, this.z(k)), sec, mat);
  }

  /** A column at (x, y) from level `k0` up to `k1`, a member a storey, fixed at the ground. */
  column(x: number, y: number, k0: number, k1: number, sec: (k: number) => number, mat: number, extra: Record<string, unknown> = {}): void {
    if (k0 === 0) this.m.support(this.node(x, y, this.z(0)), 'fixed3d');
    for (let k = k0; k < k1; k++) this.m.member(this.node(x, y, this.z(k)), this.node(x, y, this.z(k + 1)), sec(k), mat, extra);
  }

  /** The slab of level `k` over `region` less `voids`, a quad a mesh cell, and a slab panel a bay between axes. */
  slab(k: number, t: number, mat: number, region: Box, voids: Box[] = []): void {
    const panels = new Map<string, number[]>();
    const bay = (list: Axis[], v: number) => list.findIndex((a, i) => i + 1 < list.length && v > a.at && v < list[i + 1]!.at);
    for (let i = 1; i < this.xs.length; i++) for (let j = 1; j < this.ys.length; j++) {
      const xa = this.xs[i - 1]!, xb = this.xs[i]!, ya = this.ys[j - 1]!, yb = this.ys[j]!;
      const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
      if (!within(region, cx, cy) || voids.some((v) => within(v, cx, cy))) continue;
      const z = this.z(k);
      const q = this.m.quad([this.node(xa, ya, z), this.node(xb, ya, z), this.node(xb, yb, z), this.node(xa, yb, z)], mat, t);
      const bx = bay(this.ax.x, cx), by = bay(this.ax.y, cy);
      const key = `${bx},${by}`;
      panels.set(key, [...(panels.get(key) ?? []), q]);
    }
    for (const [key, quads] of panels) {
      const [bx, by] = key.split(',').map(Number) as [number, number];
      const name = `Losa ${this.ax.x[bx]!.name}${this.ax.y[by]!.name}–${this.ax.x[bx + 1]!.name}${this.ax.y[by + 1]!.name} · ${this.levels[k]!.name}`;
      this.m.group('physicalMember', name, { quads }, { kind: 'slab', typology: 'solid', levelFrom: `lv-${k}`, provenance: 'declared' });
    }
  }

  /**
   * A straight wall from `a` to `b` in plan, from level `k0` up to `k1`, cut at the mesh along it
   * and in `rows` a storey, fixed along its base at the ground; a wall a storey.
   */
  wall(name: string, a: [number, number], b: [number, number], k0: number, k1: number, t: number, mat: number, rows: number): void {
    const alongX = Math.abs(a[1] - b[1]) < EPS;
    const s = alongX ? between(this.xs, a[0], b[0]) : between(this.ys, a[1], b[1]);
    const at = (v: number): [number, number] => (alongX ? [v, a[1]] : [a[0], v]);
    if (k0 === 0) for (const v of s) this.m.support(this.node(...at(v), this.z(0)), 'fixed3d');
    for (let k = k0; k < k1; k++) {
      const zs = Array.from({ length: rows + 1 }, (_, j) => this.z(k) + ((this.z(k + 1) - this.z(k)) * j) / rows);
      const quads: number[] = [];
      for (let i = 1; i < s.length; i++) for (let j = 1; j <= rows; j++) {
        const p = at(s[i - 1]!), q = at(s[i]!);
        quads.push(this.m.quad([this.node(...p, zs[j - 1]!), this.node(...q, zs[j - 1]!), this.node(...q, zs[j]!), this.node(...p, zs[j]!)], mat, t));
      }
      this.m.group('physicalMember', `Tabique ${name} · ${this.levels[k]!.name}`, { quads }, { kind: 'wall', typology: 'concrete', levelFrom: `lv-${k}`, levelTo: `lv-${k + 1}`, provenance: 'declared' });
    }
  }

  /** An inclined flight across `xa`–`xb`, rising from (`y0`, `z0`) to (`y1`, `z1`) in `parts` quads along it. */
  flight(xa: number, xb: number, y0: number, y1: number, z0: number, z1: number, parts: number, t: number, mat: number): void {
    const xs = between(this.xs, xa, xb);
    const at = (s: number): [number, number] => [y0 + ((y1 - y0) * s) / parts, z0 + ((z1 - z0) * s) / parts];
    for (let i = 1; i < xs.length; i++) for (let s = 1; s <= parts; s++) {
      const [ya, za] = at(s - 1), [yb, zb] = at(s);
      this.m.quad([this.node(xs[i - 1]!, ya, za), this.node(xs[i]!, ya, za), this.node(xs[i]!, yb, zb), this.node(xs[i - 1]!, yb, zb)], mat, t);
    }
  }

  /** A level landing over `box` at height `z`, on the mesh. */
  landing(box: Box, z: number, t: number, mat: number): void {
    const xs = between(this.xs, box.x0, box.x1), ys = between(this.ys, box.y0, box.y1);
    for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) {
      this.m.quad([this.node(xs[i - 1]!, ys[j - 1]!, z), this.node(xs[i]!, ys[j - 1]!, z), this.node(xs[i]!, ys[j]!, z), this.node(xs[i - 1]!, ys[j]!, z)], mat, t);
    }
  }

  /** The beams on every axis line of level `k` from one end of the plan to the other, less the stretches `skip` says. */
  axisBeams(k: number, secX: number, secY: number, mat: number, skip: (axis: 'x' | 'y', at: number, from: number, to: number) => boolean = () => false): void {
    const X = this.ax.x.map((a) => a.at), Y = this.ax.y.map((a) => a.at);
    for (const y of Y) for (let i = 1; i < X.length; i++) if (!skip('x', y, X[i - 1]!, X[i]!)) this.beamX(k, y, X[i - 1]!, X[i]!, secX, mat);
    for (const x of X) for (let j = 1; j < Y.length; j++) if (!skip('y', x, Y[j - 1]!, Y[j]!)) this.beamY(k, x, Y[j - 1]!, Y[j]!, secY, mat);
  }

  text(settings: GeneratorSettings): string { this.m.setting('regulations', generatorRegulations(settings)); return this.m.text(); }
}

const H25 = concrete(25);
const names = (n: number, from: string) => Array.from({ length: n }, (_, i) => (from === 'A' ? String.fromCharCode(65 + i) : String(i + 1)));
const axes = (at: number[], from: string): Axis[] => { const n = names(at.length, from); return at.map((v, i) => ({ name: n[i]!, at: v })); };
const storeys = (base: Array<[string, number]>): LevelDef[] => base.map(([name, z]) => ({ name, z }));

/**
 * Dwellings, whose Tabla 4.1 row has no concentrated load the generator would have to leave out, with
 * the roof an accessible floor: roof settings of their own ask for §4.4's concentrated roof actions,
 * which the generator refuses rather than omit. Wind on a closed building in the city.
 */
const CITY_WIND: GeneratorSettings = {
  selectedOccupancy: 'vivienda', roofCfg: { ...defaultRoofConfig(), enabled: false },
  enableWind: true, windV: 45, windExposure: 'B', windEnclosure: 'enclosed',
};
const approximate = (system: 'concreteMomentFrame' | 'steelMomentFrame' | 'otherSteelOrConcrete'): GeneratorSettings['windDyn'] =>
  ({ n1Source: 'approximate', system, beta: 0.02, rigidG: 'default' });

// ─── A two-storey house ──────────────────────────────────────────────────────────────────────
function house(): string {
  const levels = storeys([['PB', 0], ['Planta alta', 2.8], ['Azotea', 5.6]]);
  const b = new Building('Vivienda de H.A. de dos plantas', [
    'A two-storey concrete house, two bays each way: 20 × 20 columns, 20 × 40 beams on every axis',
    'and 12 cm solid slabs meshed as shells. Loads and combinations from the load generator.',
  ], { x: axes([0, 4, 8], '1'), y: axes([0, 4.5, 9], 'A') }, levels, { step: 1 });
  const hc = b.m.material('Hormigón H-25', H25);
  const col = b.m.rect('Col 20×20', 0.2, 0.2), beam = b.m.rect('Viga 20×40', 0.2, 0.4);
  for (const x of [0, 4, 8]) for (const y of [0, 4.5, 9]) b.column(x, y, 0, 2, () => col, hc);
  for (const k of [1, 2]) { b.axisBeams(k, beam, beam, hc); b.slab(k, 0.12, hc, { x0: 0, x1: 8, y0: 0, y1: 9 }); }
  return b.text({ ...CITY_WIND });
}

// ─── A four-storey building ──────────────────────────────────────────────────────────────────
function fourStorey(): string {
  const levels = storeys([['PB', 0], ['1º piso', 3.5], ['2º piso', 6.8], ['3º piso', 10.1], ['Azotea', 13.4]]);
  const b = new Building('Edificio de H.A. de 4 pisos', [
    'A four-storey concrete residential building, three by two bays of 6 m: columns 40 × 40 below and',
    '35 × 35 above, 25 × 55 beams on every axis and 15 cm two-way slabs meshed as shells.',
  ], { x: axes([0, 6, 12, 18], '1'), y: axes([0, 6, 12], 'A') }, levels, { step: 1.5 });
  const hc = b.m.material('Hormigón H-25', H25);
  const low = b.m.rect('Col 40×40', 0.4, 0.4), up = b.m.rect('Col 35×35', 0.35, 0.35), beam = b.m.rect('Viga 25×55', 0.25, 0.55);
  for (const x of [0, 6, 12, 18]) for (const y of [0, 6, 12]) b.column(x, y, 0, 4, (k) => (k < 2 ? low : up), hc);
  for (let k = 1; k <= 4; k++) { b.axisBeams(k, beam, beam, hc); b.slab(k, 0.15, hc, { x0: 0, x1: 18, y0: 0, y1: 12 }); }
  return b.text({ ...CITY_WIND, windDyn: approximate('concreteMomentFrame') });
}

// ─── Concrete floors on steel columns ────────────────────────────────────────────────────────
function steelColumns(): string {
  const levels = storeys([['PB', 0], ['1º piso', 4], ['2º piso', 7.5], ['Azotea', 11]]);
  const b = new Building('Edificio de H.A. con columnas de acero', [
    'A three-storey residential building: steel HEB columns, fixed at their base plates, carry concrete',
    'beams and 14 cm slabs meshed as shells; two by three bays of 7 × 6 m.',
  ], { x: axes([0, 7, 14], '1'), y: axes([0, 6, 12, 18], 'A') }, levels, { step: 1.5 });
  const steel = b.m.material('Acero F-24', STEEL), hc = b.m.material('Hormigón H-25', H25);
  const low = b.m.profile('HEB 260'), up = b.m.profile('HEB 220');
  const bx = b.m.rect('Viga 25×60', 0.25, 0.6), by = b.m.rect('Viga 20×50', 0.2, 0.5);
  for (const x of [0, 7, 14]) for (const y of [0, 6, 12, 18]) b.column(x, y, 0, 3, (k) => (k < 2 ? low : up), steel);
  for (let k = 1; k <= 3; k++) { b.axisBeams(k, bx, by, hc); b.slab(k, 0.14, hc, { x0: 0, x1: 14, y0: 0, y1: 18 }); }
  return b.text({ ...CITY_WIND });
}

// ─── Six storeys around a lift shaft ─────────────────────────────────────────────────────────
function liftCore(): string {
  const levels = storeys([['PB', 0], ['1º piso', 3.2], ['2º piso', 6.2], ['3º piso', 9.2], ['4º piso', 12.2], ['5º piso', 15.2], ['Azotea', 18.2]]);
  const shaft = { x0: 7.25, x1: 9.25, y0: 9, y1: 11 };
  const b = new Building('Edificio de H.A. de 6 plantas con caja de ascensor', [
    'A six-storey concrete residential building, three by two bays of 5.5 m, with a lift shaft of',
    '15 cm walls against the back façade: three walls meshed as shells and a lintel beam at its door.',
  ], { x: axes([0, 5.5, 11, 16.5], '1'), y: axes([0, 5.5, 11], 'A') }, levels, { x: [shaft.x0, shaft.x1], y: [shaft.y0], step: 1.4 });
  const hc = b.m.material('Hormigón H-25', H25);
  const low = b.m.rect('Col 40×40', 0.4, 0.4), up = b.m.rect('Col 35×35', 0.35, 0.35), beam = b.m.rect('Viga 25×50', 0.25, 0.5);
  for (const x of [0, 5.5, 11, 16.5]) for (const y of [0, 5.5, 11]) b.column(x, y, 0, 6, (k) => (k < 3 ? low : up), hc);
  b.wall('caja 1', [shaft.x0, shaft.y0], [shaft.x0, shaft.y1], 0, 6, 0.15, hc, 2);
  b.wall('caja 2', [shaft.x0, shaft.y1], [shaft.x1, shaft.y1], 0, 6, 0.15, hc, 2);
  b.wall('caja 3', [shaft.x1, shaft.y0], [shaft.x1, shaft.y1], 0, 6, 0.15, hc, 2);
  for (let k = 1; k <= 6; k++) {
    b.axisBeams(k, beam, beam, hc, (axis, at, from, to) => axis === 'x' && at === 11 && from === 5.5 && to === 11);
    b.beamX(k, shaft.y1, 5.5, shaft.x0, beam, hc);
    b.beamX(k, shaft.y1, shaft.x1, 11, beam, hc);
    b.beamX(k, shaft.y0, shaft.x0, shaft.x1, beam, hc);
    b.slab(k, 0.13, hc, { x0: 0, x1: 16.5, y0: 0, y1: 11 }, k < 6 ? [shaft] : []);
  }
  return b.text({ ...CITY_WIND, windDyn: approximate('otherSteelOrConcrete') });
}

// ─── Seven storeys between party walls, with the lift and the stair ──────────────────────────
function partyWall(): string {
  const levels = storeys([['PB', 0], ['1º piso', 3], ['2º piso', 5.8], ['3º piso', 8.6], ['4º piso', 11.4], ['5º piso', 14.2], ['6º piso', 17], ['Azotea', 19.8]]);
  const shaft = { x0: 0, x1: 1.9, y0: 8.5, y1: 10.46 }, stair = { x0: 1.9, x1: 4.2, y0: 8.5, y1: 11.7 }, mid = 3.05;
  const b = new Building('Edificio entre medianeras de PB y 6 pisos', [
    'A seven-storey concrete block of flats on an 8.6 m city lot, columns against both party walls',
    'and at the ends of the core walls:',
    'a lift shaft and a closed stairwell of 15 cm walls, a U stair of two flights and a landing a',
    'storey, 12 cm slabs, all meshed as shells. The wind blows on the front and the back only.',
  ], { x: axes([0, 4.2, 8.4], '1'), y: axes([0, 4.5, 8.5, 11.7, 16.2, 20.7], 'A') }, levels, { x: [shaft.x1, mid], y: [shaft.y1], step: 2 });
  const hc = b.m.material('Hormigón H-25', H25);
  const edge = b.m.rect('Col 20×50', 0.2, 0.5), centre = b.m.rect('Col 30×50', 0.3, 0.5), beam = b.m.rect('Viga 20×45', 0.2, 0.45);
  const top = levels.length - 1;
  for (const x of [0, 4.2, 8.4]) for (const y of [0, 4.5, 8.5, 11.7, 16.2, 20.7]) b.column(x, y, 0, top, () => (x === 4.2 ? centre : edge), hc, { rollAngle: 90 });
  b.wall('ascensor 1', [shaft.x0, shaft.y0], [shaft.x0, shaft.y1], 0, top, 0.15, hc, 2);
  b.wall('ascensor 2', [shaft.x0, shaft.y1], [shaft.x1, shaft.y1], 0, top, 0.15, hc, 2);
  b.wall('escalera 1', [stair.x0, stair.y0], [stair.x0, stair.y1], 0, top, 0.15, hc, 2);
  b.wall('escalera 2', [stair.x0, stair.y1], [stair.x1, stair.y1], 0, top, 0.15, hc, 2);
  b.wall('escalera 3', [stair.x1, stair.y0], [stair.x1, stair.y1], 0, top, 0.15, hc, 2);
  const onCore = (axis: 'x' | 'y', at: number, from: number, to: number) =>
    (axis === 'y' && at === 0 && from === 8.5) || (axis === 'y' && at === 4.2 && from === 8.5) || (axis === 'x' && at === 11.7 && from === 0);
  for (let k = 1; k <= top; k++) {
    b.axisBeams(k, beam, beam, hc, onCore);
    b.beamX(k, 11.7, 0, stair.x0, beam, hc);
    b.slab(k, 0.12, hc, { x0: 0, x1: 8.4, y0: 0, y1: 20.7 }, k < top ? [shaft, stair] : []);
  }
  // A U stair a storey up to the last floor: up along +Y beside the shaft, a landing against the
  // back wall at mid height, and back along −Y to the floor above.
  const run = shaft.y1 - stair.y0;
  b.m.support(b.m.node(mid, stair.y0, 0), 'pinned3d');
  for (let k = 0; k < top - 1; k++) {
    const z0 = b.z(k), z1 = b.z(k + 1), zm = (z0 + z1) / 2;
    b.flight(stair.x0, mid, stair.y0, stair.y0 + run, z0, zm, 2, 0.15, hc);
    b.landing({ x0: stair.x0, x1: stair.x1, y0: shaft.y1, y1: stair.y1 }, zm, 0.15, hc);
    b.flight(mid, stair.x1, stair.y0 + run, stair.y0, zm, z1, 2, 0.15, hc);
  }
  return b.text({ ...CITY_WIND, windDirs: ['+y', '-y'], windDyn: approximate('otherSteelOrConcrete') });
}

// ─── A steel building with concrete slabs and a core ─────────────────────────────────────────
function steelBuildingSlabs(): string {
  const m = new Model('Edificio de acero con losas y núcleo', [
    'A two-by-three bay steel frame, three storeys, with 12 cm concrete slabs meshed as shells and',
    'a concrete core, a column at its corner on the grid. The beams sit under the slab: their axis is',
    'offset below its mid-plane.',
  ]);
  const X = 12, Y = 18, hS = 3.6, levels = 3, step = 1, rows = 3;
  const steel = m.material('Acero F-24', STEEL);
  const hc = m.material('Hormigón H-25', H25);
  const col = m.profile('HEB 240'), beam = m.profile('IPE 360'), secondary = m.profile('IPE 270');
  const core = { x0: 0, x1: 3, y0: 6, y1: 9 };
  const drop = -(0.36 / 2 + 0.06), dropSecondary = -(0.27 / 2 + 0.06);
  const columnLines: Array<[number, number]> = [];
  for (const x of [0, 6, 12]) for (const y of [0, 6, 12, 18]) columnLines.push([x, y]);
  for (const [x, y] of columnLines) m.support(m.node(x, y, 0), 'fixed3d');
  const isColumn = (x: number, y: number) => columnLines.some(([cx, cy]) => cx === x && cy === y);
  for (let x = core.x0; x <= core.x1; x += step) for (const y of [core.y0, core.y1]) if (!isColumn(x, y)) m.support(m.node(x, y, 0), 'fixed3d');
  for (let y = core.y0 + step; y < core.y1; y += step) for (const x of [core.x0, core.x1]) m.support(m.node(x, y, 0), 'fixed3d');
  m.setting('grid', {
    axes: [...[0, 6, 12].map((at, i) => ({ id: `ax-x${i + 1}`, name: String(i + 1), axis: 'x', at })), ...[0, 6, 12, 18].map((at, i) => ({ id: `ax-y${i + 1}`, name: String.fromCharCode(65 + i), axis: 'y', at }))],
    levels: [0, 1, 2, 3].map((k) => ({ id: `lv-${k}`, name: k === 0 ? 'PB' : k === levels ? 'Azotea' : `${k}º piso`, z: k * hS })),
  });
  for (let lv = 1; lv <= levels; lv++) {
    const z = lv * hS;
    for (const [x, y] of columnLines) m.member(m.node(x, y, z - hS), m.node(x, y, z), col, steel);
    const off = (d: number) => ({ offset: { frame: 'global', i: { x: 0, y: 0, z: d }, j: { x: 0, y: 0, z: d } } });
    for (const y of [0, 6, 12, 18]) m.line({ x: 0, y, z }, { x: X, y, z }, beam, steel, X / step, off(drop));
    for (const x of [0, 6, 12]) m.line({ x, y: 0, z }, { x, y: Y, z }, beam, steel, Y / step, off(drop));
    for (const y of [3, 9, 15]) m.line({ x: 0, y, z }, { x: X, y, z }, secondary, steel, X / step, off(dropSecondary));
    for (let i = 0; i < X / step; i++) for (let j = 0; j < Y / step; j++) {
      const x = i * step, y = j * step;
      m.quad([m.node(x, y, z), m.node(x + step, y, z), m.node(x + step, y + step, z), m.node(x, y + step, z)], hc, 0.12);
    }
    const zs = Array.from({ length: rows + 1 }, (_, k) => z - hS + (k * hS) / rows);
    const edge: Array<[number, number, number, number]> = [];
    for (let x = core.x0; x < core.x1; x += step) edge.push([x, core.y0, x + step, core.y0], [x, core.y1, x + step, core.y1]);
    for (let y = core.y0; y < core.y1; y += step) edge.push([core.x0, y, core.x0, y + step], [core.x1, y, core.x1, y + step]);
    for (const [xa, ya, xb, yb] of edge) for (let k = 0; k < rows; k++)
      m.quad([m.node(xa, ya, zs[k]!), m.node(xb, yb, zs[k]!), m.node(xb, yb, zs[k + 1]!), m.node(xa, ya, zs[k + 1]!)], hc, 0.2);
  }
  m.setting('regulations', generatorRegulations(CITY_WIND));
  return m.text();
}

export const BUILDINGS: Record<string, () => string> = {
  'pro-rc-house': house,
  'pro-rc-four-storey': fourStorey,
  'pro-rc-steel-columns': steelColumns,
  'pro-rc-lift-core': liftCore,
  'pro-rc-party-wall': partyWall,
  'pro-steel-building-slabs': steelBuildingSlabs,
};
