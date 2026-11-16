import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function buildPublicFeatures(environment: Record<string, string | undefined> = { ...loadEnv(process.env.NODE_ENV ?? 'production', root, 'VITE_'), ...process.env }) {
  return { research: environment.VITE_RESEARCH === '1', tools: environment.VITE_TOOLS === '1', diagramGame: environment.VITE_DIAGRAM_GAME === '1', accounts: environment.VITE_ACCOUNTS === '1' };
}

export function e2eBuildFeatures(prebuilt = process.env.E2E_PREBUILT === '1', artifact = new URL('../dist/e2e-features.json', import.meta.url)) {
  if (!prebuilt) return buildPublicFeatures();
  const environment = JSON.parse(readFileSync(artifact, 'utf8'));
  for (const key of ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME']) {
    if (!['0', '1'].includes(environment[key])) throw new Error(`Invalid E2E build switch ${key}`);
  }
  return buildPublicFeatures(environment);
}
