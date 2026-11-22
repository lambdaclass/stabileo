/**
 * What the sheets leave out of a model in concrete, and why: members in no physical element, physical
 * elements of a kind the sheets do not design or whose members they could not lay out as one run,
 * columns carrying more torsion than may be neglected (the column sheets do not check torsion), and
 * elements designed with an assumed f'c because their material states none.
 */

export type LeftOutReason = 'notPhysical' | 'kind' | 'layout' | 'torsion' | 'fcAssumed';

export interface LeftOut {
  reason: LeftOutReason;
  /** The physical element or row; absent for members in no physical element. */
  name?: string;
  level?: string;
  kind?: string;
  /** How many analysis members (bars or shell elements) it stands for. */
  members: number;
  /** Torsion: the largest Tu and the most the column may take unchecked, kN·m. */
  tu?: number;
  limit?: number;
  /** fcAssumed: the f'c it was designed with, MPa. */
  fc?: number;
}

export interface CoverageGroup {
  id: number; name: string; kind: string; level?: string;
  /** Its members in concrete. */
  elements: number; shells: number;
  /** Some of its members are of a material with no f'c. */
  noFc?: boolean;
}

export interface CoverageInput {
  groups: readonly CoverageGroup[];
  /** Members in concrete in no physical element. */
  looseElements: number;
  looseShells: number;
  /** The keys of the rows designed (`family:group:…`). */
  rowKeys: Iterable<string>;
  columns: ReadonlyArray<{ name: string; level?: string; b: number; h: number; fc: number; tu: number }>;
  /** The f'c a member whose material states none is designed with, MPa. */
  defaultFc: number;
}

const ELEMENT_KINDS = new Set(['beam', 'column']);
const DESIGNED_FAMILIES = new Set(['beam', 'column', 'slab', 'wall']);

/** The torsion a solid rectangular section may take without torsion reinforcement, kN·m: φ·0.083·√f'c·Acp²/pcp (ACI 318-19 / CIRSOC 201-2025 §22.7.4.1, φ = 0.75). */
export function torsionThreshold(b: number, h: number, fc: number): number {
  const acp = b * h, pcp = 2 * (b + h);
  return pcp > 0 ? 0.75 * 0.083 * Math.sqrt(Math.max(0, fc)) * (acp * acp) / pcp * 1000 : 0;
}

export function sheetsLeftOut(c: CoverageInput): LeftOut[] {
  const designed = new Set<number>();
  for (const key of c.rowKeys) {
    const [family, id] = key.split(':');
    if (family && DESIGNED_FAMILIES.has(family) && id !== undefined) designed.add(Number(id));
  }
  const out: LeftOut[] = [];
  if (c.looseElements > 0) out.push({ reason: 'notPhysical', members: c.looseElements, kind: 'element' });
  if (c.looseShells > 0) out.push({ reason: 'notPhysical', members: c.looseShells, kind: 'shell' });
  for (const g of c.groups) {
    const members = g.elements + g.shells;
    if (!members) continue;
    if (designed.has(g.id)) {
      if (g.noFc) out.push({ reason: 'fcAssumed', name: g.name, ...(g.level ? { level: g.level } : {}), kind: g.kind, members, fc: c.defaultFc });
      continue;
    }
    const reason: LeftOutReason = g.shells === 0 && !ELEMENT_KINDS.has(g.kind) ? 'kind' : 'layout';
    out.push({ reason, name: g.name, ...(g.level ? { level: g.level } : {}), kind: g.kind, members });
  }
  for (const col of c.columns) {
    const limit = torsionThreshold(col.b, col.h, col.fc);
    if (col.tu > limit + 1e-9) out.push({ reason: 'torsion', name: col.name, ...(col.level ? { level: col.level } : {}), kind: 'column', members: 1, tu: col.tu, limit });
  }
  return out;
}
