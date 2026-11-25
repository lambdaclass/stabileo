/**
 * The PRO examples that are buildings: axes and named levels, columns and beams on the axes, and
 * slabs, walls, stair flights and landings as physical plates not meshed yet (the analysis meshes
 * them), with the load generator's settings each one states, from which the gallery writes its
 * loads and combinations (`generator-settings.ts`). No earthquake: a person adds it from the
 * generator, with the site's zone and soil.
 */
import { Model, STEEL, concrete, r } from './model';
import { generatorRegulations, type GeneratorSettings } from './generator-settings';
import { defaultRoofConfig } from '../../src/components/pro/auto-loads-sections';

interface Axis { name: string; at: number }
interface LevelDef { name: string; z: number }
type Box = { x0: number; x1: number; y0: number; y1: number };
type Pt = [number, number, number];

const EPS = 1e-6;
const meshOf = (size: number) => ({ size, element: 'quad', followMembers: true, pattern: 'rect', sizeV: size });
const inside = (b: Box, x: number, y: number) => x > b.x0 + EPS && x < b.x1 - EPS && y > b.y0 + EPS && y < b.y1 - EPS;
const sorted = (v: number[]) => [...new Set(v.map(r))].sort((a, b) => a - b);
const within = (v: number[], a: number, b: number) => v.filter((x) => x > Math.min(a, b) + EPS && x < Math.max(a, b) - EPS);

class Building {
  readonly m: Model;
  private readonly xs: number[];
  private readonly ys: number[];

  constructor(name: string, header: string[], readonly ax: { x: Axis[]; y: Axis[] }, readonly levels: LevelDef[], cuts: { x?: number[]; y?: number[] } = {}, private readonly meshSize = 1) {
    this.m = new Model(name, header);
    this.xs = sorted([...ax.x.map((a) => a.at), ...(cuts.x ?? [])]);
    this.ys = sorted([...ax.y.map((a) => a.at), ...(cuts.y ?? [])]);
    this.m.setting('grid', {
      axes: [
        ...ax.x.map((a, i) => ({ id: `ax-x${i + 1}`, name: a.name, axis: 'x', at: a.at })),
        ...ax.y.map((a, i) => ({ id: `ax-y${i + 1}`, name: a.name, axis: 'y', at: a.at })),
      ],
      levels: levels.map((l, i) => ({ id: `lv-${i}`, name: l.name, z: l.z })),
    });
  }

  z(k: number): number { return this.levels[k]!.z; }
  private node(p: Pt): number { return this.m.node(...p); }

  /** A beam along X at `y` from `x0` to `x1` on level `k`, cut where a column, a wall or a plate's corner meets it. */
  beamX(k: number, y: number, x0: number, x1: number, sec: number, mat: number, extra: Record<string, unknown> = {}): void {
    const at = [x0, ...within(this.xs, x0, x1), x1];
    for (let i = 1; i < at.length; i++) this.m.member(this.node([at[i - 1]!, y, this.z(k)]), this.node([at[i]!, y, this.z(k)]), sec, mat, extra);
  }

  /** A beam along Y at `x` from `y0` to `y1` on level `k`, cut likewise. */
  beamY(k: number, x: number, y0: number, y1: number, sec: number, mat: number, extra: Record<string, unknown> = {}): void {
    const at = [y0, ...within(this.ys, y0, y1), y1];
    for (let i = 1; i < at.length; i++) this.m.member(this.node([x, at[i - 1]!, this.z(k)]), this.node([x, at[i]!, this.z(k)]), sec, mat, extra);
  }

  /** A column at (x, y) from level `k0` up to `k1`, a member a storey, fixed at the ground. */
  private readonly columnsAt = new Map<string, [number, number]>();
  private placed: { reference: 'slabTop'; columns: Record<string, string> } | null = null;

  column(x: number, y: number, k0: number, k1: number, sec: (k: number) => number, mat: number, extra: Record<string, unknown> = {}): void {
    if (k0 === 0) { this.m.support(this.node([x, y, this.z(0)]), 'fixed3d'); this.columnsAt.set(`${Math.round(x * 100)},${Math.round(y * 100)}`, [x, y]); }
    for (let k = k0; k < k1; k++) this.m.member(this.node([x, y, this.z(k)]), this.node([x, y, this.z(k + 1)]), sec(k), mat, extra);
  }

