import { readFileSync } from 'node:fs';
import { buildFeatures, validateFeatures } from '../config/public-features.mjs';

export { buildFeatures as buildPublicFeatures };

export function e2eBuildFeatures(prebuilt = process.env.E2E_PREBUILT === '1', artifact = new URL('../dist/e2e-features.json', import.meta.url)) {
  if (!prebuilt) return buildFeatures();
  return validateFeatures(JSON.parse(readFileSync(artifact, 'utf8')), 'E2E build features');
}
