/**
 * Saying what a constraint IS, in one sentence.
 *
 * ── Why this is a module and not a component's private helper ──────
 *
 * It was private to `ProConstraintsTab`, which listed the constraints itself.
 * When that list moved into the shared data table the description had to move
 * with it, or the shared table would have shown a generic "rigidLink · 3 · 7"
 * where the panel had shown "node 3 → 7, ux,uy,uz" — worse information, and a
 * second describer that could come to disagree with the first.
 *
 * A constraint has no geometry of its own: nothing in the viewport is shaped
 * like one, so this sentence is the ONLY way a reader can see what is in the
 * model. That is what makes it worth carrying rather than re-deriving.
 */

/** 3D DOF order MUST mirror `EccentricConnectionConstraint.releases` in
 *  `engine/src/types/input.rs`: 3D = [ux, uy, uz, rx, ry, rz]. */
export const DOF_LABELS = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const;

export type Translate = (key: string) => string;

/** DOF indices as names, tolerating the string entries older saves carry. */
export function dofIndicesToNames(dofs: unknown, t: Translate): string {
  if (!Array.isArray(dofs) || dofs.length === 0) return t('pro.allDofs');
  return dofs.map((d: unknown) => {
    if (typeof d === 'number') return DOF_LABELS[d] ?? String(d);
    return String(d);
  }).join(',');
}

/** The kind, in the reader's language. */
export function constraintTypeLabel(type: string, t: Translate): string {
  switch (type) {
    case 'rigidLink': return t('pro.rigidLink');
    case 'diaphragm': return t('pro.diaphragm');
    case 'equalDOF': return t('pro.equalDof');
    case 'eccentricConnection': return t('pro.eccentricConnection');
    case 'linearMPC': return t('pro.linearMpc');
    default: return type;
  }
}

/** What this particular constraint ties, and how. */
export function constraintLabel(c: Record<string, unknown>, t: Translate): string {
  const s = (k: string) => String(c[k] ?? '');
  const n = (k: string) => Number(c[k] ?? 0);

  if (c.type === 'rigidLink') {
    return t('pro.constraintRigid')
      .replace('{master}', s('masterNode'))
      .replace('{slave}', s('slaveNode'))
      .replace('{dofs}', dofIndicesToNames(c.dofs, t));
  }
  if (c.type === 'diaphragm') {
    return t('pro.constraintDiaph')
      .replace('{plane}', s('plane') || 'XZ')
      .replace('{master}', s('masterNode'))
      .replace('{n}', String((c.slaveNodes as unknown[] | undefined)?.length ?? 0));
  }
  if (c.type === 'equalDOF') {
    return t('pro.constraintEqDof')
      .replace('{master}', s('masterNode'))
      .replace('{slave}', s('slaveNode'))
      .replace('{dofs}', dofIndicesToNames(c.dofs, t));
  }
  if (c.type === 'linearMPC') {
    return t('pro.constraintMpc')
      .replace('{n}', String((c.terms as unknown[] | undefined)?.length ?? 0));
  }
  if (c.type === 'eccentricConnection') {
    const offset = `(${n('offsetX')}, ${n('offsetY')}, ${n('offsetZ')})`;
    const released = ((c.releases as boolean[] | undefined) ?? [])
      .map((r, i) => (r ? DOF_LABELS[i] : null))
      .filter(Boolean)
      .join(',');
    return t('pro.constraintEcc')
      .replace('{master}', s('masterNode'))
      .replace('{slave}', s('slaveNode'))
      .replace('{offset}', offset)
      .replace('{releases}', released.length > 0 ? released : t('pro.eccentricNoRelease'));
  }
  return t('pro.unknown');
}
