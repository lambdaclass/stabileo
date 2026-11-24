import { e2eBuildFeatures } from '../scripts/build-public-features';
import { readProfileResultChanges } from '../scripts/result-change-metadata.mjs';

export default function globalSetup(): void {
  process.env.E2E_RESULTS_VERSION ??= String(readProfileResultChanges(e2eBuildFeatures().proPlatesUnified).currentResultsVersion);
}
