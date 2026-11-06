import type { Page } from 'playwright';

export const GITHUB_REPO_API = 'https://api.github.com/repos/lambdaclass/stabileo';

export async function buildStarCount(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const pinned = env.PRERENDER_GITHUB_STARS;
  if (pinned !== undefined) {
    if (pinned === 'none') return null;
    if (!/^\d+$/.test(pinned)) throw new Error(`PRERENDER_GITHUB_STARS must be a count or "none", got "${pinned}"`);
    return Number(pinned);
  }
  try {
    const res = await fetchImpl(GITHUB_REPO_API, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const stars = (await res.json())?.stargazers_count;
    return Number.isInteger(stars) && stars >= 0 ? stars : null;
  } catch {
    return null;
  }
}

export async function serveStarCount(page: Page, stars: number | null): Promise<void> {
  await page.route(GITHUB_REPO_API, (route) => route.fulfill(stars == null
    ? { status: 503, headers: { 'access-control-allow-origin': '*' }, body: '' }
    : { status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ stargazers_count: stars }) }));
}
