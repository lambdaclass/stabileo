/**
 * What an example's fixture says that its structure does not mean, corrected on load.
 *
 * The fixtures stay as they are: dozens of tests read them. Each fix here is applied to the open
 * model right after the fixture loads, and says what it corrects. They run before the catalogue
 * drops empty cases and states the self-weight rule and the combinations.
 */
import { modelStore } from '../store/model.svelte';
import { gradeById } from './structural-grades';

type Fix = () => void;

const loadsOf = (caseId: number) => modelStore.loads.filter((l) => ((l.data as { caseId?: number }).caseId ?? 1) === caseId);
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

export const PRO_EXAMPLE_FIXES: Readonly<Record<string, Fix>> = {
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
   * Twenty nodal loads carried the wind and the gravity together in the dead-load case, so the
   * drift under wind could not be read from a wind case. The horizontal part goes to the wind case.
   */
  'xl-diagrid-tower': () => {
    const d = firstCase('D'), w = firstCase('W');
    if (!d || !w) return;
    for (const l of loadsOf(d.id)) {
      if (l.type !== 'nodal3d') continue;
      const v = l.data as { id: number; nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number };
      if (v.fx === 0 && v.fy === 0) continue;
      modelStore.addNodalLoad3D(v.nodeId, v.fx, v.fy, 0, 0, 0, 0, w.id);
      modelStore.updateLoad(v.id, { fx: 0, fy: 0 });
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
