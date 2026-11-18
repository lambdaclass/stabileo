import { buildPublicLocales } from '../src/lib/i18n/offered-research';
import { BUILD_FEATURES } from './build-features';

export const BUILD_PUBLIC_LOCALES = buildPublicLocales(BUILD_FEATURES.research);
export const BUILD_OFFERED_LOCALES = ['es', ...BUILD_PUBLIC_LOCALES.filter(locale => locale !== 'es')] as const;
