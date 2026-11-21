import { describe, it, expect } from 'vitest';
import { drawnBeamReinforcement } from '../../../design-contract/reinforcement';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import { outcomeFromProvided, runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { FLAGSHIP_GRAVITY_SHEAR_DEPTH_REFUSALS, solveFixture } from './helpers';
import { detailableReinforcement } from '../outcome';
import { beamLines, mirrorReinforcement } from '../repeated-frames';
import { lineFromMembers, lineMembersOf, membersFromLine } from '../beam-line';

describe('the flagship beam lines, as lines', () => {
  it('preserves regional checks and checks the drawn hoop transitions on every beam', () => {
    const solved = solveFixture(frame);
    const s = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
    const bars = new Map([...s.outcomes.values()].map((o) => [o.elementId, detailableReinforcement(o)?.rebar]));
    const lines = beamLines(solved.data, (id) => solved.contexts.get(id)?.elementType === 'beam');
    expect(lines.length).toBeGreaterThan(10);
    const checked: number[] = [];
    const withheld: number[] = [];
    const transitioned: number[] = [];
    const minimumShortfalls: number[] = [];
    const topExtentRefusals = new Set([363, 365, 366, 368, 369, 371, 372, 374, 375, 377, 378, 381, 382, 385, 386, 389, 390, 393]);
    const bottomExtentRefusals = new Set([363, 365, 366, 368, 369, 371, 372, 374, 375, 377, 381, 385, 389, 393]);
    const secondaryExtentRefusals = new Set([363, 365, 366, 368, 369, 371, 372, 374, 375, 377]);
    const overallExtentRefusals = new Set([378, 381, 382, 385, 386, 389, 390, 393]);
    const spanMinimumShortfalls = new Set([363, 366, 369, 372, 375]);
    const spanTensionSteelRefusals = new Set([
      178, 179, 190, 191, 208, 209, 210, 213, 214, 215, 216, 219,
      220, 221, 222, 239, 240, 241, 242, 243, 244, 245, 246, 247,
      248, 249, 250, 251, 252, 253, 270, 271, 272, 273, 274, 275,
      276, 277, 278, 279, 280, 281, 282, 283, 284, 301, 302, 303,
      304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315,
      332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343,
      344, 345, 346, 363, 364, 365, 366, 367, 368, 369, 370, 371,
      372, 373, 374, 375, 376, 377, 394, 395, 396, 397, 398, 399,
      400, 401, 402, 403, 404, 405, 406, 407, 408,
    ]);
    const overallTensionSteelRefusals = new Set([
      178, 190, 208, 209, 210, 213, 214, 215, 216, 219, 220, 221,
      222, 240, 243, 246, 249, 252, 271, 274, 280, 283, 302, 314,
      333, 345, 364, 376, 394, 395, 396, 397, 399, 400, 402, 403,
      405, 406, 407, 408,
    ]);
    const primaryShear = (row: { category: string }) => /^Shear (Support|Span) \(Vz\)/.test(row.category);
    const key = (checks: Array<{ category: string; status: string; ratio: number }>) =>
      checks.map(c => `${c.category}|${c.status}|${c.ratio}`).sort();
    for (const l of lines) {
      const ms = lineMembersOf(l, (id) => {
        const e = solved.data.elements.get(id)!, a = solved.data.nodes.get(e.nodeI)!, b = solved.data.nodes.get(e.nodeJ)!;
        return { L: Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)), criticalSections: solved.contexts.get(id)?.criticalSections, reinforcement: bars.get(id) };
      }, mirrorReinforcement);
      const back = membersFromLine(lineFromMembers(ms), ms);
      l.members.forEach((id, i) => {
        const own = bars.get(id);
        const outcome = s.outcomes.get(id)!;
        if (!own) {
          expect(outcome.accepted, `member ${id}`).toBeUndefined();
          expect(outcome.certificate, `member ${id}`).toBeUndefined();
          if (outcome.outcome === 'UNSUPPORTED') {
            expect(outcome.reasons, `member ${id}`).toContainEqual({ key: 'diag.rcShearDepth' });
            withheld.push(id);
          } else {
            expect(outcome.outcome, `member ${id}`).toBe('SEARCH_EXHAUSTED');
          }
          expect(back.get(id)?.[drawnBeamReinforcement]?.stirrups, `member ${id}`).toEqual([]);
          return;
        }
        checked.push(id);
        const trip = back.get(id)!;
        const ctx = solved.contexts.get(id)!;
        const turned = l.forward[i] !== false ? trip : mirrorReinforcement(trip);
        const { [drawnBeamReinforcement]: evidence, ...regional } = turned;
        expect(evidence?.stirrups.length, `member ${id}`).toBeGreaterThan(0);
        const original = cirsoc201Adapter.verify(ctx, own);
        const regionRoundTrip = cirsoc201Adapter.verify(ctx, regional);
        const drawn = cirsoc201Adapter.verify(ctx, turned);
        expect(key(regionRoundTrip.checks), `member ${id}`).toEqual(key(original.checks));
        const extentCategories = [
          ...(topExtentRefusals.has(id) ? ['Top Span (My-)'] : []),
          ...(bottomExtentRefusals.has(id) ? ['Bottom Span (My+)'] : []),
          ...(secondaryExtentRefusals.has(id) ? ['Secondary shear (Vy)'] : []),
        ].sort();
        const refusals = drawn.checks.filter(c => c.description === 'diag.rcDrawnBarExtent' || c.description === 'diag.rcDrawnCornerSeat');
        expect(refusals.map(c => c.category).sort(), `member ${id}`).toEqual(extentCategories);
        const replaced = new Set(extentCategories.flatMap(category => [category, `${category} ductility`]));
        expect(key(drawn.checks.filter(c => !primaryShear(c))), `member ${id}`).toEqual([
          ...key(original.checks.filter(c => !primaryShear(c) && !replaced.has(c.category))),
          ...extentCategories.map(category => `${category}|fail|Infinity`),
        ].sort());
        for (const row of refusals) {
          expect(row).toMatchObject({ limiting: 'unsupportedCheck', stationX: expect.any(Number),
            description: row.category === 'Secondary shear (Vy)' ? 'diag.rcDrawnCornerSeat' : 'diag.rcDrawnBarExtent' });
          expect(original.checks.find(c => c.category === row.category)?.status).toBe('ok');
        }
        if (overallExtentRefusals.has(id) || overallTensionSteelRefusals.has(id)) {
          expect(original.overallStatus).toBe('ok');
          expect(drawn.overallStatus).toBe('fail');
          expect(outcomeFromProvided(cirsoc201Adapter, ctx, turned, drawn)).toBeNull();
        }
        const prescribed = original.checks.filter(primaryShear);
        const projected = drawn.checks.filter(primaryShear);
        expect(projected.filter(row => row.description === 'diag.rcShearCutoff'), `member ${id}`).toEqual([]);
        if (overallExtentRefusals.has(id)) {
          expect(projected.find(row => row.category === 'Shear Span (Vz)'), `member ${id}`).toMatchObject({
            status: 'ok', limiting: 'shear', ratio: 0.388,
          });
        }
        const tensionRefusals = projected.filter(row => row.description === 'diag.rcShearTensionSteel');
        expect(tensionRefusals.map(row => row.category), `member ${id}`)
          .toEqual(spanTensionSteelRefusals.has(id) ? ['Shear Span (Vz)'] : []);
        for (const row of tensionRefusals) {
          expect(row).toMatchObject({ status: 'fail', ratio: Infinity, capacity: 0, limiting: 'unsupportedCheck' });
        }
        if (JSON.stringify(key(projected)) !== JSON.stringify(key(prescribed))) transitioned.push(id);
        for (const row of prescribed) {
          const corresponding = projected.find(c => c.category === row.category);
          expect(corresponding, `member ${id} ${row.category}`).toBeDefined();
          expect(corresponding!.ratio, `member ${id} ${row.category}`).toBeGreaterThanOrEqual(row.ratio);
        }
        const added = projected.filter(c => !prescribed.some(r => r.category === c.category));
        const extraSpanRow = spanMinimumShortfalls.has(id);
        if (added.length || extraSpanRow) {
          expect(added, `member ${id}`).toHaveLength(extraSpanRow ? 2 : 1);
          if (extraSpanRow) {
            expect(added.map(row => row.category).sort(), `member ${id}`).toEqual([
              'Shear Span (Vz) Av,min §9.6.3.1', 'Shear Support (Vz) Av,min §9.6.3.1',
            ]);
          }
          for (const row of added) {
            expect(row.category, `member ${id}`).toContain('Av,min §9.6.3.1');
            expect(row, `member ${id}`).toMatchObject({ status: 'fail', ratio: 1.546, limiting: 'shear' });
          }
          expect(outcomeFromProvided(cirsoc201Adapter, ctx, turned, drawn), `member ${id}`).toBeNull();
          minimumShortfalls.push(id);
        }
        if (id === 178) {
          expect(key(prescribed)).toEqual(['Shear Span (Vz)|ok|0.582', 'Shear Support (Vz)|ok|0.476']);
          expect(key(projected)).toEqual(['Shear Span (Vz)|fail|Infinity', 'Shear Support (Vz)|ok|0.751']);
        }
      });
    }
    expect(lines.flatMap(line => line.members).length).toBeGreaterThan(200);
    expect(checked).toHaveLength(139);
    expect(withheld.sort((a, b) => a - b)).toEqual(FLAGSHIP_GRAVITY_SHEAR_DEPTH_REFUSALS);
    expect(transitioned).toHaveLength(107);
    expect(minimumShortfalls).toHaveLength(52);
  }, 300_000);
});
