import { featuresForMode, unitFeatureProfile } from '../../config/public-features.mjs';

Object.assign(globalThis, { __PUBLIC_FEATURES__: featuresForMode(unitFeatureProfile()) });
