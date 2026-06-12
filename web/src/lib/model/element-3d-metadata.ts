/** A member-offset vector. For frame 'global' these are global X/Y/Z (m);
 *  for frame 'local' they are along the element local axes (x=ex along member,
 *  y=ey, z=ez), in metres. */
export interface MemberOffsetVec {
  x: number;
  y: number;
  z: number;
}

/**
 * Analytical member offset: the member is parallel-shifted off its node
 * centerline by these end vectors, producing real eccentricity at the joints.
 * Implemented WITHOUT solver changes via ephemeral helper nodes + eccentric
 * constraints generated in buildSolverInput3D — never persisted as topology.
 */
export interface MemberOffset {
  frame: 'global' | 'local';
  /** Offset applied at the I end (omitted/zero = no offset there). */
  i?: MemberOffsetVec;
  /** Offset applied at the J end. */
  j?: MemberOffsetVec;
}

/**
 * Analytical shell offset: the shell's mid-surface is parallel-shifted off its
 * node plane by a single vector applied to every corner. For frame 'local',
 * z is along the shell normal, x along the node0→node1 edge, y = n×x (the same
 * convention the viewport shell triad uses). Implemented WITHOUT solver changes
 * via ephemeral per-corner helper nodes + all-6-DOF rigid eccentric constraints
 * (shell nodes are 6-DOF), exactly like member offsets — never persisted as
 * topology.
 */
export interface ShellOffset {
  frame: 'global' | 'local';
  x: number;
  y: number;
  z: number;
}

export interface Element3DMetadata {
  localYx?: number;
  localYy?: number;
  localYz?: number;
  rollAngle?: number;
  /** Analytical member offset (eccentric framing). Render + solver-input only. */
  offset?: MemberOffset;
}

export function pickElement3DMetadata(source: Element3DMetadata): Element3DMetadata {
  const metadata: Element3DMetadata = {};
  if (source.localYx !== undefined) metadata.localYx = source.localYx;
  if (source.localYy !== undefined) metadata.localYy = source.localYy;
  if (source.localYz !== undefined) metadata.localYz = source.localYz;
  if (source.rollAngle !== undefined) metadata.rollAngle = source.rollAngle;
  if (source.offset !== undefined) {
    metadata.offset = {
      frame: source.offset.frame,
      ...(source.offset.i ? { i: { ...source.offset.i } } : {}),
      ...(source.offset.j ? { j: { ...source.offset.j } } : {}),
    };
  }
  return metadata;
}

export function hasExplicitLocalY(source: Element3DMetadata): boolean {
  return source.localYx !== undefined && source.localYy !== undefined && source.localYz !== undefined;
}
