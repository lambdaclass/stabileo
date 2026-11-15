import { afterEach, expect, it, vi } from 'vitest';
import { publicPaths, POST_LASTMOD } from '../public-paths';
import reviews from '../../../research/tools/batches/VALIDATION.json';
import { TOOLS, toolLastmod } from '../../src/components/tools/registry';

afterEach(() => { vi.unstubAllEnvs(); });

it.skipIf(process.env.RUN_KNOWN_WRONG !== '1').each([undefined, '0', '1'])('known wrong result: #2099 — Tools index dates only the built offering with tools=%s', async tools => {
  vi.stubEnv('VITE_TOOLS', tools);
  await publicPaths();
  const expected = tools === '1'
    ? TOOLS.map(tool => toolLastmod(tool, reviews.batches)).sort().at(-1)
    : reviews.batches.filter(batch => ['tools-batch-1', 'tools-batch-2'].includes(batch.id)).flatMap(batch => batch.reviews.map(review => review.date)).sort().at(-1);
  expect(POST_LASTMOD.get('/tools')).toBe(expected);
});
