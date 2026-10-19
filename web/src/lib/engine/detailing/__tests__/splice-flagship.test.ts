/**
 * The 408-member frame's laps, as the classifier and the gate read them.
 *
 * Measured before the materialiser kept its lap records current: 117 of the 544 laps named a bar
 * that a later fusion had absorbed (`e174-bot-cont-0` lapped at one joint, then fused at the next
 * into `e174-bot-cont-0+e175-bot-cont-0`). The lap index answered for the old id, so 22 pairs of
 * lap partners were judged by §25.2.1 clear spacing as `crossMemberSpacing` (11 + 3 + 3 + 3
 * `clearance`/`marginal` non-contact and contact pairs, 2 `overlap`), 2 285 conflicts in all.
 * After: none is lost, no partner pair is a spacing conflict, 2 263 conflicts.
 *
 * What stays, and must: the partner pairs whose two bars share a centreline (two layouts putting
 * different diameters at one slot) interpenetrate as drawn. They remain `prohibitedOverlap`, and
 * each is now also an open `detailing.lapCheck.unarranged` condition naming the lap.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { flagshipDetailing } from './helpers/flagship';
import { CONTACT_ALLOWANCE } from '../classify';
import { lapGeometry } from '../splice-checks';

describe('the flagship\'s laps, after the materialiser keeps its records current', () => {
  beforeAll(() => { flagshipDetailing(); }, 600_000);

  it('every lap names two bars that exist in the finished assemblies', () => {
    const r = flagshipDetailing();
    const ids = new Set(r.assemblies.flatMap((a) => a.bars.map((b) => b.id)));
    const lost = r.lapping.laps.filter((l) => !ids.has(l.fromBarId) || !ids.has(l.toBarId));
    expect(r.lapping.laps.length).toBeGreaterThan(500);
    expect(lost.map((l) => `${l.jointId} ${l.fromBarId}/${l.toBarId}`)).toEqual([]);
  });

  it('no pair of lap partners is judged as a clear-spacing conflict', () => {
    const r = flagshipDetailing();
    const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const partners = new Set(r.lapping.laps.map((l) => key(l.fromBarId, l.toBarId)));
    const asSpacing = r.assemblies.flatMap((a) => a.conflicts)
      .filter((c) => partners.has(key(c.barA, c.barB)) && c.pairClass !== 'prohibitedOverlap');
    expect(asSpacing.map((c) => `${c.barA}/${c.barB} ${c.pairClass}`)).toEqual([]);
  });

  it('a lap whose bars share a centreline is a prohibited overlap AND an open lap condition', () => {
    const r = flagshipDetailing();
    const bars = new Map(r.assemblies.flatMap((a) => a.bars).map((b) => [b.id, b]));
    const open = new Set(r.assemblies.flatMap((a) => a.unsupported)
      .filter((u) => u.key === 'detailing.lapCheck.unarranged').map((u) => String(u.params?.joint)));
    const coincident = r.lapping.laps.filter((l) => {
      const a = bars.get(l.fromBarId)!, b = bars.get(l.toBarId)!;
      const g = lapGeometry(a, b)!;
      return g.minOffset < (a.diameterMm + b.diameterMm) / 2000 - CONTACT_ALLOWANCE;
    });
    expect(coincident.length).toBeGreaterThan(0);
    expect(coincident.filter((l) => !open.has(l.jointId)).map((l) => l.jointId)).toEqual([]);
    // And no assembly that holds an open lap is CONSTRUCTIBLE.
    for (const a of r.assemblies) {
      if (a.unsupported.some((u) => u.key.startsWith('detailing.lapCheck.'))) expect(a.state, a.id).not.toBe('CONSTRUCTIBLE');
    }
  });
});
