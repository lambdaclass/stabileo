import { readRegistry } from '../scripts/result-changes/registry.mjs';

export default function globalSetup(): void {
  process.env.E2E_RESULTS_VERSION ??= String(readRegistry().currentResultsVersion);
}
