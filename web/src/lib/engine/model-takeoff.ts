/**
 * What the model is MADE OF, counted from the model.
 *
 * ── Why this exists beside `quantity-takeoff.ts` ───────────────────
 *
 * That module estimates steel from VERIFICATION RECORDS, and says so in its
 * own header. It is the right answer for a checked-but-undetailed concrete
 * member and the wrong answer to "what does this structure weigh", because a
 * model with no verifications has no quantities at all under it — which is
 * exactly what a raft of plates produced: a solve that worked, followed by a
 * take-off reporting no materials.
 *
 * This one reads the GEOMETRY. A member is its section area along its length;
 * a shell is its area times its thickness. Both are grouped by the material
 * they are made of, because "how much concrete" and "how much steel" is the
 * question a take-off answers, and the model already knows which is which.
 *
 * What it does NOT do is invent reinforcement. Rebar is a detailing output,
 * and the honest thing to report for an undetailed model is the concrete and
 * the structural steel it can actually see. Where a design HAS run, the
 * reinforcement ratio belongs beside this rather than inside it.
 *
 * Does NOT touch the solver.
 */

import { materialFamilyOf } from './steel/material-family';

export interface MaterialTakeoff {
  materialId: number;
  name: string;
  family: 'concrete' | 'steel' | 'unknown';
  /** m³ — the volume of every member and shell made of this material. */
  volume: number;
  /** kN — volume × specific weight. Zero when the material states no density. */
  weight: number;
  memberCount: number;
  shellCount: number;
  /** m — total length of members in this material. */
  memberLength: number;
  /** m² — total mid-surface area of shells in this material. */
  shellArea: number;
}

export interface ModelTakeoff {
  byMaterial: MaterialTakeoff[];
  totalVolume: number;
  totalWeight: number;
  concreteVolume: number;
  /** kN of structural steel — members and shells of a steel material. */
  steelWeight: number;
  /** Elements the take-off could not measure, and why. */
  skipped: Array<{ kind: 'member' | 'shell'; id: number; reason: 'noSection' | 'noMaterial' | 'noNodes' }>;
}

interface Vec { x: number; y?: number; z?: number }

const at = (n: Vec) => ({ x: n.x, y: n.y ?? 0, z: n.z ?? 0 });

/** Area of a planar polygon in 3D, by the magnitude of its vector area. */
function polygonArea(pts: Array<{ x: number; y: number; z: number }>): number {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    cx += a.y * b.z - a.z * b.y;
    cy += a.z * b.x - a.x * b.z;
    cz += a.x * b.y - a.y * b.x;
  }
  return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
}

export interface TakeoffModel {
  nodes: Map<number, Vec>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; materialId: number; sectionId: number }>;
  sections: Map<number, { id: number; a: number }>;
  materials: Map<number, { id: number; name: string; rho?: number; fy?: number; gradeId?: string }>;
  plates?: Map<number, { id: number; nodes: readonly number[]; materialId: number; thickness: number }>;
  quads?: Map<number, { id: number; nodes: readonly number[]; materialId: number; thickness: number }>;
}

export function takeoffFromModel(model: TakeoffModel): ModelTakeoff {
  const acc = new Map<number, MaterialTakeoff>();
  const skipped: ModelTakeoff['skipped'] = [];

  const bucket = (materialId: number): MaterialTakeoff | null => {
    const m = model.materials.get(materialId);
    if (!m) return null;
    let b = acc.get(materialId);
    if (!b) {
      b = {
        materialId,
        name: m.name,
        family: materialFamilyOf(m as never).family as MaterialTakeoff['family'],
        volume: 0, weight: 0, memberCount: 0, shellCount: 0, memberLength: 0, shellArea: 0,
      };
      acc.set(materialId, b);
    }
    return b;
  };

  for (const [id, e] of model.elements) {
    const nI = model.nodes.get(e.nodeI);
    const nJ = model.nodes.get(e.nodeJ);
    if (!nI || !nJ) { skipped.push({ kind: 'member', id, reason: 'noNodes' }); continue; }
    const sec = model.sections.get(e.sectionId);
    if (!sec || !(sec.a > 0)) { skipped.push({ kind: 'member', id, reason: 'noSection' }); continue; }
    const b = bucket(e.materialId);
    if (!b) { skipped.push({ kind: 'member', id, reason: 'noMaterial' }); continue; }

    const a = at(nI), c = at(nJ);
    const L = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
    b.volume += sec.a * L;
    b.memberLength += L;
    b.memberCount++;
  }

  for (const [kind, coll] of [['plate', model.plates], ['quad', model.quads]] as const) {
    if (!coll) continue;
    for (const [id, sh] of coll) {
      const pts: Array<{ x: number; y: number; z: number }> = [];
      let missing = false;
      for (const nid of sh.nodes) {
        const n = model.nodes.get(nid);
        if (!n) { missing = true; break; }
        pts.push(at(n));
      }
      if (missing || pts.length < 3) { skipped.push({ kind: 'shell', id, reason: 'noNodes' }); continue; }
      const b = bucket(sh.materialId);
      if (!b) { skipped.push({ kind: 'shell', id, reason: 'noMaterial' }); continue; }
      void kind;
      const area = polygonArea(pts);
      b.shellArea += area;
      b.volume += area * Math.max(sh.thickness, 0);
      b.shellCount++;
    }
  }

  let totalVolume = 0, totalWeight = 0, concreteVolume = 0, steelWeight = 0;
  for (const b of acc.values()) {
    const rho = model.materials.get(b.materialId)?.rho ?? 0;
    b.weight = b.volume * rho;
    totalVolume += b.volume;
    totalWeight += b.weight;
    if (b.family === 'concrete') concreteVolume += b.volume;
    if (b.family === 'steel') steelWeight += b.weight;
  }

  const byMaterial = [...acc.values()].sort((a, b) => b.volume - a.volume);
  return { byMaterial, totalVolume, totalWeight, concreteVolume, steelWeight, skipped };
}

/**
 * Steel per cubic metre of concrete — the number a reader pre-dimensions with.
 *
 * Null rather than zero when there is no concrete: "0 kg/m³" is a claim about
 * a structure, and a structure with no concrete in it has not made one.
 */
export function steelRatio(t: ModelTakeoff): number | null {
  if (t.concreteVolume <= 0) return null;
  return t.steelWeight / t.concreteVolume;
}
