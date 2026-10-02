/**
 * Wind on structures that are not closed buildings (`codes/cirsoc102/other-structures.ts` for the
 * coefficients), as load cases on the model.
 *
 * ── Free roofs of open buildings, §2.4.3 ──────────────────────────
 *
 * p = qh G CN on the roof members, CNW on the windward half and CNL on the leeward one with the
 * wind across the ridge (Figuras 2.4-4 to 2.4-6), CN by the distance from the windward edge with
 * the wind along it (2.4-7); cases A and B for each direction. The net pressure acts normal to the
 * roof's surface, positive toward its top, so each member takes it along the normal of the slope
 * it lies on, per metre of member over the tributary width, in global components.
 *
 * ── Towers, lattices, signs, chimneys, §4.4 and §4.5 ──────────────
 *
 * F = qz G Cf Af by height: each level of nodes takes the band from halfway down to halfway up,
 * qz at the band's middle, the width the nodes span across the wind, and Af from it (the
 * solidity times the gross area for a tower or a lattice, the width for a chimney); never less
 * than 0,8 kN/m² times Af (§4.8). A solid sign takes F = qh G Cf As at its face, over the nodes of
 * the face: case A at the centre, case B at 0,2 B toward an edge, as a moment either way.
 *
 * Pure: no store.
 */
import { G_RIGID, velocityPressure, type WindProject } from '../../codes/cirsoc102/wind';
import {
  freeRoofCn, freeRoofCnAlong, solidSignCf, openSignCf, towerCf, chimneyCf, MIN_OTHER_KNM2,
  type FreeRoofKind, type LatticeMembers, type ChimneySection, type LoadCaseAB,
} from '../../codes/cirsoc102/other-structures';
import { roofMembers, levelLoads, type WindModel, type WindDirection } from './wind-cases';
import { roofGeometry } from './snow-loads';
import { msg, round, type EngineMessage } from '../../codes/message';

export type OtherStructure =
  | { kind: 'freeRoof'; roof: FreeRoofKind; blocked: boolean }
  | { kind: 'latticeTower'; section: 'square' | 'triangle'; round: boolean; solidity: number; diagonal: boolean }
  | { kind: 'openSign'; members: LatticeMembers; solidity: number }
  | { kind: 'solidSign'; clearance: number }
  | { kind: 'chimney'; section: ChimneySection };

export interface OtherWindCase {
  nameKey: string;
  nameParams: Record<string, string | number>;
  nodal: Array<{ nodeId: number; fx: number; fy: number; mz: number }>;
  /** Global components per metre of member, kN/m. */
  distributed: Array<{ elementId: number; qX: number; qY: number; qZ: number }>;
}

const Z = (n: { z?: number }) => n.z ?? 0;
const dirLabel = (d: WindDirection) => d.toUpperCase();

