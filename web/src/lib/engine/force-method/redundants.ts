/**
 * Choosing the redundants: released one at a time with a stability check at
 * each, as it is done by hand, with a bounded exhaustive search behind it.
 * Shared by the plane and the space method; only the candidates and the
 * stability check differ, and each method passes its own.
 */
import type { DSMStepData } from '../solver-detailed';
import type { Redundant, Candidate } from './primary';

export const numbered = (items: Array<Omit<Redundant, 'index'>>): Redundant[] =>
  items.map((c, i) => ({ ...c, index: i + 1 }));

function clashes(chosen: Array<Omit<Redundant, 'index'>>, items: Array<Omit<Redundant, 'index'>>): boolean {
  return items.some((it) => chosen.some((c) =>
    (it.elementId !== undefined && c.elementId === it.elementId && it.kind !== 'reaction' && c.kind !== 'reaction')
    || (it.kind === 'reaction' && c.kind === 'reaction' && c.nodeId === it.nodeId && c.component === it.component)));
}

/**
 * Released one at a time with a stability check at each, then — if that
 * greedy order cannot land on exactly GH — every combination. Shared by the
 * plane and the space method; only the candidates and the check differ.
 */
export function chooseRedundants(
  cands: Candidate[], gh: number, stable: (rs: Redundant[]) => boolean, maxTries = 4000,
): Redundant[] | null {
  const chosen: Array<Omit<Redundant, 'index'>> = [];
  for (const c of cands) {
    if (chosen.length === gh) break;
    if (chosen.length + c.items.length > gh || clashes(chosen, c.items)) continue;
    if (stable(numbered([...chosen, ...c.items]))) chosen.push(...c.items);
  }
  if (chosen.length === gh) return numbered(chosen);

  let tries = 0;
  const pick: Array<Omit<Redundant, 'index'>> = [];
  const dfs = (start: number): Redundant[] | null => {
    if (pick.length === gh) {
      tries++;
      const rs = numbered(pick);
      return stable(rs) ? rs : null;
    }
    for (let k = start; k < cands.length && tries < maxTries; k++) {
      const items = cands[k].items;
      if (pick.length + items.length > gh || clashes(pick, items)) continue;
      pick.push(...items);
      const got = dfs(k + 1);
      if (got) return got;
      pick.splice(pick.length - items.length, items.length);
    }
    return null;
  };
  return dfs(0);
}

/**
 * Which restrained DOFs some member actually loads: a zero diagonal in K
 * means none does, and a redundant there would be a zero row of [δ].
 */
export function restraintCarries(data: DSMStepData): (nodeId: number, c: number) => boolean {
  let maxD = 0;
  for (let i = 0; i < data.K.length; i++) maxD = Math.max(maxD, Math.abs(data.K[i][i]));
  const byKey = new Map(data.dofNumbering.dofs.map((d) => [`${d.nodeId}:${d.localDof}`, d.globalIndex]));
  return (nodeId, c) => {
    const g = byKey.get(`${nodeId}:${c}`);
    return g !== undefined && Math.abs(data.K[g][g]) > maxD * 1e-8;
  };
}

/**
 * Beyond this many redundants the method stops being something to follow:
 * a 30 × 30 [δ] is already a wall of numbers, and choosing the redundants
 * takes seconds. The stiffness wizard still shows such a structure.
 */
export const FM_MAX_GH = 30;

/**
 * How many complete sets the fallback search may check. Each check is a dense
 * solve, O(n³) in the free DOFs, and the search runs in the click handler: at
 * 4000 checks a model near the limits (354 DOFs) froze the page for about ten
 * seconds before answering `noRedundants`. The budget is fixed in work, not in
 * attempts — small models keep all 4000, the largest get about 200.
 */
export function fallbackBudget(nFree: number): number {
  return Math.min(4000, Math.max(200, Math.floor(2e8 / Math.max(1, nFree) ** 3)));
}
