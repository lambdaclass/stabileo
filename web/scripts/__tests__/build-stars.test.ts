import { describe, it, expect, vi } from 'vitest';
import { buildStarCount, GITHUB_REPO_API } from '../build-stars';

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('one GitHub star count per prerender', () => {
  it('a pinned count is used without asking GitHub', async () => {
    const fetchImpl = answer(200, { stargazers_count: 7 });
    expect(await buildStarCount({ PRERENDER_GITHUB_STARS: '1234' }, fetchImpl)).toBe(1234);
    expect(await buildStarCount({ PRERENDER_GITHUB_STARS: 'none' }, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a malformed pin is refused rather than read as no count', async () => {
    await expect(buildStarCount({ PRERENDER_GITHUB_STARS: '12k' }, answer(200, {}))).rejects.toThrow(/PRERENDER_GITHUB_STARS/);
  });

  it('without a pin it asks GitHub once and reads stargazers_count', async () => {
    const fetchImpl = answer(200, { stargazers_count: 321 });
    expect(await buildStarCount({}, fetchImpl)).toBe(321);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(GITHUB_REPO_API);
  });

  it('a rate limit, a network error or a missing count gives no count', async () => {
    expect(await buildStarCount({}, answer(403, { message: 'rate limit' }))).toBeNull();
    expect(await buildStarCount({}, answer(200, { stargazers_count: 'many' }))).toBeNull();
    expect(await buildStarCount({}, vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).toBeNull();
  });
});
