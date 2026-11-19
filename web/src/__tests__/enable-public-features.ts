import { featuresForMode } from '../../config/public-features.mjs';

Object.assign(globalThis, { __PUBLIC_FEATURES__: featuresForMode('test') });
