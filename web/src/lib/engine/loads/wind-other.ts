import { G_RIGID, velocityPressure, EXPOSURE_CONSTANTS, type WindProject } from '../../codes/cirsoc102/wind';
import {
  freeRoofCn, freeRoofCnAlong, solidSignCf, openSignCf, towerCf, chimneyCf, MIN_OTHER_KNM2,
  type FreeRoofKind, type LatticeMembers, type ChimneySection, type LoadCaseAB,
} from '../../codes/cirsoc102/other-structures';
import { levelLoads, type WindModel, type WindDirection } from './wind-cases';
import { windRoofCarriers } from './wind-roof-geometry';
import { integrateWindPressure, windStationCuts, windHeightField, windPressureCoordinate } from './wind-pressure-field';
import { msg, round, type EngineMessage } from '../../codes/message';

export type OtherStructure =
  /**
   * `area`: Af per wind axis, m², the open building's area projected on a plane normal to the
   * wind (§2.1.5). Absent: its whole vertical projection, the envelope from the lowest node to the
   * roof's top over the width the nodes span, which is never less than Af.
   */
  | { kind: 'freeRoof'; roof: FreeRoofKind; blocked: boolean; area?: { x?: number; y?: number } }
  /** `width`: the face's width, m, where a level's nodes span none (a stick model). */
  | { kind: 'latticeTower'; section: 'square' | 'triangle'; round: boolean; solidity: number; diagonal: boolean; width?: number }
  | { kind: 'openSign'; members: LatticeMembers; solidity: number; width?: number }
  | { kind: 'solidSign'; clearance: number }
  /** `diameter`: D, m, where a level's nodes span none (a stick model). */
  | { kind: 'chimney'; section: ChimneySection; diameter?: number };

export interface OtherWindCase {
  nameKey: string;
  nameParams: Record<string, string | number>;
  nodal: Array<{ nodeId: number; fx: number; fy: number; mz: number }>;
  /** Global components per metre of member, kN/m. */
  distributed: Array<{ elementId: number; qX: number; qY: number; qZ: number; a: number; b: number }>;
  baseLoads?: OtherWindCase['nodal'];
}

const Z = (n: { z?: number }) => n.z ?? 0;
/** §2.1.5: the least design wind pressure on an open building, kN/m², times Af. */
export const MIN_OPEN_KNM2 = 0.75;
const dirLabel = (d: WindDirection) => d.toUpperCase();

