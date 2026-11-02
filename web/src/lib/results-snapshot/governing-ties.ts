/** The member-end magnitude each governing component is the maximum of (`governing-case.ts`). */
const GOVERNING_METRIC: Record<string, (f: Record<string, number>) => number> = {
  momentZ: (f) => Math.max(Math.abs(f.mzStart), Math.abs(f.mzEnd)),
  shearY: (f) => Math.max(Math.abs(f.vyStart), Math.abs(f.vyEnd)),
  momentY: (f) => Math.max(Math.abs(f.myStart), Math.abs(f.myEnd)),
  shearZ: (f) => Math.max(Math.abs(f.vzStart), Math.abs(f.vzEnd)),
  torsion: (f) => Math.max(Math.abs(f.mxStart), Math.abs(f.mxEnd)),
  axial: (f) => Math.max(Math.abs(f.nStart), Math.abs(f.nEnd)),
  moment: (f) => Math.max(Math.abs(f.mStart), Math.abs(f.mEnd)),
  shear: (f) => Math.max(Math.abs(f.vStart), Math.abs(f.vEnd)),
};

/** Every combination whose value for this member and component equals the governing one, sorted. */
export function governingTies(perCombo: Map<number, { elementForces: unknown[] }>, elementId: number, component: string, value: number): number[] {
  const metric = GOVERNING_METRIC[component];
  if (!metric) return [];
  const out: number[] = [];
  for (const [comboId, r] of perCombo) {
    const f = (r.elementForces as Array<Record<string, number>>).find((x) => x.elementId === elementId);
    if (f && Math.abs(metric(f) - value) <= 1e-9 * Math.max(Math.abs(value), 1e-12)) out.push(comboId);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The combinations recorded as governing a member's component: every one that ties with the
 * app's governing value (which of them the app names depends on the order the session built the
 * combinations in), and always the one the app named, so a governing combination that is not
 * among them changes the snapshot.
 */
export function governingCombos(
  perCombo: Map<number, { elementForces: unknown[] }>, elementId: number, component: string, ref: { comboId: number; value: number },
): number[] {
  return [...new Set([...governingTies(perCombo, elementId, component, ref.value), ref.comboId])].sort((a, b) => a - b);
}
