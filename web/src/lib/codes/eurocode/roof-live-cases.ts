import { msg } from '../message';
import type { ImposedLoadCode } from '../families/load-codes';
import { categoryOfOccupancy } from './imposed';

export const groupRoofLoads: NonNullable<ImposedLoadCode['groupRoofLoads']> = (
  floorKey, roofKey, { cases, distributed, nodal, surface, derivation },
) => {
  const floorGroup = categoryOfOccupancy(floorKey);
  const roofGroup = roofKey ? categoryOfOccupancy(roofKey) : undefined;
  if (roofGroup && roofGroup !== floorGroup) {
    const twin = new Map<number, number>();
    cases.forEach((c, i) => {
      if (c.type !== 'L' || c.group) return;
      const index = cases.length;
      cases.push({
        existingId: null, type: 'L', own: true, group: roofGroup,
        nameKey: c.pattern ? (c.nameKey.endsWith('Adjacent') ? 'autoLoad.liveRoofCaseAdjacent' : 'autoLoad.liveRoofCasePattern') : 'autoLoad.liveRoofCase',
        nameParams: { ...(c.nameParams ?? {}), group: roofGroup },
        ...(c.alternatives ? { alternatives: `${c.alternatives}:${roofGroup}` } : {}),
        ...(c.pattern ? { pattern: true } : {}), ...(c.reduced ? { reduced: true } : {}),
      });
      twin.set(i, index);
    });
    const fullL = cases.findIndex((c) => c.type === 'L' && !c.group && !c.pattern);
    const move = (x: { caseType: string; caseIndex?: number; roof?: true }) => {
      if (x.caseType !== 'L' || !x.roof) return;
      const to = twin.get(x.caseIndex ?? fullL);
      if (to !== undefined) x.caseIndex = to;
    };
    for (const d of distributed) move(d);
    for (const n of nodal) move(n);
    for (const sf of surface) move(sf);
    const used = new Set([...distributed, ...nodal, ...surface].map((x) => x.caseIndex));
    for (const [, k] of twin) if (!used.has(k)) cases[k]!.existingId = -1;
    for (let k = cases.length - 1; k >= 0; k--) {
      if (cases[k]!.existingId !== -1) continue;
      cases.splice(k, 1);
      for (const list of [distributed, nodal, surface]) for (const x of list) if (x.caseIndex !== undefined && x.caseIndex > k) x.caseIndex--;
    }
    if (cases.some((c) => c.group === roofGroup)) derivation.push(msg('loadPlan.derivation.roofLivePart', { floor: floorGroup ?? '—', roof: roofGroup }));
  }
  for (const list of [distributed, nodal, surface]) for (const item of list) delete item.roof;
};
