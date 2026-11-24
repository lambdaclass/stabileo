import type { Element } from '../../store/model.svelte';
import { planeMemberAngle } from '../support-types';
import { applyVector, type Affine } from './affine';

export type MemberEnds = Pick<Element, 'nodeI' | 'nodeJ'>;

export function planeRollerFrames(
  nodes: ReadonlyMap<number, { x: number; y: number }>, ...memberSets: Iterable<MemberEnds>[]
): (nodeId: number) => number | undefined {
  const incident = new Map<number, MemberEnds[]>();
  const add = (id: number, member: MemberEnds) => {
    const atNode = incident.get(id);
    if (atNode) atNode.push(member);
    else incident.set(id, [member]);
  };
  for (const members of memberSets) {
    for (const member of members) {
      add(member.nodeI, member);
      if (member.nodeJ !== member.nodeI) add(member.nodeJ, member);
    }
  }
  return id => {
    const members = incident.get(id);
    return members && planeMemberAngle(id, nodes, members);
  };
}

export function planeRollerFrameChanged(before: number | undefined, after: number | undefined): boolean {
  return (before !== undefined && after === undefined) || (before ?? 0) !== (after ?? 0);
}

export function carriedPlaneRollerFrameChanged(before: number | undefined, after: number | undefined, T: Affine): boolean {
  if (before === undefined) return false;
  if (after === undefined) return true;
  const [x, y] = applyVector(T, [Math.cos(before), Math.sin(before), 0]);
  const expected = Math.atan2(y, x);
  const angleRoundoff = 4 * Number.EPSILON;
  return !(Math.abs(Math.sin((expected - after) / 2)) <= angleRoundoff);
}