  /** A physical plate through `corners`, in order; `held` its base side, fixed along its length. */
  plate(name: string, corners: Pt[], data: Record<string, unknown>, mat: number, t: number, held = false): void {
    const nodes = corners.map((p) => this.node(p));
    if (held) for (const n of nodes.slice(0, 2)) this.m.support(n, 'fixed3d');
    const surface = { loops: [nodes.length], materialId: mat, thickness: t, mesh: meshOf(this.meshSize), edgeSupports: held ? [{ from: nodes[0], to: nodes[1], type: 'fixed3d' }] : [] };
    this.m.group('physicalMember', name, { nodes }, { ...data, provenance: 'declared', surface });
  }

  /**
   * The slab of level `k` over `region` less `voids`: a plate a cell of the lines every column, wall
   * and void is set out on, so a side two plates share has the same ends on both, and their meshes
   * the same nodes along it; named by its bay between axes.
   */
  slab(k: number, t: number, mat: number, region: Box, voids: Box[] = []): void {
    const X = this.ax.x, Y = this.ax.y, z = this.z(k);
    const bayOf = (axes: Axis[], v: number) => axes.findIndex((a, i) => i + 1 < axes.length && v > a.at && v < axes[i + 1]!.at);
    const xs = this.xs.filter((x) => x >= region.x0 - EPS && x <= region.x1 + EPS), ys = this.ys.filter((y) => y >= region.y0 - EPS && y <= region.y1 + EPS);
    const count = new Map<string, number>();
    for (let j = 1; j < ys.length; j++) for (let i = 1; i < xs.length; i++) {
      const c = { x0: xs[i - 1]!, x1: xs[i]!, y0: ys[j - 1]!, y1: ys[j]! };
      const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      if (voids.some((v) => inside(v, cx, cy))) continue;
      const bx = bayOf(X, cx), by = bayOf(Y, cy), key = `${bx},${by}`, n = count.get(key) ?? 0;
      count.set(key, n + 1);
      const cells = xs.slice(1).filter((x, q) => bayOf(X, (xs[q]! + x) / 2) === bx).length * ys.slice(1).filter((y, q) => bayOf(Y, (ys[q]! + y) / 2) === by).length;
      const name = `Losa ${X[bx]!.name}${Y[by]!.name}–${X[bx + 1]!.name}${Y[by + 1]!.name}${cells > 1 ? String.fromCharCode(97 + n) : ''} · ${this.levels[k]!.name}`;
      this.plate(name, [[c.x0, c.y0, z], [c.x1, c.y0, z], [c.x1, c.y1, z], [c.x0, c.y1, z]], { kind: 'slab', typology: 'solid', levelFrom: `lv-${k}` }, mat, t);
    }
  }

  /** A closing slab over `box` at level `k`. */
  cap(name: string, k: number, box: Box, t: number, mat: number): void {
    const z = this.z(k);
    this.plate(`${name} · ${this.levels[k]!.name}`, [[box.x0, box.y0, z], [box.x1, box.y0, z], [box.x1, box.y1, z], [box.x0, box.y1, z]], { kind: 'slab', typology: 'solid', levelFrom: `lv-${k}` }, mat, t);
  }

  /** A straight wall from `a` to `b` in plan, from level `k0` up to `k1`: a plate a storey, or each half of it with `halves`; fixed along its base at the ground. */
  wall(name: string, a: [number, number], b: [number, number], k0: number, k1: number, t: number, mat: number, halves = false): void {
    for (let k = k0; k < k1; k++) {
      const z0 = this.z(k), z1 = this.z(k + 1), zs = halves ? [z0, (z0 + z1) / 2, z1] : [z0, z1];
      for (let h = 1; h < zs.length; h++) {
        const label = `Tabique ${name} · ${this.levels[k]!.name}${halves ? (h === 1 ? ' (abajo)' : ' (arriba)') : ''}`;
        this.plate(label, [[...a, zs[h - 1]!], [...b, zs[h - 1]!], [...b, zs[h]!], [...a, zs[h]!]],
          { kind: 'wall', typology: 'concrete', levelFrom: `lv-${k}`, levelTo: `lv-${k + 1}` }, mat, t, k === 0 && h === 1);
      }
    }
  }

