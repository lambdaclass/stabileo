import { buildPublicLocales } from '../src/lib/i18n/offered-research';
import { e2eBuildFeatures } from '../scripts/build-public-features';

export const BUILD_FEATURES = e2eBuildFeatures();
export const BUILD_PUBLIC_LOCALES = buildPublicLocales(BUILD_FEATURES.research);
export const BUILD_OFFERED_LOCALES = ['es', ...BUILD_PUBLIC_LOCALES.filter(locale => locale !== 'es')] as const;
export const TOOLS_SKIP_REASON = 'This build lacks the optional tools; enable it in web/config/features.json';
export const RESEARCH_SKIP_REASON = 'This build lacks the optional research languages; enable it in web/config/features.json';
export const ACCOUNTS_SKIP_REASON = 'This build lacks accounts; enable it in web/config/features.json';
export const GAME_SKIP_REASON = 'This build lacks the diagram game; enable it in web/config/features.json';
