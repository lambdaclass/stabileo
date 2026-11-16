import { expect, it } from 'vitest';
import change from '../result-changes/moving-loads-3d.json';

it.skip('known wrong result: #2099 — Hungarian moving loads describe the component along the member axis', () => {
  for (const text of [change.title.hu, change.explanation.hu]) {
    expect(text).toContain('a rúd hossztengelye irányú összetevő');
    expect(text).not.toContain('normálirányú');
  }
  expect(change.explanation.hu).toContain('SA-2026-051');
  expect(change.explanation.hu).toContain('Futtassa újra');
});
