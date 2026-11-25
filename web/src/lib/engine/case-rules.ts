import { caseReductionRefusal } from './loads/case-reduction';

type ReductionRule = { type?: string; reduction?: { ratio: number } };
type CaseDependencies = { id: number; includes?: readonly { caseId?: number }[]; notional?: unknown };

export function reductionApplies(c: ReductionRule): boolean {
  return !!c.reduction && c.reduction.ratio !== 1 && caseReductionRefusal(c.type, false) !== 'notImposed';
}

export const caseReductionRatio = (c: ReductionRule) => (reductionApplies(c) ? c.reduction!.ratio : 1);

export function caseOrder(cases: readonly CaseDependencies[]): { order: number[]; looped: Set<number> } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const deps = (c: CaseDependencies) => {
    const notional = c.notional as { sourceCaseId?: unknown } | undefined;
    const includes = Array.isArray(c.includes) ? c.includes.map(term => term?.caseId) : [];
    return [...includes, notional?.sourceCaseId]
      .filter((id): id is number => typeof id === 'number' && byId.has(id));
  };
  const state = new Map<number, 0 | 1 | 2>();
  const order: number[] = [];
  const looped = new Set<number>();
  const visit = (id: number, path: number[]) => {
    const s = state.get(id) ?? 0;
    if (s === 2) return;
    if (s === 1) { for (const p of path.slice(path.indexOf(id))) looped.add(p); return; }
    state.set(id, 1);
    for (const d of deps(byId.get(id)!)) visit(d, [...path, id]);
    state.set(id, 2);
    order.push(id);
  };
  for (const c of cases) visit(c.id, []);
  const readsItself = (id: number) => {
    const seen = new Set<number>(), stack = deps(byId.get(id)!);
    while (stack.length) {
      const d = stack.pop()!;
      if (d === id) return true;
      if (seen.has(d)) continue;
      seen.add(d);
      stack.push(...deps(byId.get(d)!));
    }
    return false;
  };
  for (const c of cases) if (!looped.has(c.id) && readsItself(c.id)) looped.add(c.id);
  return { order, looped };
}
