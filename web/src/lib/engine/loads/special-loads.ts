/**
 * The load cases of the regulation load generator that are not gravity, wind or earthquake:
 * T, H and F of CIRSOC 101-2025 §2.2.
 *
 *   T  restraint effects of a temperature change: a uniform ΔT, and a gradient through the depth,
 *      on every member and shell (§2.3.4);
 *   H  the lateral pressure of soil, p = K (γ (z_g − z) + q) below the grade z_g, with K the
 *      coefficient (at rest K0, or active), γ the soil's unit weight (Tabla 3.2) and q a surcharge;
 *   F  the pressure of a fluid of unit weight γ, γ (z_f − z) below its level z_f, horizontal on
 *      the walls and vertical on the bottom.
 *
 * CIRSOC 101 gives the symbols and the combinations, not how much soil or fluid pushes: K, γ and
 * the levels are the reader's, and the derivation says so.
 *
 * ── Where the pressures go ────────────────────────────────────────
 *
 * On the vertical quads below the grade or the fluid's level: each node takes a quarter of the
 * quad's area at the pressure of its own depth, horizontal and normal to the quad. Soil pushes
 * from outside, toward the centre of the walls it loads; a fluid pushes from inside, away from
 * it. A fluid's bottom is the horizontal quads under its level, as a surface load.
 *
 * Pure: no store.
 */
import { msg, round, type EngineMessage } from '../../codes/message';

export interface SpecialModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; type?: 'frame' | 'truss' }>;
  quads?: Map<number, { id: number; nodes: number[] }>;
}

export interface ThermalInput { dtUniform: number; dtGradient: number }
export interface SoilInput { gradeZ: number; gamma: number; k: number; surcharge: number }
export interface FluidInput { levelZ: number; gamma: number }

export interface SpecialLoads {
  thermal: Array<{ elementId?: number; quadId?: number; dtUniform: number; dtGradient: number }>;
  soil: Array<{ nodeId: number; fx: number; fy: number; fz: number }>;
  fluid: Array<{ nodeId: number; fx: number; fy: number; fz: number }>;
  fluidBottom: Array<{ quadId: number; q: number }>;
  derivation: EngineMessage[];
  notes: EngineMessage[];
}

const Z = (n: { z?: number }) => n.z ?? 0;

interface Wall { quadId: number; nodes: number[]; area: number; n: [number, number]; c: [number, number]; zMin: number }

/** Vertical quads: the horizontal unit normal, the plan centroid and the area. */
function walls(model: SpecialModel): Wall[] {
  const out: Wall[] = [];
  for (const q of model.quads?.values() ?? []) {
    const p = q.nodes.map((id) => model.nodes.get(id)!).filter(Boolean);
    if (p.length < 3) continue;
    const u = [p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y, Z(p[1]!) - Z(p[0]!)];
    const v = [p[2]!.x - p[0]!.x, p[2]!.y - p[0]!.y, Z(p[2]!) - Z(p[0]!)];
    const nx = u[1]! * v[2]! - u[2]! * v[1]!, ny = u[2]! * v[0]! - u[0]! * v[2]!, nz = u[0]! * v[1]! - u[1]! * v[0]!;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9 || Math.abs(nz) / len > 0.1) continue;
    const h = Math.hypot(nx, ny);
    // Area of the quad (two triangles).
    let area = len / 2;
    if (p.length === 4) {
      const w = [p[3]!.x - p[0]!.x, p[3]!.y - p[0]!.y, Z(p[3]!) - Z(p[0]!)];
      const mx = v[1]! * w[2]! - v[2]! * w[1]!, my = v[2]! * w[0]! - v[0]! * w[2]!, mz = v[0]! * w[1]! - v[1]! * w[0]!;
      area += Math.hypot(mx, my, mz) / 2;
    }
    out.push({
      quadId: q.id, nodes: q.nodes, area, n: [nx / h, ny / h],
      c: [p.reduce((s, x) => s + x.x, 0) / p.length, p.reduce((s, x) => s + x.y, 0) / p.length],
      zMin: Math.min(...p.map(Z)),
    });
  }
  return out;
}