export function otherStructureWind(i: {
  model: WindModel; structure: OtherStructure; project: WindProject; directions: readonly WindDirection[];
  tributaryWidth: number;
}): { cases: OtherWindCase[]; derivation: EngineMessage[]; notes: EngineMessage[] } {
  const { model, structure: s, project } = i;
  const qz = (z: number) => velocityPressure(Math.max(z, 0), project) / 1000;   // kN/m²
  const cases: OtherWindCase[] = [];
  const derivation: EngineMessage[] = [];
  const notes: EngineMessage[] = [];
  const nodes = [...model.nodes.values()];
  const H = Math.max(...nodes.map(Z), 0);

  if (s.kind === 'freeRoof') {
    const roof = roofMembers(model);
    const geo = roofGeometry(model);
    if (!geo || roof.length === 0) { notes.push(msg('wind.other.noRoof')); return { cases, derivation, notes }; }
    const theta = geo.slopeDeg;
    const coordAcross = (p: { x: number; y: number }) => (geo.axis === 'x' ? p.x : p.y);
    const coordAlong = (p: { x: number; y: number }) => (geo.axis === 'x' ? p.y : p.x);
    const pts = roof.flatMap((r) => { const e = model.elements.get(r.id)!; return [model.nodes.get(e.nodeI)!, model.nodes.get(e.nodeJ)!]; });
    const lo = Math.min(...pts.map(coordAcross)), hi = Math.max(...pts.map(coordAcross));
    const loA = Math.min(...pts.map(coordAlong)), hiA = Math.max(...pts.map(coordAlong));
    const hMean = pts.reduce((t, p) => t + Z(p), 0) / pts.length;
    const L = hi - lo;
    if (L > 0 && (hMean / L < 0.25 || hMean / L > 1)) notes.push(msg('wind.other.hOverL', { r: round(hMean / L, 2) }));
    // The monoslope's rising sense along the axis: the sign of the correlation of z with it.
    const zTop = Math.max(...pts.map(Z));
    const highAt = pts.filter((p) => Z(p) >= zTop - 0.05).reduce((t, p) => t + coordAcross(p), 0) / Math.max(1, pts.filter((p) => Z(p) >= zTop - 0.05).length);
    const rise = highAt >= (lo + hi) / 2 ? 1 : -1;
    const sinT = Math.sin((theta * Math.PI) / 180), cosT = Math.cos((theta * Math.PI) / 180);
    /** The upward normal of the roof surface at a point, along (across, z). */
    const normal = (c: number): [number, number] => {
      const side = c < geo.ridge ? -1 : 1;
      const up = s.roof === 'monoslope' ? rise : s.roof === 'pitched' ? -side : side;   // where the surface climbs
      return [-up * sinT, cosT];
    };
    const q = qz(hMean) * G_RIGID;
    derivation.push(msg('wind.other.freeRoof', { kind: msg(`wind.other.roof.${s.roof}`), theta: round(theta, 1), qh: round(qz(hMean), 3), blocked: s.blocked ? 1 : 0 }));
    for (const d of i.directions) {
      const across = d.endsWith(geo.axis);
      const sense = d.startsWith('-') ? -1 : 1;
      for (const c of ['A', 'B'] as LoadCaseAB[]) {
        const distributed: OtherWindCase['distributed'] = [];
        for (const r of roof) {
          const e = model.elements.get(r.id)!;
          const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          let cn: number;
          if (across) {
            // Distance from the windward edge along the wind, as a fraction of L.
            const x = sense > 0 ? coordAcross(mid) - lo : hi - coordAcross(mid);
            const upslope = rise === sense;
            const k = freeRoofCn(s.roof, theta, c, s.blocked, upslope);
            cn = x <= L / 2 ? k.cnw : k.cnl;
          } else {
            const x = sense > 0 ? coordAlong(mid) - loA : hiA - coordAlong(mid);
            cn = freeRoofCnAlong(x / Math.max(hMean, 1e-9), c, s.blocked);
          }
          const p = q * cn * i.tributaryWidth;   // kN/m, positive toward the top surface
          const [nAcross, nz] = normal(coordAcross(mid));
          distributed.push({
            elementId: r.id,
            qX: geo.axis === 'x' ? -p * nAcross : 0, qY: geo.axis === 'y' ? -p * nAcross : 0, qZ: -p * nz,
          });
        }
        cases.push({ nameKey: 'wind.other.freeRoofCase', nameParams: { dir: dirLabel(d), c }, nodal: [], distributed });
      }
    }
    return { cases, derivation, notes };
  }

  // ── By height: towers, lattices, signs and chimneys ──
  const zs = [...new Set(nodes.map((n) => Math.round(Z(n) / 0.05) * 0.05))].sort((a, b) => a - b).filter((z) => z > 0.05);
  const levelNodes = zs.map((z) => nodes.filter((n) => Math.abs(Z(n) - z) <= 0.026).map((n) => n.id));
  const span = (ids: number[], axis: 'x' | 'y') => {
    const v = ids.map((id) => model.nodes.get(id)![axis]);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  const band = (k: number) => [k === 0 ? 0 : (zs[k - 1]! + zs[k]!) / 2, k === zs.length - 1 ? zs[k]! : (zs[k]! + zs[k + 1]!) / 2] as const;

  if (s.kind === 'solidSign') {
    const sH = H - s.clearance;
    if (!(sH > 0)) { notes.push(msg('wind.other.noSign')); return { cases, derivation, notes }; }
    const face = zs.map((z, k) => ({ k, z })).filter(({ z }) => z >= s.clearance - 0.026);
    for (const d of i.directions) {
      const across = d.endsWith('x') ? 'y' : 'x';
      const B = Math.max(...face.map(({ k }) => span(levelNodes[k]!, across)), 0);
      const cf = solidSignCf(B / sH, sH / H);
      const F = Math.max(qz(H) * G_RIGID * cf, MIN_OTHER_KNM2) * B * sH * (d.startsWith('-') ? -1 : 1);
      derivation.push(msg('wind.other.solidSign', { dir: dirLabel(d), b: round(B, 2), s: round(sH, 2), h: round(H, 2), cf: round(cf, 3), f: round(Math.abs(F), 1) }));
      // The face's force over its levels, by the height of face each one takes.
      const share = face.map(({ k }) => { const [z0, z1] = band(k); return Math.max(0, z1 - Math.max(z0, s.clearance)); });
      const total = share.reduce((t, v) => t + v, 0) || 1;
      for (const ecc of [0, 1, -1] as const) {
        const nodal = face.flatMap(({ k }, j) => {
          const f = (F * share[j]!) / total;
          return levelLoads(model.nodes, levelNodes[k]!, d.endsWith('x') ? f : 0, d.endsWith('y') ? f : 0, ecc * f * 0.2 * B);
        });
        cases.push({ nameKey: 'wind.other.signCase', nameParams: { dir: dirLabel(d), c: ecc === 0 ? 'A' : `B${ecc > 0 ? '+' : '−'}` }, nodal, distributed: [] });
      }
    }
    if (face.length && Math.max(...face.map(({ k }) => span(levelNodes[k]!, 'x')), ...face.map(({ k }) => span(levelNodes[k]!, 'y'))) / sH >= 2) notes.push(msg('wind.other.signCaseC'));
    return { cases, derivation, notes };
  }

  const dirsHere: Array<{ label: string; fx: number; fy: number; diagonal: boolean }> = i.directions.map((d) => ({
    label: dirLabel(d), fx: d.endsWith('x') ? (d.startsWith('-') ? -1 : 1) : 0, fy: d.endsWith('y') ? (d.startsWith('-') ? -1 : 1) : 0, diagonal: false,
  }));
  if (s.kind === 'latticeTower' && s.diagonal && s.section === 'square') dirsHere.push({ label: '45°', fx: Math.SQRT1_2, fy: Math.SQRT1_2, diagonal: true });
  for (const d of dirsHere) {
    const nodal: OtherWindCase['nodal'] = [];
    let total = 0;
    zs.forEach((_z, k) => {
      const [z0, z1] = band(k);
      const dz = z1 - z0;
      const across = d.fx !== 0 && !d.diagonal ? 'y' : d.diagonal ? 'x' : 'x';
      const width = d.diagonal ? Math.max(span(levelNodes[k]!, 'x'), span(levelNodes[k]!, 'y')) : span(levelNodes[k]!, across);
      const q = qz((z0 + z1) / 2);
      let cf: number, af: number;
      if (s.kind === 'latticeTower') { cf = towerCf(s.solidity, s.section, s.round, d.diagonal); af = s.solidity * width * dz; }
      else if (s.kind === 'openSign') { cf = openSignCf(s.solidity, s.members); af = s.solidity * width * dz; }
      else {
        const D = width || 1;
        cf = chimneyCf(s.section, H / D, D * Math.sqrt(q * 1000));
        af = D * dz;
      }
      const F = Math.max(q * G_RIGID * cf, MIN_OTHER_KNM2) * af;
      total += F;
      nodal.push(...levelLoads(model.nodes, levelNodes[k]!, F * d.fx, F * d.fy, 0));
    });
    derivation.push(msg('wind.other.byHeight', { kind: msg(`wind.other.kind.${s.kind}`), dir: d.label, levels: zs.length, f: round(total, 1) }));
    cases.push({ nameKey: 'wind.other.case', nameParams: { dir: d.label }, nodal, distributed: [] });
  }
  return { cases, derivation, notes };
}
