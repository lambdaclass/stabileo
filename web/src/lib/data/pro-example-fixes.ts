/**
 * What an example's fixture says that its structure does not mean, corrected on load.
 *
 * The fixtures stay as they are: dozens of tests read them. Each fix here is applied to the open
 * model right after the fixture loads, and says what it corrects. They run before the catalogue
 * drops empty cases and states the self-weight rule and the combinations.
 */
import { modelStore } from '../store/model.svelte';
import { gradeById } from './structural-grades';
import { holdPlateSidesAt, physicalPlates } from '../store/physical-plates';
import { ensurePlates } from '../store/plates-from-shells';

type Fix = () => void;

const firstCase = (type: string) => modelStore.model.loadCases.find((c) => c.type === type);

/** Members whose section or material name matches. */
function membersWhere(pred: (sectionName: string, materialName: string) => boolean): number[] {
  const out: number[] = [];
  for (const e of modelStore.elements.values()) {
    const s = modelStore.sections.get(e.sectionId)?.name ?? '';
    const m = modelStore.materials.get(e.materialId)?.name ?? '';
    if (pred(s, m)) out.push(e.id);
  }
  return out;
}

/** Cables and stays: they work in tension only. */
function tensionOnly(ids: number[]): void {
  for (const id of ids) modelStore.updateElement(id, { behaviour: 'tensionOnly' } as never);
}

/*
 * The steel grade, declared, with the ultimate strength it states. The fixtures name their
 * steels (Acero A36, S275, S355) but declare no grade and carry no fu, and steel design checks
 * only a declared grade with both strengths: an example opened in PRO had nothing to check. Their
 * yield stress already is the grade's; it is kept, and filled from the grade only when missing.
 */
const GRADE_BY_NAME: Array<[RegExp, string]> = [
  [/\bA36\b/i, 'astm-a36'],
  [/\bS355\b/i, 'en-s355'],
  [/\bS275\b/i, 'en-s275'],
  [/\bF-?24\b/i, 'iram-f24'],
];
export function declareSteelGrades(): void {
  for (const m of modelStore.materials.values()) {
    if ((m as { gradeId?: string }).gradeId) continue;
    const hit = GRADE_BY_NAME.find(([re]) => re.test(m.name));
    const grade = hit ? gradeById(hit[1]) : undefined;
    if (!hit || !grade) continue;
    modelStore.updateMaterial(m.id, { gradeId: hit[1], fu: (m as { fu?: number }).fu ?? grade.fu, fy: m.fy ?? grade.fy } as never);
  }
}

/** The walls on the foundation held all along their base, at their nodes there now and with every mesh. */
export function holdWallBases(): number {
  const zOf = (n: number) => modelStore.nodes.get(n)?.z ?? 0;
  const supports = [...modelStore.supports.values()];
  if (!supports.length) return 0;
  const base = Math.min(...supports.map((s) => zOf(s.nodeId)));
  const kinds = new Map<string, number>();
  for (const s of supports) if (Math.abs(zOf(s.nodeId) - base) < 1e-6) kinds.set(s.type, (kinds.get(s.type) ?? 0) + 1);
  const type = [...kinds.entries()].sort((p, q) => q[1] - p[1])[0]![0] as Parameters<typeof modelStore.addSupport>[1];
  const held = new Set(supports.map((s) => s.nodeId));
  let added = 0;
  for (const shell of [...modelStore.quads.values(), ...modelStore.plates.values()]) {
    const zs = shell.nodes.map(zOf);
    if (Math.max(...zs) - Math.min(...zs) < 1e-6) continue;
    for (const n of shell.nodes) {
      if (held.has(n) || Math.abs(zOf(n) - base) > 1e-6) continue;
      modelStore.addSupport(n, type);
      held.add(n);
      added++;
    }
  }
  ensurePlates();
  for (const p of physicalPlates()) if (p.physical.kind === 'wall') holdPlateSidesAt(p.id, base, type);
  return added;
}

export const PRO_EXAMPLE_FIXES: Readonly<Record<string, Fix>> = {
  'pro-edificio-7p': () => { holdWallBases(); },

  /*
   * The runway beam carried only its own dead load: there was no crane. One case now stands the
   * crane in the middle bay, two wheels a side 4 m apart, 60 kN a wheel on the loaded side with
   * 5 kN of lateral surge and 25 kN on the other. The roof live case was named "Live Load".
   */
  '3d-nave-industrial': () => {
    const lr = firstCase('Lr');
    if (lr) modelStore.updateLoadCase(lr.id, 'Roof live load');
    const crane = modelStore.addLoadCase('Crane', 'L');
    const runway = membersWhere((s) => /IPN\s*500/i.test(s));
    for (const id of runway) {
      const e = modelStore.elements.get(id)!;
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      // The middle bay, x 8–16: the member that starts at x = 8.
      if (Math.abs(Math.min(a.x, b.x) - 8) > 1e-6) continue;
      const loaded = Math.min(a.y, b.y) < 10;
      for (const at of [2, 6]) modelStore.addPointLoadOnElement3D(id, at, loaded ? 5 : 0, loaded ? -60 : -25, crane);
    }
  },

  /*
   * The hangers work in tension only. The main cable stays a member that bends: as a chain of
   * trusses, with no pretension and a linear analysis, it would have no stiffness across itself.
   */
  'suspension-bridge': () => tensionOnly(membersWhere((s, m) => /cable/i.test(m) && !/main/i.test(s))),

  /* The stays, drawn as trusses, work in tension only. */
  'cable-stayed-bridge': () => tensionOnly(membersWhere((s) => /stay/i.test(s))),
};
