/**
 * Which typology a joint takes, from the members that meet at it and the support under it:
 *
 *   a column standing on a support               base: fixed when the support holds rotation, else pinned;
 *   a brace among the members, or a lattice      gusset (the most loaded member is the main one);
 *   (angles, round bars)
 *   two collinear members and nothing else       splice;
 *   two rafters rising to the joint, no column   apex;
 *   a column and a beam                          knee for an inclined beam (a rafter), end plate for a
 *                                                continuous beam, shear tab for a beam released there;
 *   beams only (a beam carried by a girder)      shear tab.
 *
 * Anything else is left unresolved with the reason.
 */
import { dot } from './shared';
import type { JointMember, Typology } from './types';

export function proposeTypology(members: readonly JointMember[], support: 'fixed' | 'pinned' | null): { kind: Typology | null; reasonKey?: string; mainId?: number } {
  const cols = members.filter((m) => m.kind === 'column'), beams = members.filter((m) => m.kind === 'beam'), braces = members.filter((m) => m.kind === 'brace');
  if (support && cols.length) return { kind: support === 'fixed' ? 'baseFixed' : 'basePinned', mainId: cols[0]!.id };
  if (support) return { kind: null, reasonKey: 'joint.typ.unresolved.supportNoColumn' };
  // Angles, round bars or no section at all: a lattice, joined by gussets. The main member is the
  // most loaded one.
  const lattice = (m: JointMember) => !m.section || !m.section.shape || m.section.shape === 'L';
  const heaviest = (ms: readonly JointMember[]) => ms.reduce((a, b) => (Math.abs(b.N) > Math.abs(a.N) ? b : a));
  if (braces.length) return { kind: 'gusset', mainId: heaviest(braces).id };
  if (members.some(lattice)) return { kind: 'gusset', mainId: heaviest(members).id };
  if (members.length === 2 && dot(members[0]!.dir, members[1]!.dir) < -0.99) return { kind: 'splice', mainId: members[0]!.id };
  const rafters = beams.filter((b) => b.inclination < -3);
  if (!cols.length && beams.length === 2 && rafters.length === 2) return { kind: 'apex', mainId: beams[0]!.id };
  if (cols.length && beams.length) {
    const b = beams.find((x) => Math.abs(x.inclination) > 3) ?? beams[0]!;
    if (Math.abs(b.inclination) > 3) return { kind: 'knee', mainId: b.id };
    return { kind: b.released ? 'shearTab' : 'endPlate', mainId: b.id };
  }
  if (beams.length >= 2) return { kind: 'shearTab', mainId: beams.find((x) => x.released)?.id ?? beams[beams.length - 1]!.id };
  return { kind: null, reasonKey: 'joint.typ.unresolved.unrecognized' };
}
