import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildStamp } from '../../../../scripts/build-stamp.mjs';

const WEB_ROOT = resolve(__dirname, '../../../..');

export const SHARED_PLAIN_BUILD = 'STABILEO_SHARED_BUILD';
export const SHARED_PRERENDERED_BUILD = 'STABILEO_SHARED_PRERENDERED_BUILD';

/** The build `make test.web.build` made of this exact tree, or null when the variable is unset.
 * Throws when the build is missing or was made from different sources, so a stale dist never passes. */
export function sharedBuild(variable: string): string | null {
  const name = process.env[variable];
  if (!name) return null;
  const dir = resolve(WEB_ROOT, name);
  const stampFile = `${dir}.source-stamp`;
  if (!existsSync(dir) || !existsSync(stampFile)) throw new Error(`${variable}=${name}: no build or no source stamp at ${dir}`);
  const recorded = readFileSync(stampFile, 'utf8').trim();
  const current = buildStamp();
  if (recorded !== current) throw new Error(`${variable}=${name} was built from other sources (stamp ${recorded}, tree ${current})`);
  return dir;
}