  /** An inclined flight of `steps` risers across `xa`–`xb`, rising from (`y0`, `z0`) to (`y1`, `z1`). */
  flight(name: string, xa: number, xb: number, y0: number, y1: number, z0: number, z1: number, steps: number, t: number, mat: number, k: number): void {
    this.plate(name, [[xa, y0, z0], [xb, y0, z0], [xb, y1, z1], [xa, y1, z1]], { kind: 'slab', typology: 'solid', levelFrom: `lv-${k}`, stair: { steps } }, mat, t);
  }

  /**
   * A straight wall from `a` to `b` in plan on each storey from `k0` up to `k1` with a door `width`
   * wide and `height` high, `from` along it from `a`: the wall beside the door and the lintel over it,
   * each a plate, cut at the door's head so the pieces meet side to side.
   */
  wallWithDoor(name: string, a: [number, number], b: [number, number], k0: number, k1: number, door: { from: number; width: number; height: number }, t: number, mat: number): void {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), at = (u: number): [number, number] => [r(a[0] + ((b[0] - a[0]) * u) / L), r(a[1] + ((b[1] - a[1]) * u) / L)];
    const d0 = door.from, d1 = door.from + door.width;
    for (let k = k0; k < k1; k++) {
      const z0 = this.z(k), z1 = this.z(k + 1), zd = r(z0 + door.height), lv = this.levels[k]!.name;
      const data = { kind: 'wall', typology: 'concrete', levelFrom: `lv-${k}`, levelTo: `lv-${k + 1}` };
      const piece = (label: string, u0: number, u1: number, za: number, zb: number) =>
        this.plate(`Tabique ${name} · ${lv} (${label})`, [[...at(u0), za], [...at(u1), za], [...at(u1), zb], [...at(u0), zb]], data, mat, t, k === 0 && za === z0);
      if (d0 > EPS) { piece('junto a la puerta', 0, d0, z0, zd); piece('arriba', 0, d0, zd, z1); }
      if (d1 < L - EPS) { piece('junto a la puerta', d1, L, z0, zd); piece('arriba', d1, L, zd, z1); }
      piece('dintel', d0, d1, zd, z1);
    }
  }

  /** A level landing over `box` at height `z`. */
  landing(name: string, box: Box, z: number, t: number, mat: number, k: number): void {
    this.plate(name, [[box.x0, box.y0, z], [box.x1, box.y0, z], [box.x1, box.y1, z], [box.x0, box.y1, z]], { kind: 'slab', typology: 'solid', levelFrom: `lv-${k}` }, mat, t);
  }

  /** The beams on every axis line of level `k` from one end of the plan to the other, less the stretches `skip` says. */
  axisBeams(k: number, secX: number, secY: number, mat: number, skip: (axis: 'x' | 'y', at: number, from: number, to: number) => boolean = () => false, extra: Record<string, unknown> = {}): void {
    const X = this.ax.x.map((a) => a.at), Y = this.ax.y.map((a) => a.at);
    for (const y of Y) for (let i = 1; i < X.length; i++) if (!skip('x', y, X[i - 1]!, X[i]!)) this.beamX(k, y, X[i - 1]!, X[i]!, secX, mat, extra);
    for (const x of X) for (let j = 1; j < Y.length; j++) if (!skip('y', x, Y[j - 1]!, Y[j]!)) this.beamY(k, x, Y[j - 1]!, Y[j]!, secY, mat, extra);
  }

  /**
   * The beams' and slabs' tops on each level (`placement.ts`), and each column on the edge of the
   * plan held by its outer face, a corner one by its corner, so a smaller section above stays flush
   * with the façade; the inner ones centred.
   */
  flushOnLevels(): void {
    const xs = [...this.columnsAt.values()].map((p) => p[0]), ys = [...this.columnsAt.values()].map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const columns: Record<string, string> = {};
    for (const [key, [x, y]] of this.columnsAt) {
      const k = `${x === x0 ? 'nx' : x === x1 ? 'px' : ''}${y === y0 ? 'ny' : y === y1 ? 'py' : ''}`;
      columns[key] = k || 'c';
    }
    this.placed = { reference: 'slabTop', columns };
  }

  text(settings: GeneratorSettings): string {
    if (this.placed) this.m.setting('designData', { version: 1, placement: this.placed });
    this.m.setting('regulations', generatorRegulations(settings));
    return this.m.text();
  }
}

