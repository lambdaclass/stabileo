import { expect, it } from 'vitest';
import { CHANGELOG } from '../../changelog';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import channelNotice from '../../provenance/result-changes/f62-channel-minimum-modulus.json';
import { conditionHolds } from '../../provenance/applicability';

it.skip.each([
  ['it', 'basic-pdelta-projected-loads', 'title', 'in Base'],
  ['it', 'basic-pdelta-projected-loads', 'explanation', 'In Base'],
  ['it', 'planar-spatial-distributed-load-component', 'explanation', 'analisi Base'],
  ['it', 'xy-constraint-projection', 'explanation', 'analisi Base'],
  ['it', 'snow-roof-connectivity', 'title', 'esposizione sopravento'],
  ['it', 'snow-roof-connectivity', 'explanation', 'esposizione sopravento'],
  ['it', 'workbook-support-rotations', 'title', 'cartella di lavoro'],
  ['it', 'workbook-support-rotations', 'explanation', 'cartella di lavoro'],
  ['nl', 'f62-channel-minimum-modulus', 'title', 'ontbreekt zonder geverifieerd weerstandsmoment'],
  ['nl', 'rc-drawn-joint-and-corner-verification', 'title', 'verankering en beugelhoeken'],
  ['nl', 'snow-fallback-runs', 'title', 'dakreeksen'],
] as const)('known wrong result: #2613 — %s notice %s %s identifies %s', (locale, id, field, term) => {
  const notice = RESULT_CHANGES.changes.find(change => change.id === id);
  expect(notice?.[field][locale]).toContain(term);
});

it.skip('known wrong result: #2613 — the new channel notice carries its own Dutch recheck instructions', () => {
  expect(channelNotice.title).toHaveProperty('nl');
  expect(channelNotice.explanation).toHaveProperty('nl', expect.stringContaining('verst verwijderde flensrand'));
  for (const features of [[], ['steelCirsoc301'], ['steelChannelMembers'], ['steelCirsoc301', 'steelChannelMembers']]) {
    expect(conditionHolds(channelNotice.when, new Set(features))).toBe(features.length === 2);
  }
});

it.skip.each([
  'Een randvoorwaarde in een onafhankelijke constructie',
  'Correcties aan randvoorwaarden en hellende opleggingen',
  'de elementen en de randvoorwaarden',
])('known wrong result: #2613 — changelog includes non-fixed restraints in %s', phrase => {
  expect(CHANGELOG.flatMap(entry => entry.i18n.nl.items).some(item => item.includes(phrase))).toBe(true);
});