export function otherStructureWind(i: {
  model: WindModel; structure: OtherStructure; project: WindProject; directions: readonly WindDirection[];
  tributaryWidth: number;
  /** The gust effect factor per wind axis (§1.9, `gust.ts`). Absent: the rigid 0,85. */
  G?: (axis: 'x' | 'y') => number;
}): { cases: OtherWindCase[]; derivation: EngineMessage[]; notes: EngineMessage[] } {
  const { model, structure: s, project } = i;
  const gOf = (axis: 'x' | 'y') => i.G?.(axis) ?? G_RIGID;
  const qz = (z: number) => velocityPressure(Math.max(z, 0), project) / 1000;   // kN/m²
  const cases: OtherWindCase[] = [];
  const derivation: EngineMessage[] = [];
  const notes: EngineMessage[] = [];
  const nodes = [...model.nodes.values()];
  const H = Math.max(...nodes.map(Z), 0);
  if (!project.rigid && !i.G) notes.push(msg('wind.other.flexibleAssumedRigid'));

  if (s.kind === 'freeRoof') {
    const carriers = windRoofCarriers(model);
    const roof = carriers.members;
    const geo = carriers.geometry;
    if (!geo || roof.length === 0) { notes.push(msg('wind.other.noRoof')); return { cases, derivation, notes }; }
    const theta = geo.slopeDeg;
    const coordAcross = (p: { x: number; y: number }) => (p.x - geo.origin.x) * geo.direction[0] + (p.y - geo.origin.y) * geo.direction[1];
    const coordAlong = (p: { x: number; y: number }) => (p.x - geo.origin.x) * geo.transverse[0] + (p.y - geo.origin.y) * geo.transverse[1];
    const pts = roof.flatMap((r) => { const e = model.elements.get(r.id)!; return [model.nodes.get(e.nodeI)!, model.nodes.get(e.nodeJ)!]; });
    const lo = Math.min(...pts.map(coordAcross)), hi = Math.max(...pts.map(coordAcross));
    const loA = Math.min(...pts.map(coordAlong)), hiA = Math.max(...pts.map(coordAlong));
    const hMean = carriers.meanHeight;
    const L = hi - lo;
    if (L > 0 && (hMean / L < 0.25 || hMean / L > 1)) notes.push(msg('wind.other.hOverL', { r: round(hMean / L, 2) }));
    // The monoslope's rising sense along the axis: the sign of the correlation of z with it.
    const zTop = Math.max(...pts.map(Z));
    const highAt = pts.filter((p) => Z(p) >= zTop - 0.05).reduce((t, p) => t + coordAcross(p), 0) / Math.max(1, pts.filter((p) => Z(p) >= zTop - 0.05).length);
    const rise = highAt >= (lo + hi) / 2 ? 1 : -1;
    const qBase = qz(hMean);
    derivation.push(msg('wind.other.freeRoof', { kind: msg(`wind.other.roof.${s.roof}`), theta: round(theta, 1), qh: round(qz(hMean), 3), blocked: s.blocked ? 1 : 0 }));
    for (const d of i.directions) {
      const q = qBase * gOf(d.endsWith('x') ? 'x' : 'y');
      const wind: [number, number] = d.endsWith('x') ? [d.startsWith('-') ? -1 : 1, 0] : [0, d.startsWith('-') ? -1 : 1];
      const dot = (v: [number, number]) => wind[0] * v[0] + wind[1] * v[1];
      const across = Math.abs(dot(geo.direction)) >= Math.abs(dot(geo.transverse));
      const sense = Math.sign(dot(across ? geo.direction : geo.transverse));
      for (const c of ['A', 'B'] as LoadCaseAB[]) {
        const distributed: OtherWindCase['distributed'] = [];
        for (const r of roof) {
          const length = Math.hypot(r.lh, r.dz);
          const coord = across ? coordAcross : coordAlong;
          const low = across ? lo : loA, high = across ? hi : hiA;
          const start = sense > 0 ? coord(r.a) - low : high - coord(r.a);
          const end = sense > 0 ? coord(r.b) - low : high - coord(r.b);
          for (const facet of r.facets!) {
            const boundaries = windStationCuts(start, end, across ? [L / 2] : [hMean, 2 * hMean], length).map(s => s - facet.a);
            const norm = Math.hypot(...facet.gradient, 1);
            const parts = integrateWindPressure(facet.b - facet.a, boundaries, station => {
              const x = windPressureCoordinate(start + (end - start) * (station + facet.a) / length, across ? [0, L / 2, L] : [0, hMean, 2 * hMean]);
              const k = across ? freeRoofCn(s.roof, theta, c, s.blocked, rise === sense) : null;
              const cn = k ? (x <= L / 2 ? k.cnw : k.cnl) : freeRoofCnAlong(x / Math.max(hMean, 1e-9), c, s.blocked);
              return -q * cn * i.tributaryWidth * facet.share;
            });
            for (const p of parts) distributed.push({ elementId: r.id, a: p.a + facet.a, b: p.b + facet.a, qX: -p.q * facet.gradient[0] / norm, qY: -p.q * facet.gradient[1] / norm, qZ: p.q === 0 ? -0 : p.q / norm });
          }
        }
        cases.push({ nameKey: 'wind.other.freeRoofCase', nameParams: { dir: dirLabel(d), c }, nodal: [], distributed });
      }
    }
    // §2.1.5: F ≥ 0,75 kN/m² × Af, a horizontal case of its own per direction, at the roof's nodes.
    const roofNodes = [...new Set(roof.flatMap((r) => { const e = model.elements.get(r.id)!; return [e.nodeI, e.nodeJ]; }))];
    const zBase = Math.min(...nodes.map(Z));
    const extent = (axis: 'x' | 'y') => { const v = nodes.map((n) => n[axis]); return Math.max(...v) - Math.min(...v); };
    for (const d of i.directions) {
      const axis = d.endsWith('x') ? 'x' : 'y';
      const given = s.area?.[axis];
      // A frame modelled in one plane spans nothing across a wind along it: it takes the width
      // its roof pressures take, the tributary width. It used to get Af = 0, and no minimum.
      const across = extent(axis === 'x' ? 'y' : 'x');
      const envelope = (H - zBase) * (across > 0.05 ? across : i.tributaryWidth);
      const af = given !== undefined && given > 0 ? given : envelope;
      if (!(af > 0)) { notes.push(msg('wind.other.minimumMissing', { dir: dirLabel(d) })); continue; }
      const F = MIN_OPEN_KNM2 * af * (d.startsWith('-') ? -1 : 1);
      derivation.push(msg(given !== undefined && given > 0 ? 'wind.other.minimumOpen' : 'wind.other.minimumOpenEnvelope', { dir: dirLabel(d), af: round(af, 2), f: round(Math.abs(F), 1) }));
      cases.push({
        nameKey: 'wind.other.minimumCase', nameParams: { dir: dirLabel(d) },
        nodal: levelLoads(model.nodes, roofNodes, axis === 'x' ? F : 0, axis === 'y' ? F : 0, 0), distributed: [],
      });
    }
    return { cases, derivation, notes };
  }

  const zs = [...new Set(nodes.map(Z))].sort((a, b) => a - b);
  const levelNodes = zs.map(z => nodes.filter(n => Z(n) === z).map(n => n.id));
  const span = (ids: number[], axis: 'x' | 'y') => {
    const v = ids.map(id => model.nodes.get(id)![axis]);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  const base = Math.max(0, Math.min(...zs));
  const pointLoads = (f: ReturnType<typeof windHeightField>, fx: number, fy: number, eccentricity = 0) => {
    const convert = (loads: Map<number, number>) => [...loads].map(([nodeId, F]) => ({ nodeId, fx: F * fx, fy: F * fy, mz: F * eccentricity }));
    return { nodal: [...convert(f.baseLoads), ...convert(f.loads)], baseLoads: convert(f.baseLoads) };
  };
  if (s.kind === 'solidSign') {
    const sH = H - s.clearance;
    if (!(sH > 0) || s.clearance < base) { notes.push(msg('wind.other.noSign')); return { cases, derivation, notes }; }
    for (const d of i.directions) {
      const axis = d.endsWith('x') ? 'x' : 'y', cross = axis === 'x' ? 'y' : 'x';
      const B = Math.max(...levelNodes.map(ids => span(ids, cross)), 0);
      if (!(B > 0)) { notes.push(msg('wind.other.noSign')); continue; }
      const cf = solidSignCf(B / sH, sH / H);
      const pressure = qz(H) * gOf(axis) * cf;
      const F = pressure * B * sH, sign = d.startsWith('-') ? -1 : 1;
      derivation.push(msg('wind.other.solidSign', { dir: dirLabel(d), b: round(B, 2), s: round(sH, 2), h: round(H, 2), cf: round(cf, 3), f: round(F, 1) }));
      const field = windHeightField({ model, axis, from: s.clearance, to: H, pressure: () => pressure, width: B });
      const minimum = windHeightField({ model, axis, from: s.clearance, to: H, pressure: () => MIN_OTHER_KNM2, width: B });
      const minimumCase: OtherWindCase = { nameKey: 'wind.other.minimumOtherCase', nameParams: { dir: dirLabel(d) }, ...pointLoads(minimum, axis === 'x' ? sign : 0, axis === 'y' ? sign : 0), distributed: [] };
      if (pressure < MIN_OTHER_KNM2) cases.push(minimumCase);
      for (const ecc of [0, 1, -1] as const) cases.push({ nameKey: 'wind.other.signCase', nameParams: { dir: dirLabel(d), c: ecc === 0 ? 'A' : `B${ecc > 0 ? '+' : '−'}` }, ...pointLoads(field, axis === 'x' ? sign : 0, axis === 'y' ? sign : 0, ecc * sign * 0.2 * B), distributed: [] });
      if (pressure >= MIN_OTHER_KNM2) cases.push(minimumCase);
      if (B / sH >= 2) notes.push(msg('wind.other.signCaseC'));
    }
    return { cases, derivation, notes };
  }

  const dirsHere: Array<{ label: string; fx: number; fy: number; diagonal: boolean }> = i.directions.map((d) => ({
    label: dirLabel(d), fx: d.endsWith('x') ? (d.startsWith('-') ? -1 : 1) : 0, fy: d.endsWith('y') ? (d.startsWith('-') ? -1 : 1) : 0, diagonal: false,
  }));
  if (s.kind === 'latticeTower' && s.diagonal && s.section === 'square') {
    // The senses asked on each axis; an axis with none asked, toward +.
    const senses = (axis: 'x' | 'y') => {
      const v = i.directions.filter((d) => d.endsWith(axis)).map((d) => (d.startsWith('-') ? -1 : 1));
      return v.length ? [...new Set(v)].sort((a, b) => b - a) : [1];
    };
    const sign = (v: number) => (v > 0 ? '+' : '-');
    for (const sx of senses('x')) for (const sy of senses('y')) {
      dirsHere.push({ label: `${sign(sx)}X${sign(sy)}Y`, fx: sx * Math.SQRT1_2, fy: sy * Math.SQRT1_2, diagonal: true });
    }
  }
  // The width the reader gives, for the levels whose nodes span none.
  const given = s.kind === 'chimney' ? s.diameter : s.width;
  const widthAt = (k: number, d: { fx: number; diagonal: boolean }): number | null => {
    const across = d.fx !== 0 && !d.diagonal ? 'y' : 'x';
    const fromNodes = d.diagonal ? Math.max(span(levelNodes[k]!, 'x'), span(levelNodes[k]!, 'y')) : span(levelNodes[k]!, across);
    if (fromNodes > 0.05) return fromNodes;
    return given !== undefined && given > 0 ? given : null;
  };
  if (zs.some((_z, k) => dirsHere.some((d) => widthAt(k, d) === null))) {
    notes.push(msg(s.kind === 'chimney' ? 'wind.other.noDiameter' : 'wind.other.noWidth', { kind: msg(`wind.other.kind.${s.kind}`) }));
    return { cases, derivation, notes };
  }
  for (const d of dirsHere) {
    const axis = d.diagonal ? (span(nodes.map(n => n.id), 'y') >= span(nodes.map(n => n.id), 'x') ? 'x' : 'y') : d.fx !== 0 ? 'x' : 'y';
    const G = d.diagonal ? Math.max(gOf('x'), gOf('y')) : gOf(axis);
    const fieldFor = (minimum: boolean) => windHeightField({ model, axis, from: base, to: H, boundaries: [5, EXPOSURE_CONSTANTS[project.exposure].zg], width: given, pressure: (z, width, measuredWidth) => {
      const q = qz(z);
      let cf: number, solidity = 1, projection = 1;
      if (s.kind === 'latticeTower') { cf = towerCf(s.solidity, s.section, s.round, d.diagonal); solidity = s.solidity; }
      else if (s.kind === 'openSign') { cf = openSignCf(s.solidity, s.members); solidity = s.solidity; }
      else { cf = chimneyCf(s.section, H / width, width * Math.sqrt(q * 1000)); if (s.section === 'squareDiagonal' && measuredWidth <= 0.05) projection = Math.SQRT2; }
      return (minimum ? MIN_OTHER_KNM2 : q * G * cf) * solidity * projection;
    } });
    const field = fieldFor(false), minimum = fieldFor(true);
    const sum = (f: typeof field) => [...f.loads.values(), ...f.baseLoads.values()].reduce((sum, n) => sum + n, 0);
    const total = sum(field);
    derivation.push(msg('wind.other.byHeight', { kind: msg(`wind.other.kind.${s.kind}`), dir: d.label, levels: zs.length, f: round(total, 1) }));
    const normalCase: OtherWindCase = { nameKey: 'wind.other.case', nameParams: { dir: d.label }, ...pointLoads(field, d.fx, d.fy), distributed: [] };
    const minimumCase: OtherWindCase = { nameKey: 'wind.other.minimumOtherCase', nameParams: { dir: d.label }, ...pointLoads(minimum, d.fx, d.fy), distributed: [] };
    cases.push(...(sum(minimum) > total ? [minimumCase, normalCase] : [normalCase, minimumCase]));
  }
  return { cases, derivation, notes };
}