function pressureOn(model: SpecialModel, ws: Wall[], top: number, p: (depth: number) => number, inward: boolean) {
  const loaded = ws.filter((w) => w.zMin < top - 1e-6);
  if (loaded.length === 0) return [];
  const cx = loaded.reduce((s, w) => s + w.c[0], 0) / loaded.length;
  const cy = loaded.reduce((s, w) => s + w.c[1], 0) / loaded.length;
  const out: Array<{ nodeId: number; fx: number; fy: number; fz: number }> = [];
  for (const w of loaded) {
    // Toward the centre for soil, away from it for a fluid.
    const toCentre = w.n[0] * (cx - w.c[0]) + w.n[1] * (cy - w.c[1]) >= 0 ? 1 : -1;
    const sgn = inward ? toCentre : -toCentre;
    for (const id of w.nodes) {
      const z = Z(model.nodes.get(id)!);
      // Above the grade or the level a node takes nothing (a quad across it is loaded only below).
      if (z >= top - 1e-9) continue;
      const f = (p(top - z) * w.area) / w.nodes.length;
      if (f > 1e-9) out.push({ nodeId: id, fx: sgn * f * w.n[0], fy: sgn * f * w.n[1], fz: 0 });
    }
  }
  return out;
}

export function specialLoads(model: SpecialModel, i: { thermal?: ThermalInput; soil?: SoilInput; fluid?: FluidInput }): SpecialLoads {
  const out: SpecialLoads = { thermal: [], soil: [], fluid: [], fluidBottom: [], derivation: [], notes: [] };
  if (i.thermal && (i.thermal.dtUniform !== 0 || i.thermal.dtGradient !== 0)) {
    const { dtUniform, dtGradient } = i.thermal;
    for (const e of model.elements.values()) out.thermal.push({ elementId: e.id, dtUniform, dtGradient: e.type === 'truss' ? 0 : dtGradient });
    for (const q of model.quads?.values() ?? []) out.thermal.push({ quadId: q.id, dtUniform, dtGradient });
    out.derivation.push(msg('loadPlan.derivation.thermal', { dt: dtUniform, grad: dtGradient, members: model.elements.size, shells: model.quads?.size ?? 0 }));
  }
  const ws = (i.soil || i.fluid) ? walls(model) : [];
  if (i.soil) {
    const s = i.soil;
    out.soil = pressureOn(model, ws, s.gradeZ, (d) => s.k * (s.gamma * d + s.surcharge), true);
    if (out.soil.length === 0) out.notes.push(msg('loadPlan.note.noSoilWalls', { z: round(s.gradeZ, 2) }));
    else out.derivation.push(msg('loadPlan.derivation.soil', { k: s.k, gamma: s.gamma, q: s.surcharge, z: round(s.gradeZ, 2), total: round(out.soil.reduce((t, n) => t + Math.hypot(n.fx, n.fy), 0), 1) }));
  }
  if (i.fluid) {
    const f = i.fluid;
    out.fluid = pressureOn(model, ws, f.levelZ, (d) => f.gamma * d, false);
    for (const q of model.quads?.values() ?? []) {
      const zs = q.nodes.map((id) => Z(model.nodes.get(id)!));
      if (Math.max(...zs) - Math.min(...zs) > 1e-3) continue;
      const depth = f.levelZ - zs[0]!;
      if (depth > 0) out.fluidBottom.push({ quadId: q.id, q: f.gamma * depth });
    }
    if (out.fluid.length === 0 && out.fluidBottom.length === 0) out.notes.push(msg('loadPlan.note.noFluidShells', { z: round(f.levelZ, 2) }));
    else out.derivation.push(msg('loadPlan.derivation.fluid', { gamma: f.gamma, z: round(f.levelZ, 2), walls: out.fluid.length, bottom: out.fluidBottom.length }));
  }
  return out;
}
