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
import { FLAGSHIP_GRAVITY_SHEAR_DEPTH_REFUSALS } from '../../design/__tests__/helpers';
import { detailableReinforcement } from '../../design/outcome';
import { reviewRank } from '../assembly';
import { flagshipDetailing, flagshipRun } from './helpers/flagship';
import { CONTACT_ALLOWANCE } from '../classify';
import { lapGeometry } from '../splice-checks';

const EXPECTED_LAPS_BY_MEMBER_PAIR = [
  [177, 178, 9],
  [178, 179, 8],
  [189, 190, 9],
  [190, 191, 8],
  [212, 213, 9],
  [214, 215, 5],
  [215, 216, 8],
  [218, 219, 9],
  [359, 360, 10],
  [361, 362, 10],
  [363, 364, 8],
  [364, 365, 2],
  [366, 367, 2],
  [367, 368, 2],
  [369, 370, 3],
  [370, 371, 3],
  [372, 373, 2],
  [373, 374, 2],
  [375, 376, 8],
  [376, 377, 2],
] as const;

describe('the flagship\'s laps, after the materialiser keeps its records current', () => {
  beforeAll(() => { flagshipDetailing(); }, 600_000);

  it('every lap names two bars that exist in the finished assemblies', () => {
    const r = flagshipDetailing();
    const ids = new Set(r.assemblies.flatMap((a) => a.bars.map((b) => b.id)));
    const lost = r.lapping.laps.filter((l) => !ids.has(l.fromBarId) || !ids.has(l.toBarId));
    expect(lost.map((l) => `${l.jointId} ${l.fromBarId}/${l.toBarId}`)).toEqual([]);
  });

  it('builds the exact laps for members with available reinforcement', () => {
    const { summary } = flagshipRun();
    expect(summary).toMatchObject({ aborted: false, notReached: 0 });
    const eligible = new Set([...summary.outcomes.values()]
      .filter((outcome) => detailableReinforcement(outcome) !== null)
      .map((outcome) => outcome.elementId));
    const ineligiblePairs = EXPECTED_LAPS_BY_MEMBER_PAIR.filter(([from, to]) => !eligible.has(from) || !eligible.has(to));
    expect(ineligiblePairs).toEqual([]);
    const laps = flagshipDetailing().lapping.laps;
    expect(laps).toHaveLength(EXPECTED_LAPS_BY_MEMBER_PAIR.reduce((total, [, , count]) => total + count, 0));

    const actualByPair = new Map<string, number>();
    for (const lap of laps) {
      const pair = `${lap.fromElementId}/${lap.toElementId}`;
      actualByPair.set(pair, (actualByPair.get(pair) ?? 0) + 1);
    }
    expect(actualByPair).toEqual(new Map(EXPECTED_LAPS_BY_MEMBER_PAIR.map(([from, to, count]) => [`${from}/${to}`, count])));
  });

  it('gives no laps or approved assembly to refused members', () => {
    const { summary } = flagshipRun();
    const outcomes = [...summary.outcomes.values()];
    const unsupported = outcomes.filter((outcome) => outcome.outcome === 'UNSUPPORTED');
    expect(unsupported.map((outcome) => outcome.elementId).sort((a, b) => a - b))
      .toEqual(FLAGSHIP_GRAVITY_SHEAR_DEPTH_REFUSALS);
    const refused = new Set(outcomes
      .filter((outcome) => detailableReinforcement(outcome) === null)
      .map((outcome) => outcome.elementId));
    const { lapping: { laps }, assemblies } = flagshipDetailing();
    expect(laps.filter((lap) => lap.fromElementId === undefined || lap.toElementId === undefined
      || refused.has(lap.fromElementId) || refused.has(lap.toElementId))).toEqual([]);
    expect(assemblies.flatMap((assembly) => assembly.bars)
      .flatMap((bar) => bar.ownerElementIds.filter((id) => refused.has(id)))).toEqual([]);
    expect(assemblies.filter((assembly) => reviewRank(assembly.state) >= reviewRank('VERIFIED')
      && assembly.elementIds.some((id) => refused.has(id))).map((assembly) => assembly.id)).toEqual([]);
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
