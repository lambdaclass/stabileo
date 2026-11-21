import committedConfig from './features.json' with { type: 'json' };

const modes = ['production', 'development', 'test'];
const keys = ['accounts', 'research', 'tools', 'diagramGame', 'globalAxes'];

function validateKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Unknown key ${label}.${key}`);
  }
}

export function validateFeatures(value, label) {
  validateKeys(value, keys, label);
  for (const key of keys) {
    if (!Object.hasOwn(value, key) || typeof value[key] !== 'boolean') {
      throw new Error(`${label}.${key} must be a boolean`);
    }
  }
  return value;
}

export function featuresForMode(mode, config = committedConfig) {
  if (!modes.includes(mode)) throw new Error(`Unsupported features.json environment: ${mode}`);
  validateKeys(config, modes, 'features.json');
  for (const environment of modes) validateFeatures(config[environment], `features.json.${environment}`);
  return config[mode];
}

export function buildFeatures() {
  if (typeof __PUBLIC_FEATURES_COMPILED__ !== 'undefined' || typeof __PUBLIC_FEATURES__ !== 'undefined') return __PUBLIC_FEATURES__;
  return featuresForMode('production');
}

export function featureDefines(features, inline = true) {
  const defines = { __PUBLIC_FEATURES__: JSON.stringify(features) };
  if (inline) {
    defines.__PUBLIC_FEATURES_COMPILED__ = 'true';
    for (const [key, enabled] of Object.entries(features)) defines[`__PUBLIC_FEATURES__.${key}`] = JSON.stringify(enabled);
  }
  return defines;
}

export function unitFeatureProfile() {
  return process.env.STABILEO_UNIT_PROFILE || 'test';
}
