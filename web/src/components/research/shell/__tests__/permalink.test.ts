import { describe, expect, it } from 'vitest';
import { permalinkUrl, pickSnapshot, siteOrigin, type SnapshotEntry } from '../permalink';

const page = '/research/fracture/shauer-2025';
const entries: SnapshotEntry[] = [
  { short: 'ccccccc', commit: 'ccccccc' + '0'.repeat(33), date: '2026-11-03T10:00:00Z', url: '/@ccccccc/', research: ['/research/metamaterials/grossman-2026'] },
  { short: 'bbbbbbb', commit: 'bbbbbbb' + '0'.repeat(33), date: '2026-11-02T10:00:00Z', url: '/@bbbbbbb/', research: [page] },
  { short: 'aaaaaaa', commit: 'aaaaaaa' + '0'.repeat(33), date: '2026-11-01T10:00:00Z', url: '/@aaaaaaa/', research: [page] },
];

describe('research permanent links', () => {
  it('cites this build when the index has its snapshot', () => {
    expect(pickSnapshot(entries, page, 'aaaaaaa00000', null)).toEqual({ snapshot: entries[2], current: true });
  });

  it('otherwise the newest snapshot that holds the page, never one without it', () => {
    expect(pickSnapshot(entries, page, 'ddddddd00000', null)).toEqual({ snapshot: entries[1], current: false });
    expect(pickSnapshot(entries, '/research/optimization/x', 'ddddddd00000', null)).toBeNull();
    expect(pickSnapshot([], page, 'ddddddd00000', null)).toBeNull();
  });

  it('inside a snapshot, cites that snapshot itself', () => {
    const p = pickSnapshot([], `${page}/`, 'eeeeeee11111', '/@eeeeeee/');
    expect(p?.current).toBe(true);
    expect(p?.snapshot.url).toBe('/@eeeeeee/');
  });

  it('builds the link on this site, or stabileo.com from a development machine', () => {
    expect(permalinkUrl(entries[1], page, 'es', 'https://staging.stabileo.com')).toBe('https://staging.stabileo.com/@bbbbbbb/es/research/fracture/shauer-2025/');
    expect(siteOrigin('http://localhost:4000')).toBe('https://stabileo.com');
    expect(siteOrigin('https://staging.stabileo.com')).toBe('https://staging.stabileo.com');
  });
});

it('selects the newest snapshot of the requested version, never a different version', () => {
  const matching = { ...entries[1], experimentVersions: { 'shauer-2025': { version: 2, date: '2026-01-01', commit: null } } };
  const newer = { ...matching, date: '2027-01-01', short: 'ddddddd' };
  expect(pickSnapshot([matching, newer], page, 'dev', null, 2)?.snapshot).toBe(newer);
  expect(pickSnapshot([matching], page, 'dev', null, 3)).toBeNull();
  expect(pickSnapshot(entries, page, 'dev', null, 2)).toBeNull();
});
