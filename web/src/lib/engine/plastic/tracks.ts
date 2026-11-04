import type { PlasticHinge } from '../result-types';

type Hinge = PlasticHinge & { kind?: string };

export interface HingeTracks {
  /** The track of each hinge, by its index in the result. */
  trackOf: number[];
  /** The hinges of each track, in the order they formed. */
  members: number[][];
  /** The steps where a new track starts, and the last step. */
  keySteps: number[];
}

const where = (h: Hinge) => h.position ?? (h.end === 'start' ? 0 : 1);
const inSpan = (h: Hinge) => h.kind !== 'axial' && where(h) > 1e-9 && where(h) < 1 - 1e-9;

/**
 * Under a distributed load the peak moment of a span drifts as hinges form elsewhere. The
 * analysis reads the member at discrete sections, so a drifting hinge shows up as a hinge that
 * closes at the very λ a neighbour on the same member opens. Those belong to one hinge that moved:
 * a track. Counted by tracks, a structure of degree GH collapses with at most GH + 1 hinges.
 */
export function hingeTracks(hinges: Hinge[], lastStep: number): HingeTracks {
  const trackOf: number[] = [];
  const members: number[][] = [];
  hinges.forEach((h, j) => {
    let track = -1;
    if (inSpan(h)) {
      track = members.findIndex((m) => {
        const g = hinges[m[m.length - 1]];
        return inSpan(g) && g.elementId === h.elementId && g.unloadedAt !== undefined
          && Math.abs(g.unloadedAt - h.loadFactor) <= 1e-6 * Math.max(1, Math.abs(h.loadFactor))
          && Math.abs(where(g) - where(h)) <= 0.25;
      });
    }
    if (track < 0) { track = members.length; members.push([j]); } else members[track].push(j);
    trackOf.push(track);
  });
  const starts = new Set(members.map((m) => hinges[m[0]].step));
  if (lastStep >= 0) starts.add(lastStep);
  return { trackOf, members, keySteps: [...starts].sort((a, b) => a - b) };
}

/** A track as it stands at a step: its hinge then, where it started, and whether it is still open. */
export function trackAt(hinges: Hinge[], member: number[], step: number, lambda: number): { now: number; first: number; open: boolean } | null {
  const formed = member.filter((i) => hinges[i].step <= step);
  if (!formed.length) return null;
  const now = formed[formed.length - 1];
  const closedAt = hinges[now].unloadedAt;
  return { now, first: formed[0], open: closedAt === undefined || closedAt > lambda + 1e-9 };
}

/** How many distinct hinges stand open when the collapse ends. */
export function openHingeCount(r: { hinges: Hinge[]; steps: unknown[]; collapseFactor: number }): number {
  const last = r.steps.length - 1;
  return hingeTracks(r.hinges, last).members.filter((m) => trackAt(r.hinges, m, last, r.collapseFactor)?.open).length;
}
