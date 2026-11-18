import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import config from '../config/features.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '..');

export const disabledFeatures = { accounts: false, research: false, tools: false, diagramGame: false };

export async function withFeatureConfig(config, run) {
  const directory = mkdtempSync(resolve(root, 'scripts/.public-features-'));
  try {
    const configFile = resolve(directory, 'vite.config.mts');
    writeFileSync(resolve(directory, 'features.json'), JSON.stringify(config));
    writeFileSync(configFile, "import { createWebConfig } from '../../vite.config'; import features from './features.json'; export default createWebConfig(features);");
    return await run(configFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function withProductionFeatures(production, run) {
  return withFeatureConfig({ ...config, production }, run);
}
