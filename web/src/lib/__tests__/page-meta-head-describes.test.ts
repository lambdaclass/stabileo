import { describe, it, expect } from 'vitest';
import { headDescribes } from '../page-meta';

const LANDING_HEAD = [
  'https://stabileo.com/en/',
  'https://stabileo.com/es/',
  'https://stabileo.com/pt/',
  'https://stabileo.com/de/',
  'https://stabileo.com/fr/',
  'https://stabileo.com/tr/',
  'https://stabileo.com/',
];

describe('headDescribes', () => {
  it('the landing head served by the fallback does not describe a post', () => {
    expect(headDescribes(LANDING_HEAD, '/es/blog/the-determinism-boundary')).toBe(false);
    expect(headDescribes(LANDING_HEAD, '/es/blog/the-determinism-boundary/')).toBe(false);
    expect(headDescribes(LANDING_HEAD, '/en/tools/cantilever-beam/')).toBe(false);
  });

  it('a prerendered post head describes its own address, with or without the trailing slash', () => {
    const post = ['https://stabileo.com/es/blog/the-determinism-boundary/', 'https://stabileo.com/en/blog/the-determinism-boundary/'];
    expect(headDescribes(post, '/es/blog/the-determinism-boundary/')).toBe(true);
    expect(headDescribes(post, '/es/blog/the-determinism-boundary')).toBe(true);
  });

  it('a head that names another post, or nothing, does not describe this one', () => {
    expect(headDescribes(['https://stabileo.com/es/blog/another-post/'], '/es/blog/the-determinism-boundary/')).toBe(false);
    expect(headDescribes([], '/es/blog/the-determinism-boundary/')).toBe(false);
    expect(headDescribes([''], '/es/blog/the-determinism-boundary/')).toBe(false);
  });

  it('the root address is described by a head that names it', () => {
    expect(headDescribes(LANDING_HEAD, '/')).toBe(true);
  });
});
