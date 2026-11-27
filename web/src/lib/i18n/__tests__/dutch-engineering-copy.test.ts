import { expect, it } from 'vitest';
import { exampleStrings } from '../../../components/examples/strings';
import { batchTranslations } from '../../../components/tools/batch-i18n';
import { toolTranslations } from '../../../components/tools/translations';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { allDictFor } from '../locales/all';
import { unfinishedProClaims } from '../pro-copy';

const momentConvention = /positief bij trek in de ondervezel/;
const nl = allDictFor('nl');

it.each([
  ['course.kinematics.dm.introStates', 'ΔL − α·ΔT·L'],
  ['course.plastic.kin.positionWhy', '|M| = Mp'],
  ['course.influence.doc.mb.principle', 'tegengestelde teken'],
  ['steps.deformation.axialLead', '∫'],
  ['steps.cuts.load.caption', 'koppel'],
  ['steel.f62.lambdaLabel', 'b/(2·tf) voor I/H'],
  ['steel.f62.lambdaLabel', 'b/tf voor U/C'],
  ['steel.f62.lambdaLabel', 'bf de uitstand'],
  ['c301.f.ltbElastic', 'min(Mcr, Mp)'],
  ['steel.workflow.results.ae', 'Tabel J.3.3'],
  ['steel.status.DEMAND_UNAVAILABLE', 'Krachtsresultaten niet beschikbaar'],
  ['account.researchHint', 'Standaard uit'],
])('Dutch %s states the applicable engineering or product condition', (key, required) => {
  expect(nl[key]).toContain(required);
});

it.each(['steel.tc.calc.yield', 'steel.tc.calc.rupture', 'c301.d.yield', 'c301.d.rupture', 'c301.e.pn', 'c301.g.vn'])(
  '%s converts the substituted newtons to kilonewtons', key => {
    expect(nl[key]).toMatch(/\/1000 = \{\w+\} kN/);
  },
);

it.each(['PRO is in bèta.', 'PRO is een bètaversie.'])('flags %s as unfinished Dutch PRO copy', phrase => {
  expect(unfinishedProClaims(phrase, 'nl', { aboutPro: false })).toEqual([phrase]);
  expect(unfinishedProClaims('Het ontwerp is in bèta.', 'nl', { aboutPro: true })).toEqual([]);
});

it.each([
  ['example chart', exampleStrings.nl['c.moment']],
  ['influence line', batchTranslations.nl['tools.batch.influenceSign']],
  ['frame tool', batchTranslations.nl['tools.batch.signConvention']],
  ['beam tool', toolTranslations.nl['tools.signConvention']],
  ...['basic-influence-line-moment-sign', 'basic-influence-line-moment-sign-returns'].map(id => [
    id, RESULT_CHANGES.changes.find(change => change.id === id)?.title.nl,
  ]),
])('defines positive moment by tension on the bottom fibre in the Dutch %s', (_, label) => {
  expect(label).toMatch(momentConvention);
  expect(label).not.toMatch(/positief bij trek in de bovenvezel/i);
});
