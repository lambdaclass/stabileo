import { BUILD_FEATURES } from './build-features';

export const LANDING_NAV = [
  ['basic', 'Product', '/en/#basic'],
  ...(BUILD_FEATURES.tools ? [] : [['examples', 'Examples', '/en/examples/']]),
  ['tools', 'Tools', '/en/tools/'],
  ...(BUILD_FEATURES.diagramGame ? [['game', 'Game', '/en/diagram-game/']] : []),
  ['research', 'Research', '/en/research/'],
  ['pricing', 'Pricing', '/en/#pricing'],
  ['blog', 'Blog', '/en/blog/'],
];