const H25 = concrete(25);
const names = (n: number, from: string) => Array.from({ length: n }, (_, i) => (from === 'A' ? String.fromCharCode(65 + i) : String(i + 1)));
const axes = (at: number[], from: string): Axis[] => { const n = names(at.length, from); return at.map((v, i) => ({ name: n[i]!, at: v })); };
const storeys = (base: Array<[string, number]>): LevelDef[] => base.map(([name, z]) => ({ name, z }));
/** How far a lift shaft rises over its last stop's floor, to the slab that closes it, m. */
const OVERRUN = 1.2;

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

/**
 * A lift shaft's walls from the ground to its overrun over the roof, open on its door's side but
 * above the roof, and the slab that closes it. Over the roof its corners are jambs, the walls' own
 * edges given as bars by their properties: the wind of a band is spread over the bars that cross
 * it, and a section by its properties has no plan the slab's mesh would draw again inside the walls.
 */
function liftShaft(b: Building, shaft: Box, door: 'y0' | 'y1', top: number, t: number, hc: number, col: number, walls: Array<[string, [number, number], [number, number]]>, halves = false): void {
  const over = top + 1;
  for (const [name, a, c] of walls) { b.wall(name, a, c, 0, top, t, hc, halves); b.wall(name, a, c, top, over, t, hc); }
  const y = door === 'y0' ? shaft.y0 : shaft.y1;
  b.wall('ascensor frente', [shaft.x0, y], [shaft.x1, y], top, over, t, hc);
  for (const [x, yy] of [[shaft.x0, shaft.y0], [shaft.x1, shaft.y0], [shaft.x1, shaft.y1], [shaft.x0, shaft.y1]] as const) b.column(x, yy, top, over, () => col, hc);
  b.cap('Losa de sobre-recorrido', over, shaft, t, hc);
}

// ─── A two-storey house ──────────────────────────────────────────────────────────────────────
function house(): string {
  const levels = storeys([['PB', 0], ['Planta alta', 2.8], ['Azotea', 5.6]]);
  const b = new Building('Vivienda de H.A. de dos plantas', [
    'A two-storey concrete house, two bays each way: 20 × 20 columns, 20 × 40 beams on every axis',
    'and 12 cm solid slabs, a plate a bay. Loads and combinations from the load generator.',
  ], { x: axes([0, 4, 8], '1'), y: axes([0, 4.5, 9], 'A') }, levels);
  const hc = b.m.material('Hormigón H-25', H25);
  const col = b.m.rect('Col 20×20', 0.2, 0.2), beam = b.m.rect('Viga 20×40', 0.2, 0.4);
  for (const x of [0, 4, 8]) for (const y of [0, 4.5, 9]) b.column(x, y, 0, 2, () => col, hc);
  for (const k of [1, 2]) { b.axisBeams(k, beam, beam, hc); b.slab(k, 0.12, hc, { x0: 0, x1: 8, y0: 0, y1: 9 }); }
  b.flushOnLevels();
  return b.text({ ...CITY_WIND });
}

// ─── A four-storey building ──────────────────────────────────────────────────────────────────
function fourStorey(): string {
  const levels = storeys([['PB', 0], ['1º piso', 3.5], ['2º piso', 6.8], ['3º piso', 10.1], ['Azotea', 13.4]]);
  const b = new Building('Edificio de H.A. de 4 pisos', [
    'A four-storey concrete residential building, three by two bays of 6 m: columns 40 × 40 below and',
    '35 × 35 above, 25 × 55 beams on every axis and 15 cm two-way slabs, a plate a bay.',
  ], { x: axes([0, 6, 12, 18], '1'), y: axes([0, 6, 12], 'A') }, levels);
  const hc = b.m.material('Hormigón H-25', H25);
  const low = b.m.rect('Col 40×40', 0.4, 0.4), up = b.m.rect('Col 35×35', 0.35, 0.35), beam = b.m.rect('Viga 25×55', 0.25, 0.55);
  for (const x of [0, 6, 12, 18]) for (const y of [0, 6, 12]) b.column(x, y, 0, 4, (k) => (k < 2 ? low : up), hc);
  for (let k = 1; k <= 4; k++) { b.axisBeams(k, beam, beam, hc); b.slab(k, 0.15, hc, { x0: 0, x1: 18, y0: 0, y1: 12 }); }
  b.flushOnLevels();
  return b.text({ ...CITY_WIND, windDyn: approximate('concreteMomentFrame') });
}

