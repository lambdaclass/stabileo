/**
 * The PRO examples that are written as model code, built from their dimensions.
 *
 *     npx vite-node scripts/build-pro-examples.ts
 *
 * writes `src/lib/templates/examples/<id>.stabileo.txt` (only the ids given, when some are). Each model is a function of a few
 * numbers (spans, heights, sections, loads), so changing one of them regenerates the model
 * whole instead of editing hundreds of lines. Sections come from the app's own catalogue, as a
 * user picking them would get them; the buildings' loads are written by the app's own load
 * generator (`pro-examples/buildings.ts`).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Model, STEEL, GRAVITY, concrete, range } from './pro-examples/model';
import { BUILDINGS } from './pro-examples/buildings';

const OUT = fileURLToPath(new URL('../src/lib/templates/examples/', import.meta.url));

// ─── 1. A plane steel frame under equivalent lateral forces ───────────────────────────────────
function planeFrameSeismic(): Model {
  const m = new Model('Pórtico plano con sismo estático', [
    'A three-bay, four-storey steel plane frame under the static equivalent lateral forces of an',
    'earthquake: the base shear is 0.15 of the seismic weight (D + 0.25 L), shared by height.',
  ]);
  const xs = [0, 6, 13.5, 19.5];
  const zs = [0, 4.2, 7.7, 11.2, 14.7];
  const steel = m.material('Acero F-24', STEEL);
  const colLow = m.profile('HEB 300'), colUp = m.profile('HEB 240');
  const beam = m.profile('IPE 400'), roofBeam = m.profile('IPE 330');
  const D = m.case('D', 'Cargas permanentes');
  const L = m.case('L', 'Sobrecarga de uso');
  const Lr = m.case('Lr', 'Sobrecarga de cubierta');
  const E = m.case('E', 'Sismo X');
  for (const x of xs) m.support(m.node(x, 0, 0), 'fixed3d');
  for (let f = 1; f < zs.length; f++) {
    for (const x of xs) m.member(m.node(x, 0, zs[f - 1]!), m.node(x, 0, zs[f]!), f <= 2 ? colLow : colUp, steel);
    const roof = f === zs.length - 1;
    for (let b = 0; b + 1 < xs.length; b++) {
      const el = m.member(m.node(xs[b]!, 0, zs[f]!), m.node(xs[b + 1]!, 0, zs[f]!), roof ? roofBeam : beam, steel);
      m.global(el, D, { z: roof ? -10 : -16 });
      m.global(el, roof ? Lr : L, { z: roof ? -3 : -9 });
    }
  }
  // Seismic weight per level: the line loads over the frame's length, D + 0.25 L (the roof live
  // load does not count), plus the steel of the members at that level; then the static method.
  const length = xs[xs.length - 1]!;
  const w = zs.slice(1).map((_, k) => {
    const roof = k === zs.length - 2;
    return length * ((roof ? 10 : 16) + (roof ? 0 : 0.25 * 9)) + 8; // + 8 kN for the steel
  });
  const V = 0.15 * w.reduce((s, v) => s + v, 0);
  const wz = w.reduce((s, v, k) => s + v * zs[k + 1]!, 0);
  for (let k = 0; k < w.length; k++) {
    const F = (V * w[k]! * zs[k + 1]!) / wz;
    for (const x of xs) m.nodal(m.node(x, 0, zs[k + 1]!), E, { fx: F / xs.length });
  }
  m.setting('analysis', { selfWeight: [GRAVITY(D)] });
  return m;
}

// ─── 4. A light shed: portal frames with pitched roof trusses ────────────────────────────────
function simpleShed(): Model {
  const m = new Model('Galpón simple', [
    'Four portal frames at 6 m: steel columns carrying pitched roof trusses of angles,',
    'channel purlins, and crossed bracing in the end bays. Wind acts on the walls and the roof.',
  ]);
  const span = 16, eave = 5, rise = 1.6, depth = 1.0, bays = 3, spacing = 6, panels = 8;
  const steel = m.material('Acero F-24', STEEL);
  const col = m.profile('IPE 300'), chord = m.profile('L 76.2x76.2x9.5'), web = m.profile('L 50.8x50.8x7.9');
  const purlin = m.profile('UPN 120'), brace = m.profile('L 50.8x50.8x7.9');
  const D = m.case('D', 'Cargas permanentes');
  const Lr = m.case('Lr', 'Sobrecarga de cubierta');
  const W = m.case('W', 'Viento X');
  const alpha = Math.atan(rise / (span / 2));
  const top = (x: number) => eave + depth + (x <= span / 2 ? x : span - x) * (rise / (span / 2));
  const bottom = eave;
  for (let f = 0; f <= bays; f++) {
    const y = f * spacing;
    for (const x of [0, span]) {
      m.support(m.node(x, y, 0), 'pinned3d');
      const c = m.member(m.node(x, y, 0), m.node(x, y, eave), col, steel);
      m.member(m.node(x, y, eave), m.node(x, y, eave + depth), col, steel);
      // Wind on the walls: 0.7 kN/m² windward, 0.35 leeward suction, over the frame's width.
      const width = f === 0 || f === bays ? spacing / 2 : spacing;
      m.global(c, W, { x: (x === 0 ? 0.7 : 0.35) * width });
    }
    const xs = range(panels + 1).map((k) => (k * span) / panels);
    for (let k = 0; k < panels; k++) {
      const a = xs[k]!, b = xs[k + 1]!;
      m.member(m.node(a, y, top(a)), m.node(b, y, top(b)), chord, steel, { rollAngle: 90 });
      m.member(m.node(a, y, bottom), m.node(b, y, bottom), chord, steel, { rollAngle: 90 });
      if (k + 1 < panels) m.member(m.node(b, y, bottom), m.node(b, y, top(b)), web, steel, {}, 'truss');
      const up = b <= span / 2;
      m.member(up ? m.node(a, y, bottom) : m.node(b, y, bottom), up ? m.node(b, y, top(b)) : m.node(a, y, top(a)), web, steel, {}, 'truss');
    }
  }
  // Purlins at every top-chord node, loaded per metre by the roof actions over their spacing.
  const xs = range(panels + 1).map((k) => (k * span) / panels);
  for (const x of xs) for (let f = 0; f < bays; f++) {
    const el = m.member(m.node(x, f * spacing, top(x)), m.node(x, (f + 1) * spacing, top(x)), purlin, steel);
    const trib = (x === 0 || x === span ? 0.5 : 1) * (span / panels) / Math.cos(alpha);
    m.global(el, D, { z: -0.15 * trib });
    m.global(el, Lr, { z: -0.3 * (span / panels) * (x === 0 || x === span ? 0.5 : 1) });
    // Roof suction 0.5 kN/m² normal to each slope (up and outward).
    const s = x < span / 2 ? -1 : x > span / 2 ? 1 : 0;
    m.global(el, W, { x: s * 0.5 * trib * Math.sin(alpha), z: 0.5 * trib * Math.cos(alpha) });
  }
  // Crossed bracing in both end bays, on the roof and on both walls.
  for (const f of [0, bays - 1]) {
    const y0 = f * spacing, y1 = y0 + spacing;
    for (let k = 0; k < panels; k += 2) {
      const a = xs[k]!, b = xs[k + 2]!;
      m.member(m.node(a, y0, top(a)), m.node(b, y1, top(b)), brace, steel, {}, 'truss');
      m.member(m.node(b, y0, top(b)), m.node(a, y1, top(a)), brace, steel, {}, 'truss');
    }
    for (const x of [0, span]) {
      m.member(m.node(x, y0, 0), m.node(x, y1, eave), brace, steel, {}, 'truss');
      m.member(m.node(x, y1, 0), m.node(x, y0, eave), brace, steel, {}, 'truss');
    }
  }
  // Eave struts join the column heads along the building.
  for (const x of [0, span]) for (let f = 0; f < bays; f++) m.member(m.node(x, f * spacing, eave), m.node(x, (f + 1) * spacing, eave), purlin, steel);
  m.setting('analysis', { selfWeight: [GRAVITY(D)] });
  return m;
}

// ─── 5. A storehouse on concrete bearing walls ───────────────────────────────────────────────
function concreteWallStorehouse(): Model {
  const m = new Model('Depósito con muros de hormigón', [
    'Two 20 cm concrete bearing walls, 24 m long, meshed as shells and fixed along their whole',
    'base, carry five steel roof trusses and the channels that tie them along the building.',
  ]);
  const L = 24, span = 14, H = 4.5, t = 0.2, dx = 1, rows = 6, bays = 4, panels = 7, depth = 1.8;
  const steel = m.material('Acero F-24', STEEL);
  const hc = m.material('Hormigón H-25', concrete(25));
  const chord = m.profile('L 101.6x101.6x7.9'), web = m.profile('L 63.5x63.5x4.8'), channel = m.profile('UPN 160');
  const D = m.case('D', 'Cargas permanentes');
  const Lr = m.case('Lr', 'Sobrecarga de cubierta');
  const W = m.case('W', 'Viento X');
  for (const x of [0, span]) {
    for (let i = 0; i < L / dx; i++) for (let k = 0; k < rows; k++) {
      const y = i * dx, z0 = (k * H) / rows, z1 = ((k + 1) * H) / rows;
      m.quad([m.node(x, y, z0), m.node(x, y + dx, z0), m.node(x, y + dx, z1), m.node(x, y, z1)], hc, t);
    }
    // On a continuous footing, held along the whole base.
    for (let i = 0; i <= L / dx; i++) m.support(m.node(x, i * dx, 0), 'fixed3d');
    // The channel along the wall top ties the truss seats.
    m.line({ x, y: 0, z: H }, { x, y: L, z: H }, channel, steel, L / dx);
  }
  const xs = range(panels * 2 + 1).map((k) => (k * span) / (panels * 2));
  const topZ = (x: number) => H + depth * (1 - Math.abs(x - span / 2) / (span / 2));
  for (let f = 0; f <= bays; f++) {
    const y = (f * L) / bays;
    for (let k = 0; k + 1 < xs.length; k++) {
      const a = xs[k]!, b = xs[k + 1]!;
      // Top chord pinned where it sits on the wall; bottom chord ties the two seats.
      const release = k === 0 ? { releaseI: { my: true, mz: true, t: false } } : k === xs.length - 2 ? { releaseJ: { my: true, mz: true, t: false } } : {};
      m.member(m.node(a, y, topZ(a)), m.node(b, y, topZ(b)), chord, steel, release);
      m.member(m.node(a, y, H), m.node(b, y, H), chord, steel, release);
      if (k + 1 < xs.length - 1) m.member(m.node(b, y, H), m.node(b, y, topZ(b)), web, steel, {}, 'truss');
      const toward = b <= span / 2 ? [a, b] : [b, a];
      if (k > 0 && k < xs.length - 2) m.member(m.node(toward[0]!, y, H), m.node(toward[1]!, y, topZ(toward[1]!)), web, steel, {}, 'truss');
    }
    // Roof loads at the top-chord nodes: 0.3 kN/m² dead, 0.3 live, over the truss's width.
    const width = f === 0 || f === bays ? L / bays / 2 : L / bays;
    for (const x of xs) {
      const trib = (x === 0 || x === span ? 0.5 : 1) * (span / (panels * 2)) * width;
      m.nodal(m.node(x, y, topZ(x)), D, { fz: -0.3 * trib });
      m.nodal(m.node(x, y, topZ(x)), Lr, { fz: -0.3 * trib });
    }
  }
  // The ridge channel, and the wind on the walls taken at the wall-top nodes: 0.7 kN/m²
  // windward and 0.35 suction leeward over half the wall height.
  m.line({ x: span / 2, y: 0, z: topZ(span / 2) }, { x: span / 2, y: L, z: topZ(span / 2) }, channel, steel, bays);
  for (let i = 0; i <= L / dx; i++) {
    const trib = (i === 0 || i === L / dx ? 0.5 : 1) * dx * (H / 2);
    m.nodal(m.node(0, i * dx, H), W, { fx: 0.7 * trib });
    m.nodal(m.node(span, i * dx, H), W, { fx: 0.35 * trib });
  }
  m.setting('analysis', { selfWeight: [GRAVITY(D)] });
  return m;
}

// ─── 6. A hangar with an overhead crane, to second order ─────────────────────────────────────
function craneHangar(): Model {
  const m = new Model('Hangar con puente grúa', [
    'Six portal frames at 7.5 m spanning 24 m, with roof trusses, purlins, bracing and runway beams',
    'on column brackets. The crane stands at three positions; each combination is solved with P-Delta.',
  ]);
  const span = 24, eave = 9, rail = 6.5, depth = 2, frames = 6, spacing = 7.5, panels = 12, bracket = 0.6;
  const steel = m.material('Acero F-24', STEEL);
  const col = m.profile('HEB 400'), chord = m.profile('HEB 160'), web = m.profile('L 76.2x76.2x9.5');
  const runway = m.profile('IPE 450'), purlin = m.profile('UPN 160'), brace = m.profile('L 76.2x76.2x9.5');
  const bracketSec = m.profile('HEB 300');
  const D = m.case('D', 'Cargas permanentes');
  const Lr = m.case('Lr', 'Sobrecarga de cubierta');
  const S = m.case('S', 'Nieve');
  const W = m.case('W', 'Viento X');
  const cranes = [2, 3, 4].map((k) => m.case('L', `Grúa en el pórtico ${k}`));
  const xs = range(panels + 1).map((k) => (k * span) / panels);
  const L = spacing * (frames - 1);
  for (let f = 0; f < frames; f++) {
    const y = f * spacing;
    for (const x of [0, span]) {
      m.support(m.node(x, y, 0), 'fixed3d');
      const lower = m.member(m.node(x, y, 0), m.node(x, y, rail), col, steel);
      const upper = m.member(m.node(x, y, rail), m.node(x, y, eave), col, steel);
      m.member(m.node(x, y, eave), m.node(x, y, eave + depth), col, steel);
      const inward = x === 0 ? bracket : span - bracket;
      m.member(m.node(x, y, rail), m.node(inward, y, rail), bracketSec, steel);
      const width = f === 0 || f === frames - 1 ? spacing / 2 : spacing;
      for (const c of [lower, upper]) m.global(c, W, { x: (x === 0 ? 0.8 : 0.4) * width });
    }
    for (let k = 0; k < panels; k++) {
      const a = xs[k]!, b = xs[k + 1]!;
      m.member(m.node(a, y, eave + depth), m.node(b, y, eave + depth), chord, steel);
      m.member(m.node(a, y, eave), m.node(b, y, eave), chord, steel);
      if (k + 1 < panels) m.member(m.node(b, y, eave), m.node(b, y, eave + depth), web, steel, {}, 'truss');
      const toward = b <= span / 2 ? [a, b] : [b, a];
      m.member(m.node(toward[0]!, y, eave), m.node(toward[1]!, y, eave + depth), web, steel, {}, 'truss');
    }
  }
  // Runway beams on the bracket tips, cut every quarter bay so the wheels sit on nodes.
  for (const x of [bracket, span - bracket]) m.line({ x, y: 0, z: rail }, { x, y: L, z: rail }, runway, steel, (frames - 1) * 4);
  // Purlins, with the roof actions per metre: 0.25 dead, 0.3 roof live, 0.5 snow, 0.4 suction.
  for (const x of xs) for (let f = 0; f + 1 < frames; f++) {
    const el = m.member(m.node(x, f * spacing, eave + depth), m.node(x, (f + 1) * spacing, eave + depth), purlin, steel);
    const trib = (x === 0 || x === span ? 0.5 : 1) * (span / panels);
    m.global(el, D, { z: -0.25 * trib });
    m.global(el, Lr, { z: -0.3 * trib });
    m.global(el, S, { z: -0.5 * trib });
    m.global(el, W, { z: 0.4 * trib });
  }
  // Bracing in the end bays: roof and walls.
  for (const f of [0, frames - 2]) {
    const y0 = f * spacing, y1 = y0 + spacing;
    for (let k = 0; k < panels; k += 2) {
      const a = xs[k]!, b = xs[k + 2]!;
      m.member(m.node(a, y0, eave + depth), m.node(b, y1, eave + depth), brace, steel, {}, 'truss');
      m.member(m.node(b, y0, eave + depth), m.node(a, y1, eave + depth), brace, steel, {}, 'truss');
    }
    for (const x of [0, span]) {
      m.member(m.node(x, y0, 0), m.node(x, y1, rail), brace, steel, {}, 'truss');
      m.member(m.node(x, y1, 0), m.node(x, y0, rail), brace, steel, {}, 'truss');
    }
  }
  // The crane: two wheels a side, 3.75 m apart, centred on a frame; 110 kN a wheel on the
  // loaded side with 8 kN of lateral surge, 45 kN on the other.
  cranes.forEach((c, k) => {
    const yc = (k + 1) * spacing;
    for (const y of [yc - spacing / 4, yc + spacing / 4]) {
      m.nodal(m.node(bracket, y, rail), c, { fz: -110, fx: 8 });
      m.nodal(m.node(span - bracket, y, rail), c, { fz: -45 });
    }
  });
  m.setting('analysis', { selfWeight: [GRAVITY(D)], perCombination: 'pdelta' });
  const lr = (terms: Array<[number, number]>) => terms;
  m.combination('1,4 D', lr([[D, 1.4]]));
  m.combination('1,2 D + 1,6 Lr', [[D, 1.2], [Lr, 1.6]]);
  m.combination('1,2 D + 1,6 S', [[D, 1.2], [S, 1.6]]);
  cranes.forEach((c, k) => m.combination(`1,2 D + 1,6 Grúa ${k + 2} + 0,5 S`, [[D, 1.2], [c, 1.6], [S, 0.5]]));
  m.combination('1,2 D + 1,0 W + 0,5 S', [[D, 1.2], [W, 1], [S, 0.5]]);
  cranes.forEach((c, k) => m.combination(`1,2 D + 1,0 W + 1,0 Grúa ${k + 2}`, [[D, 1.2], [W, 1], [c, 1]]));
  m.combination('0,9 D + 1,0 W', [[D, 0.9], [W, 1]]);
  return m;
}

// ─── 7. A guyed lattice mast ─────────────────────────────────────────────────────────────────
function guyedTower(): Model {
  const m = new Model('Torre arriostrada con tensores', [
    'A 42 m triangular lattice mast, 1.2 m a face, held at three levels by nine guys that work in',
    'tension only. The wind blows along X; a guy that goes slack leaves the analysis for that case.',
  ]);
  const Ht = 42, face = 1.2, panel = 1.5, anchors = 24;
  const steel = m.material('Acero F-24', STEEL);
  const cable = m.material('Cable de acero', { e: 160000, nu: 0.3, rho: 78.5, alpha: 1.2e-5 });
  const leg = m.profile('L 76.2x76.2x9.5'), diag = m.profile('L 38.1x38.1x3.2');
  const guy = m.declared('Cable Ø16', { a: 1.6e-4, iy: 1e-9, iz: 1e-9, j: 2e-9 });
  const D = m.case('D', 'Peso propio');
  const W = m.case('W', 'Viento X');
  const R = face / Math.sqrt(3);
  const corner = (k: number, z: number) => ({ x: R * Math.cos((2 * Math.PI * k) / 3), y: R * Math.sin((2 * Math.PI * k) / 3), z });
  const n = Math.round(Ht / panel);
  // The legs are bolted to their base plates: fixed. On pins, nothing would hold a leg's spin
  // about its own axis, since every member that reaches it is a truss.
  for (let k = 0; k < 3; k++) { const p = corner(k, 0); m.support(m.node(p.x, p.y, 0), 'fixed3d'); }
  const tower: number[] = [];
  for (let s = 0; s < n; s++) {
    const z0 = s * panel, z1 = z0 + panel;
    for (let k = 0; k < 3; k++) {
      const a = corner(k, z0), b = corner(k, z1), c = corner((k + 1) % 3, z1);
      tower.push(m.member(m.node(a.x, a.y, a.z), m.node(b.x, b.y, b.z), leg, steel));
      tower.push(m.member(m.node(b.x, b.y, b.z), m.node(c.x, c.y, c.z), diag, steel, {}, 'truss'));
      const d = s % 2 === 0 ? [a, c] : [corner((k + 1) % 3, z0), b];
      tower.push(m.member(m.node(d[0]!.x, d[0]!.y, d[0]!.z), m.node(d[1]!.x, d[1]!.y, d[1]!.z), diag, steel, {}, 'truss'));
    }
  }
  // Guys at three levels to three anchors at 120°, each anchored on the ground at 24 m.
  const guys: number[] = [];
  for (const z of [15, 30, 42]) for (let k = 0; k < 3; k++) {
    const top = corner(k, z), th = (2 * Math.PI * k) / 3;
    const anchor = m.node(anchors * Math.cos(th), anchors * Math.sin(th), 0);
    guys.push(m.member(m.node(top.x, top.y, top.z), anchor, guy, cable, { behaviour: 'tensionOnly' }));
  }
  for (let k = 0; k < 3; k++) { const th = (2 * Math.PI * k) / 3; m.support(m.node(anchors * Math.cos(th), anchors * Math.sin(th), 0), 'pinned3d'); }
  // Wind along X: 0.12 kN per metre of every tower member and 0.03 per metre of guy.
  for (const el of tower) m.global(el, W, { x: 0.12 });
  for (const el of guys) m.global(el, W, { x: 0.03 });
  m.setting('analysis', { selfWeight: [GRAVITY(D)] });
  return m;
}

const MODELS: Record<string, () => Model> = {
  'pro-plane-frame-seismic': planeFrameSeismic,
  'pro-simple-shed': simpleShed,
  'pro-concrete-wall-storehouse': concreteWallStorehouse,
  'pro-crane-hangar': craneHangar,
  'pro-guyed-tower': guyedTower,
};

mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const texts: Array<[string, () => string]> = [
  ...Object.entries(MODELS).map(([id, build]) => [id, () => build().text()] as [string, () => string]),
  ...Object.entries(BUILDINGS),
];
for (const [id, text0] of texts) {
  if (only.length && !only.includes(id)) continue;
  const text = text0();
  writeFileSync(`${OUT}${id}.stabileo.txt`, text);
  console.log(id, text.split('\n').length, 'lines');
}
