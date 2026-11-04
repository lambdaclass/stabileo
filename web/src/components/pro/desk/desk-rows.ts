/**
 * The desk's rows: every member the design reads, named as it is built (`member-names.ts`), with
 * its level, kind, status, ratio and decision state, filtered as the navigator asks.
 */
import { modelStore } from '../../../lib/store/model.svelte';
import { deskMembers, type DeskMember } from '../../../lib/store/design-desk';
import { decisionState } from '../../../lib/store/design-decisions';
import { verificationStore } from '../../../lib/store/verification.svelte';
import type { DeskFilter } from '../../../lib/store/design-desk-ui.svelte';
import { memberNames } from '../../../lib/store/member-names';

export interface DeskRow extends DeskMember { name: string; kind: string; zTop: number; zBottom: number; decision: ReturnType<typeof decisionState> }

export function deskRows(): DeskRow[] {
  const names = memberNames();
  return deskMembers().map((m) => {
    const e = modelStore.elements.get(m.id)!;
    const zs = [e.nodeI, e.nodeJ].map((n) => modelStore.nodes.get(n)?.z ?? 0);
    const sec = modelStore.sections.get(e.sectionId);
    const kind = m.material === 'steel' ? 'steel' : verificationStore.contextFor(m.id)?.elementType ?? 'beam';
    return { ...m, name: `${names.name(m.id)} · ${sec?.name ?? '—'}`, kind, zTop: Math.max(...zs), zBottom: Math.min(...zs), decision: decisionState(m.id) };
  });
}

/** On a level: a beam at it, a column arriving at it from below. */
export const onLevel = (r: DeskRow, z: number | null) => z === null || Math.abs(r.zTop - z) < 1e-3;

export function matches(r: DeskRow, f: DeskFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'fail': return r.status === 'fail' || r.status === 'provisional';
    case 'warn': return r.status === 'warn';
    case 'ok': return r.status === 'ok';
    case 'unavailable': return r.status === 'unavailable' || r.status === 'stale';
    case 'locked': return r.decision === 'locked';
    case 'edited': return r.decision === 'edited';
    case 'steel': return r.material === 'steel';
  }
}

/** The next or previous row that needs attention, wrapping. */
export function stepFailing(rows: DeskRow[], from: number | null, step: 1 | -1): number | null {
  const bad = (r: DeskRow) => r.status === 'fail' || r.status === 'warn' || r.status === 'provisional';
  if (!rows.some(bad)) return null;
  const i = from === null ? (step === 1 ? -1 : rows.length) : rows.findIndex((r) => r.id === from);
  for (let k = 1; k <= rows.length; k++) {
    const r = rows[(i + step * k + rows.length * 2) % rows.length]!;
    if (bad(r)) return r.id;
  }
  return null;
}
