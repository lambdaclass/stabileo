import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { buildFeatures, featuresForMode, validateFeatures } from '../config/public-features.mjs';

export function buildPublicFeatures() {
  const profile = process.env.STABILEO_E2E_PROFILE;
  return process.env.VITE_E2E === '1' && profile ? featuresForMode(profile) : buildFeatures();
}

export function e2eBuildFeatures(prebuilt = process.env.E2E_PREBUILT === '1', artifact = new URL('../dist/e2e-features.json', import.meta.url)) {
  const profile = process.env.STABILEO_E2E_PROFILE;
  if (!prebuilt) return profile ? featuresForMode(profile) : buildFeatures();
  const features = validateFeatures(JSON.parse(readFileSync(artifact, 'utf8')), 'E2E build features');
  if (profile && !isDeepStrictEqual(features, featuresForMode(profile))) {
    throw new Error(`E2E build features do not match the ${profile} profile. Rebuild the E2E site for that profile.`);
  }
  return features;
}
