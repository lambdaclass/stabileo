import { describe, it, expect } from 'vitest';
import { DEFAULT_QUERY, PAGE_SIZE, pageCount, parseQuery, toParams, toSearch, toggleSort } from '../list-query';

describe('list query in the URL', () => {
  it('parses an empty search into the defaults', () => {
    expect(parseQuery('')).toEqual(DEFAULT_QUERY);
    expect(toSearch(DEFAULT_QUERY)).toBe('');
  });

  it('round-trips every field', () => {
    const q = { search: 'ada lovelace', status: 'disabled' as const, sortBy: 'email' as const, sortDir: 'asc' as const, page: 3, user: 'u-1' };
    const search = toSearch(q);
    expect(search).toBe('?q=ada+lovelace&status=disabled&sort=email&dir=asc&page=3&user=u-1');
    expect(parseQuery(search)).toEqual(q);
  });

  it('falls back to defaults for values it does not know', () => {
    expect(parseQuery('?status=banned&sort=password&dir=up&page=-2')).toEqual(DEFAULT_QUERY);
    expect(parseQuery('?page=abc').page).toBe(1);
  });

  it('turns the page into limit and offset, 50 per page, and drops a blank search', () => {
    expect(PAGE_SIZE).toBe(50);
    expect(toParams({ ...DEFAULT_QUERY, page: 3, search: '  ' })).toEqual({
      search: undefined,
      status: 'all',
      sort_by: 'inserted_at',
      sort_dir: 'desc',
      limit: 50,
      offset: 100,
    });
  });

  it('counts pages from meta.total, never fewer than one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
    expect(pageCount(101, 50)).toBe(3);
  });

  it('flips the direction on the active column and resets to page one', () => {
    expect(toggleSort({ ...DEFAULT_QUERY, page: 4 }, 'inserted_at')).toMatchObject({ sortBy: 'inserted_at', sortDir: 'asc', page: 1 });
  });

  it('starts text columns ascending and date columns descending', () => {
    expect(toggleSort(DEFAULT_QUERY, 'name')).toMatchObject({ sortBy: 'name', sortDir: 'asc' });
    expect(toggleSort({ ...DEFAULT_QUERY, sortBy: 'email' }, 'last_sign_in_at')).toMatchObject({ sortBy: 'last_sign_in_at', sortDir: 'desc' });
  });
});
