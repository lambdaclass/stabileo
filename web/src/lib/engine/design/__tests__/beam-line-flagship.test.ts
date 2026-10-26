/**
 * The flagship frame's beam lines read as bars along each line and projected back: every one of
 * its beams checks exactly as its own designed bars do, check by check.
 */
import { describe, it, expect } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { solveFixture } from './helpers';
import { detailableReinforcement } from '../outcome';
import { beamLines, mirrorReinforcement } from '../repeated-frames';
import { lineFromMembers, lineMembersOf, membersFromLine } from '../beam-line';

describe('the flagship beam lines, as lines', () => {
  it('round-trip to the same checks on every beam', () => {
    const solved = solveFixture(frame);
    const s = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
    const bars = new Map([...s.outcomes.values()].map((o) => [o.elementId, detailableReinforcement(o)?.rebar]));
    const lines = beamLines(solved.data, (id) => solved.contexts.get(id)?.elementType === 'beam');
    expect(lines.length).toBeGreaterThan(10);
    let beams = 0;
    for (const l of lines) {
      const ms = lineMembersOf(l, (id) => {
        const e = solved.data.elements.get(id)!, a = solved.data.nodes.get(e.nodeI)!, b = solved.data.nodes.get(e.nodeJ)!;
        return { L: Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)), criticalSections: solved.contexts.get(id)?.criticalSections, reinforcement: bars.get(id) };
      }, mirrorReinforcement);
      const back = membersFromLine(lineFromMembers(ms), ms);
      l.members.forEach((id, i) => {
        const own = bars.get(id);
        if (!own) return;
        const trip = back.get(id)!;
        const ctx = solved.contexts.get(id)!;
        const turned = l.forward[i] !== false ? trip : mirrorReinforcement(trip);
        const key = (v: { checks: Array<{ category: string; status: string; ratio: number }> }) => v.checks.map((c) => `${c.category}|${c.status}|${c.ratio}`).sort();
        expect(key(cirsoc201Adapter.verify(ctx, turned)), `member ${id}`).toEqual(key(cirsoc201Adapter.verify(ctx, own)));
        beams++;
      });
    }
    expect(beams).toBeGreaterThan(200);
  }, 300_000);
});
