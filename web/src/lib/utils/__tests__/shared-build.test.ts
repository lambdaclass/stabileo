import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStamp, envStamp } from '../../../../scripts/build-stamp.mjs';
import { sharedBuild } from './shared-build';

const VARIABLE = 'STABILEO_SHARED_BUILD_UNDER_TEST';
const root = mkdtempSync(join(tmpdir(), 'shared-build-'));
const dir = join(root, 'dist');
mkdirSync(dir);

afterEach(() => {
  delete process.env[VARIABLE];
});

it('is null when no shared build is named, so the test builds its own', () => {
  expect(sharedBuild(VARIABLE)).toBeNull();
});

it('returns a build stamped from this exact tree', () => {
  writeFileSync(`${dir}.source-stamp`, `${buildStamp()}\n`);
  process.env[VARIABLE] = dir;
  expect(sharedBuild(VARIABLE)).toBe(dir);
});

it('refuses a build made from other sources instead of testing it', () => {
  writeFileSync(`${dir}.source-stamp`, `${'0'.repeat(64)}\n`);
  process.env[VARIABLE] = dir;
  expect(() => sharedBuild(VARIABLE)).toThrow(/built from other sources/);
});

it('refuses a named build that is missing or has no stamp', () => {
  rmSync(`${dir}.source-stamp`, { force: true });
  process.env[VARIABLE] = dir;
  expect(() => sharedBuild(VARIABLE)).toThrow(/no build or no source stamp/);
  process.env[VARIABLE] = join(root, 'absent');
  expect(() => sharedBuild(VARIABLE)).toThrow(/no build or no source stamp/);
});

it('changes the stamp when a source file, a build variable, NODE_ENV or a Vite env file changes', () => {
  const before = buildStamp({});
  expect(buildStamp({ VITE_E2E: '1' })).not.toBe(before);
  expect(buildStamp({ UNRELATED: '1' })).toBe(before);
  expect(buildStamp({ NODE_ENV: 'development' })).not.toBe(before);
  const probe = join(__dirname, `stamp-probe-${process.pid}.ts`);
  try {
    writeFileSync(probe, 'export {};\n');
    expect(buildStamp({})).not.toBe(before);
  } finally {
    rmSync(probe, { force: true });
  }
  expect(buildStamp({})).toBe(before);
  const envFile = join(__dirname, `../../../../.env.stamp-probe-${process.pid}`);
  try {
    writeFileSync(envFile, 'VITE_PROBE=1\n');
    expect(buildStamp({})).not.toBe(before);
  } finally {
    rmSync(envFile, { force: true });
  }
});

it('compares the environment make recorded, not variables Vitest copied in from web/.env files', () => {
  const recorded = { STABILEO_BUILD_ENV_STAMP: envStamp({ BASE_PATH: '/' }) };
  expect(buildStamp({ ...recorded, VITE_FROM_DOTENV: '1' })).toBe(buildStamp({ BASE_PATH: '/' }));
  expect(buildStamp(recorded)).not.toBe(buildStamp({ BASE_PATH: '/x/' }));
});
