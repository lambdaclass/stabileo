import { e2eBuildFeatures } from '../scripts/build-public-features';

export const BUILD_FEATURES = e2eBuildFeatures();
export const TOOLS_SKIP_REASON = 'This build lacks the optional tools; enable it in web/config/features.json';
export const RESEARCH_SKIP_REASON = 'This build lacks the optional research languages; enable it in web/config/features.json';
export const ACCOUNTS_SKIP_REASON = 'This build lacks accounts; enable it in web/config/features.json';
export const GAME_SKIP_REASON = 'This build lacks the diagram game; enable it in web/config/features.json';
