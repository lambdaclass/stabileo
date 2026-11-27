import { expect, it } from 'vitest';
import { allDictFor } from '../locales/all';
import { unfinishedProClaims } from '../pro-copy';

const nl = allDictFor('nl');

it.skip.each([
  ['course.kinematics.dm.introStates', 'ΔL − α·ΔT·L'],
  ['course.plastic.kin.positionWhy', '|M| = Mp'],
  ['course.influence.doc.mb.principle', 'tegengestelde teken'],
  ['steps.deformation.axialLead', '∫'],
  ['steps.cuts.load.caption', 'koppel'],
  ['steel.f62.lambdaLabel', 'bf/(2·tf)'],
  ['c301.f.ltbElastic', 'min(Mcr, Mp)'],
  ['steel.workflow.results.ae', 'Tabel J.3.3'],
  ['steel.status.DEMAND_UNAVAILABLE', 'Krachtsresultaten niet beschikbaar'],
  ['account.researchHint', 'Standaard uit'],
])('known wrong result: #2613 — Dutch %s states the applicable engineering or product condition', (key, required) => {
  expect(nl[key]).toContain(required);
});

it.skip.each(['steel.tc.calc.yield', 'steel.tc.calc.rupture', 'c301.d.yield', 'c301.d.rupture', 'c301.e.pn', 'c301.g.vn'])(
  'known wrong result: #2613 — %s converts the substituted newtons to kilonewtons', key => {
    expect(nl[key]).toMatch(/\/1000 = \{\w+\} kN/);
  },
);

it.skip.each(['PRO is in bèta.', 'PRO is een bètaversie.'])('known wrong result: #2613 — flags %s as unfinished Dutch PRO copy', phrase => {
  expect(unfinishedProClaims(phrase, 'nl', { aboutPro: false })).toEqual([phrase]);
  expect(unfinishedProClaims('Het ontwerp is in bèta.', 'nl', { aboutPro: true })).toEqual([]);
});