// ─── Concrete floors on steel columns ────────────────────────────────────────────────────────
function steelColumns(): string {
  const levels = storeys([['PB', 0], ['1º piso', 4], ['2º piso', 7.5], ['Azotea', 11]]);
  const b = new Building('Edificio de H.A. con columnas de acero', [
    'A three-storey residential building: steel HEB columns, fixed at their base plates, carry concrete',
    'beams and 14 cm slabs, a plate a bay; two by three bays of 7 × 6 m.',
  ], { x: axes([0, 7, 14], '1'), y: axes([0, 6, 12, 18], 'A') }, levels);
  const steel = b.m.material('Acero F-24', STEEL), hc = b.m.material('Hormigón H-25', H25);
  const low = b.m.profile('HEB 260'), up = b.m.profile('HEB 220');
  const bx = b.m.rect('Viga 25×60', 0.25, 0.6), by = b.m.rect('Viga 20×50', 0.2, 0.5);
  for (const x of [0, 7, 14]) for (const y of [0, 6, 12, 18]) b.column(x, y, 0, 3, (k) => (k < 2 ? low : up), steel);
  for (let k = 1; k <= 3; k++) { b.axisBeams(k, bx, by, hc); b.slab(k, 0.14, hc, { x0: 0, x1: 14, y0: 0, y1: 18 }); }
  b.flushOnLevels();
  return b.text({ ...CITY_WIND });
}

// ─── Six storeys around a lift shaft ─────────────────────────────────────────────────────────
function liftCore(): string {
  const levels = storeys([['PB', 0], ['1º piso', 3.2], ['2º piso', 6.2], ['3º piso', 9.2], ['4º piso', 12.2], ['5º piso', 15.2], ['Azotea', 18.2], ['Sobre-recorrido', 18.2 + OVERRUN]]);
  const shaft = { x0: 7.25, x1: 9.25, y0: 9, y1: 11 }, top = 6;
  const b = new Building('Edificio de H.A. de 6 plantas con caja de ascensor', [
    'A six-storey concrete residential building, three by two bays of 5.5 m, with a lift shaft of',
    '15 cm walls against the back façade, open through every floor to its overrun over the roof and',
    'the slab that closes it; a lintel beam at its door on every floor.',
  ], { x: axes([0, 5.5, 11, 16.5], '1'), y: axes([0, 5.5, 11], 'A') }, levels, { x: [shaft.x0, shaft.x1], y: [shaft.y0] }, 1.5);
  const hc = b.m.material('Hormigón H-25', H25);
  const col = b.m.rect('Col 40×40', 0.4, 0.4), beam = b.m.rect('Viga 25×50', 0.25, 0.5);
  const small = b.m.declared('Jamba 15×15', { a: 0.0225, iy: 4.22e-5, iz: 4.22e-5, j: 7.13e-5 });
  // One section up the whole building: a column narrower above puts the faces of both on the walls between, a strip a few centimetres wide in every mesh they reach.
  for (const x of [0, 5.5, 11, 16.5]) for (const y of [0, 5.5, 11]) b.column(x, y, 0, top, () => col, hc);
  liftShaft(b, shaft, 'y0', top, 0.15, hc, small, [
    ['caja 1', [shaft.x0, shaft.y0], [shaft.x0, shaft.y1]],
    ['caja 2', [shaft.x0, shaft.y1], [shaft.x1, shaft.y1]],
    ['caja 3', [shaft.x1, shaft.y0], [shaft.x1, shaft.y1]],
  ]);
  for (let k = 1; k <= top; k++) {
    b.axisBeams(k, beam, beam, hc, (axis, at, from, to) => axis === 'x' && at === 11 && from === 5.5 && to === 11);
    b.beamX(k, shaft.y1, 5.5, shaft.x0, beam, hc);
    b.beamX(k, shaft.y1, shaft.x1, 11, beam, hc);
    b.beamX(k, shaft.y0, shaft.x0, shaft.x1, beam, hc);
    b.slab(k, 0.13, hc, { x0: 0, x1: 16.5, y0: 0, y1: 11 }, [shaft]);
  }
  b.flushOnLevels();
  return b.text({ ...CITY_WIND, windDyn: approximate('otherSteelOrConcrete') });
}

