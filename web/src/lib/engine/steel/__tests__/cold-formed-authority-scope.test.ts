/**
 * What a cold-formed member is told, and why it is not told to solve.
 *
 * ── The instruction, and the deviation from it ─────────────────────────
 *
 * The scope for this block asked for `DEMAND_UNAVAILABLE` on any verification that does not yet
 * exist. That state is documented in `steel-status.ts` as something narrower:
 *
 *   > DEMAND_UNAVAILABLE  the member is metallic and the forces are not there — no solve, no
 *   >                     combinations. Distinct from the two above because the remedy is the
 *   >                     user's and it is obvious.
 *
 * A cold-formed member has geometry and, after a solve, forces. What it lacks is an AUTHORITY:
 * CIRSOC 301-2018 excludes cold-formed open sections by name (chapter A, in the text this app
 * ships) and defers to CIRSOC 303-2009, which is not in `docs/codes/`. Solving changes nothing.
 *
 * So the state used is `NOT_DESIGNED` — «recognised as metallic; no design was attempted, because
 * no metallic design authority is bound» — with a reason that names the exclusion. Reporting
 * `DEMAND_UNAVAILABLE` would put a true-sounding label on the wrong cause and send a user to
 * re-run an analysis that was never the obstacle. That is the defect this whole surface exists to
 * avoid, so the deviation is deliberate and written down rather than silently taken.
 *
 * ── Why the branch is reachable at all ────────────────────────────────
 *
 * It is not, today: nothing can bind a metallic authority yet, so every metallic member stops at
 * «no authority bound» first. The branch is what says the right thing on the day something IS
 * bindable — and the test binds one to prove it, which is the only way to exercise a future
 * without waiting for it.
 */

import { describe, it, expect } from 'vitest';
import { buildSteelInventory, type InventoryModel } from '../steel-inventory';
import { steelCountsAsVerified } from '../steel-status';
import { coldFormedSectionFields, coldFormedSource } from '../../../profiles/cold-formed-catalogue';

const STEEL = { id: 1, name: 'Acero conformado', fy: 250 };

/** One horizontal member on the given section. */
function model(section: object): InventoryModel {
  return {
    nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]) as never,
    sections: new Map([[1, { id: 1, ...section }]]) as never,
    materials: new Map([[1, STEEL]]),
  };
}

const coldFormed = model(coldFormedSectionFields(coldFormedSource.byId('C 150x60x20x2.0')!));
const hotRolled = model({ name: 'IPE 200', profileFamily: 'IPE', b: 0.1, h: 0.2 });

describe('with an authority bound, a cold-formed member says why it is still out of scope', () => {
  it('reports NOT_DESIGNED and names the exclusion', () => {
    const inv = buildSteelInventory(coldFormed, { hasDemands: true, authorityBound: true });
    expect(inv.members[0].state.status).toBe('NOT_DESIGNED');
    expect(inv.members[0].state.reasons[0].key).toBe('steel.reason.coldFormedOutOfScope');
  });

  it('and NOT `DEMAND_UNAVAILABLE`, because the forces are not the obstacle', () => {
    // The assertion the deviation rests on. `hasDemands: true` — the analysis is there, and the
    // member still cannot be verified. Telling this user to solve would be telling them to fix
    // something that is not broken.
    const inv = buildSteelInventory(coldFormed, { hasDemands: true, authorityBound: true });
    expect(inv.members[0].state.status).not.toBe('DEMAND_UNAVAILABLE');
  });

  it('while a hot-rolled member gets the ordinary not-run reason', () => {
    // The contrast that shows the branch discriminates on the section rather than firing for
    // every member.
    const inv = buildSteelInventory(hotRolled, { hasDemands: true, authorityBound: true });
    expect(inv.members[0].state.reasons[0].key).toBe('steel.reason.designNotRun');
  });
});

describe('the ordering of reasons is preserved', () => {
  it('no solve still wins, because that remedy is the user’s and it is immediate', () => {
    /*
     * `stateFor` documents its ordering as «most actionable reason first». A user with no
     * analysis should be told to run one — even on a cold-formed section, where a second and
     * permanent obstacle waits behind it. Hearing the permanent one first would be hearing the
     * less useful of two true things.
     */
    const inv = buildSteelInventory(coldFormed, { hasDemands: false, authorityBound: true });
    expect(inv.members[0].state.status).toBe('DEMAND_UNAVAILABLE');
    expect(inv.members[0].state.reasons[0].key).toBe('steel.reason.noDemands');
  });

  it('and "nothing is bound" still wins over "the bound thing excludes you"', () => {
    // Which is the state the app is actually in: with no authority bindable, a cold-formed
    // member reports the same thing every other metallic member reports.
    const inv = buildSteelInventory(coldFormed, { hasDemands: true, authorityBound: false });
    expect(inv.members[0].state.status).toBe('NOT_DESIGNED');
    expect(inv.members[0].state.reasons[0].key).toBe('steel.reason.noMetallicAuthority');
  });
});

describe('nothing about a cold-formed section produces a pass', () => {
  it('in any combination of demands and binding', () => {
    for (const hasDemands of [true, false]) {
      for (const authorityBound of [true, false]) {
        const inv = buildSteelInventory(coldFormed, { hasDemands, authorityBound });
        const state = inv.members[0].state;
        expect(steelCountsAsVerified(state.status)).toBe(false);
        expect(state.experimental).toBeUndefined();
        expect(state.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  it('and the member is still listed, not silently dropped for being unverifiable', () => {
    // A section the app cannot check must still appear. Omitting it is how a user comes to
    // believe their purlins were designed.
    const inv = buildSteelInventory(coldFormed, { hasDemands: true, authorityBound: true });
    expect(inv.members).toHaveLength(1);
    expect(inv.members[0].sectionName).toBe('C 150x60x20x2.0');
  });
});
