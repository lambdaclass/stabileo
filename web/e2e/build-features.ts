import { e2eBuildFeatures } from '../scripts/build-public-features';

export const BUILD_FEATURES = e2eBuildFeatures();
export const TOOLS_SKIP_REASON = 'This build lacks the optional tools; build with VITE_TOOLS=1';
export const RESEARCH_SKIP_REASON = 'This build lacks the optional research languages; build with VITE_RESEARCH=1';
export const ACCOUNTS_SKIP_REASON = 'This build lacks accounts; build with VITE_ACCOUNTS=1';
export const GAME_SKIP_REASON = 'This build lacks the diagram game; build with VITE_DIAGRAM_GAME=1';