// ─── Seven storeys between party walls, with the lift and the stair ──────────────────────────
function partyWall(): string {
  const levels = storeys([['PB', 0], ['1º piso', 3], ['2º piso', 5.8], ['3º piso', 8.6], ['4º piso', 11.4], ['5º piso', 14.2], ['6º piso', 17], ['Azotea', 19.8], ['Sobre-recorrido', 19.8 + OVERRUN]]);
  const run = 2.64, landingDepth = 1.2, mid = 3.05, gap = 0.1, top = 7, steps = 9, ts = 0.26;
  const shaft = { x0: 0, x1: 1.9, y0: 8.5, y1: 10.46 }, foot = shaft.y1, head = foot + run;
  const stair = { x0: 1.9, x1: 4.2, y0: 8.5, y1: head + landingDepth };
  const b = new Building('Edificio entre medianeras de PB y 6 pisos', [
    'A seven-storey concrete block of flats on an 8.6 m city lot, columns against both party walls',
    'and at the ends of the core walls: a lift shaft open through every floor to its overrun over the',
    'roof and the slab that closes it, and a stairwell of 15 cm walls entered by a door from the hall',
    'onto the floor\'s landing, with a U stair of two flights of nine risers and a landing a storey up',
    'to the last floor, 26 cm thick for the 5.8 m it spans between its walls. The floor\'s',
    'landing reaches the back of the lift shaft, so the floors are cut on the lines the core already has',
    'and their meshes stay even. The wind blows on the front and the back only.',
  ], { x: axes([0, 4.2, 8.4], '1'), y: axes([0, 4.5, 8.5, 11.7, 16.2, 20.7], 'A') }, levels, { x: [shaft.x1, mid], y: [shaft.y1, stair.y1] }, 1.2);
  const hc = b.m.material('Hormigón H-25', H25);
  // One section for every column: columns of other sizes on one axis put their faces a few centimetres apart, a strip that crosses every mesh of the floor.
  const col = b.m.rect('Col 20×60', 0.2, 0.6), beam = b.m.rect('Viga 20×45', 0.2, 0.45);
  const small = b.m.declared('Jamba 15×15', { a: 0.0225, iy: 4.22e-5, iz: 4.22e-5, j: 7.13e-5 });
  for (const x of [0, 4.2, 8.4]) for (const y of [0, 4.5, 8.5, 11.7, 16.2, 20.7]) b.column(x, y, 0, top, () => col, hc, { rollAngle: 90 });
  // The landing meets the stairwell's walls at mid storey: they are cut there, so its edges are theirs.
  liftShaft(b, shaft, 'y0', top, 0.15, hc, small, [
    ['ascensor 1', [shaft.x0, shaft.y0], [shaft.x0, shaft.y1]],
    ['ascensor 2', [shaft.x0, shaft.y1], [shaft.x1, shaft.y1]],
    ['ascensor 3', [shaft.x1, shaft.y0], [shaft.x1, shaft.y1]],
  ], true);
  b.wall('escalera 1', [stair.x0, shaft.y1], [stair.x0, stair.y1], 0, top, 0.15, hc, true);
  b.wall('escalera 2', [stair.x0, stair.y1], [stair.x1, stair.y1], 0, top, 0.15, hc, true);
  b.wall('escalera 3', [stair.x1, stair.y0], [stair.x1, stair.y1], 0, top, 0.15, hc, true);
  b.wallWithDoor('escalera frente', [stair.x0, stair.y0], [stair.x1, stair.y0], 0, top, { from: 0, width: mid - stair.x0, height: 2.1 }, 0.15, hc);
  const onCore = (axis: 'x' | 'y', at: number, from: number) =>
    (axis === 'y' && at === 0 && from === 8.5) || (axis === 'y' && at === 4.2 && from === 8.5) || (axis === 'x' && at === 11.7 && from === 0);
  for (let k = 1; k <= top; k++) {
    b.axisBeams(k, beam, beam, hc, onCore);
    b.beamY(k, 0, shaft.y1, 11.7, beam, hc);
    b.beamX(k, 11.7, 0, stair.x0, beam, hc);
    b.slab(k, 0.12, hc, { x0: 0, x1: 8.4, y0: 0, y1: 20.7 }, k < top ? [shaft, stair] : [shaft]);
    if (k < top) b.landing(`Descanso de piso · ${levels[k]!.name}`, { ...stair, y1: foot }, b.z(k), ts, hc, k);
  }
  // A U stair a storey up to the last floor, from the floor's landing inside the door: up along +Y,
  // a landing against the back wall at mid height, and back along −Y onto the landing of the floor
  // above; nine risers of 15,5 to 16,7 cm on treads of 33, under 30°, the slope the load generator
  // still loads as a floor; the flights clear of the side walls, held at their ends: an inclined side
  // in a wall's plane is one its grid of rectangles cannot follow, the flight against the column the
  // width of the column's face away.
  for (const x of [stair.x0 + gap, mid, stair.x1 - gap]) b.m.support(b.m.node(x, foot, 0), 'pinned3d');
  for (let k = 0; k < top - 1; k++) {
    const z0 = b.z(k), z1 = b.z(k + 1), zm = (z0 + z1) / 2, at = levels[k]!.name;
    b.flight(`Tramo 1 · ${at}`, stair.x0 + gap, mid, foot, head, z0, zm, steps, ts, hc, k);
    b.landing(`Descanso · ${at}`, { x0: stair.x0, x1: stair.x1, y0: head, y1: stair.y1 }, zm, ts, hc, k);
    b.flight(`Tramo 2 · ${at}`, stair.x1 - gap, mid, head, foot, zm, z1, steps, ts, hc, k);
  }
  b.flushOnLevels();
  return b.text({ ...CITY_WIND, windDirs: ['+y', '-y'], windDyn: approximate('otherSteelOrConcrete') });
}

