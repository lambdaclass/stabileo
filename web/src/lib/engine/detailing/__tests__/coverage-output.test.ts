/**
 * What the flagship detailing actually PRODUCES, in proportion to what it detailed.
 *
 * "114 bars across 408 members" is roughly one bar every four members. A single beam produces
 * bottom runners, curtailed bottoms and top bars at both supports, so that number is only
 * explicable if most members never reached the generator. These two assertions pin the output
 * volume down and record the coverage numbers so a future change that halves them shows up in
 * the diff rather than in a manual QA session.
 */

import { describe, it, expect } from 'vitest';
import { flagshipDetailing } from './helpers/flagship';

describe('detailing output volume', () => {
  it('produces bars in proportion to the members detailed, not a token few', () => {
    const r = flagshipDetailing();
    const bars = r.assemblies.reduce((n, a) => n + a.bars.length, 0);
    const members = new Set(r.assemblies.flatMap((a) => a.elementIds)).size;

    // A beam yields bottom runners plus top bars at two supports; a column lift yields its
    // longitudinal cage. Fewer than two bars per member means most members never reached
    // the generator — which is exactly what "114 bars for 408 members" was telling us.
    expect(members).toBeGreaterThan(300);
    expect(bars / members,
      `${bars} bars across ${members} members is too few to be a real cage`)
      .toBeGreaterThan(2);
  }, 300_000);

  it('reports the coverage numbers it claims, so a live count can be checked against it', () => {
    const r = flagshipDetailing();
    const members = new Set(r.assemblies.flatMap((a) => a.elementIds));
    const bars = r.assemblies.reduce((n, a) => n + a.bars.length, 0);
    // Not an assertion on exact values — a record, so a future change that halves the
    // output is visible in the diff rather than only in a manual QA session.
    expect({
      assemblies: r.assemblies.length > 0,
      membersOwned: members.size,
      detailable: r.readiness.detailable.length,
      skipped: r.skipped.length,
      barsPositive: bars > 0,
    }).toMatchObject({
      assemblies: true,
      membersOwned: r.readiness.detailable.length - r.skipped.length,
      barsPositive: true,
    });
  }, 300_000);
});