// ─── A steel building with concrete slabs and a core ─────────────────────────────────────────
function steelBuildingSlabs(): string {
  const levels = storeys([['PB', 0], ['1º piso', 3.6], ['2º piso', 7.2], ['Azotea', 10.8]]);
  const core = { x0: 0, x1: 3, y0: 6, y1: 9 };
  const b = new Building('Edificio de acero con losas y núcleo', [
    'A two-by-three bay steel frame, three storeys, with 12 cm concrete slabs on main and secondary',
    'beams, a plate between them, and a concrete core, a column at its corner on the grid. The beams',
    'sit under the slab: their axis is offset below its mid-plane.',
  ], { x: axes([0, 6, 12], '1'), y: axes([0, 6, 12, 18], 'A') }, levels, { x: [core.x1], y: [3, core.y1, 15] });
  const steel = b.m.material('Acero F-24', STEEL), hc = b.m.material('Hormigón H-25', H25);
  const col = b.m.profile('HEB 240'), beam = b.m.profile('IPE 360'), secondary = b.m.profile('IPE 270');
  const off = (d: number) => ({ offset: { frame: 'global', i: { x: 0, y: 0, z: d }, j: { x: 0, y: 0, z: d } } });
  for (const x of [0, 6, 12]) for (const y of [0, 6, 12, 18]) b.column(x, y, 0, 3, () => col, steel);
  for (const [name, a, c] of [['núcleo 1', [0, 6], [3, 6]], ['núcleo 2', [3, 6], [3, 9]], ['núcleo 3', [3, 9], [0, 9]], ['núcleo 4', [0, 9], [0, 6]]] as Array<[string, [number, number], [number, number]]>) {
    b.wall(name, a, c, 0, 3, 0.2, hc);
  }
  for (let k = 1; k <= 3; k++) {
    b.axisBeams(k, beam, beam, steel, () => false, off(-(0.36 / 2 + 0.06)));
    for (const y of [3, 9, 15]) b.beamX(k, y, 0, 12, secondary, steel, off(-(0.27 / 2 + 0.06)));
    const z = b.z(k);
    for (const [x0, x1] of [[0, 6], [6, 12]]) for (const [y0, y1] of [[0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 18]]) {
      b.plate(`Losa ${x0}–${x1} × ${y0}–${y1} · ${levels[k]!.name}`, [[x0!, y0!, z], [x1!, y0!, z], [x1!, y1!, z], [x0!, y1!, z]], { kind: 'slab', typology: 'solid', levelFrom: `lv-${k}` }, hc, 0.12);
    }
  }
  return b.text({ ...CITY_WIND });
}

export const BUILDINGS: Record<string, () => string> = {
  'pro-rc-house': house,
  'pro-rc-four-storey': fourStorey,
  'pro-rc-steel-columns': steelColumns,
  'pro-rc-lift-core': liftCore,
  'pro-rc-party-wall': partyWall,
  'pro-steel-building-slabs': steelBuildingSlabs,
};
