export const GENERATED_BUILDING_FILES = {
  'pro-rc-house': () => import('./pro-rc-house.stabileo.txt?raw'),
  'pro-rc-four-storey': () => import('./pro-rc-four-storey.stabileo.txt?raw'),
  'pro-rc-steel-columns': () => import('./pro-rc-steel-columns.stabileo.txt?raw'),
  'pro-rc-lift-core': () => import('./pro-rc-lift-core.stabileo.txt?raw'),
  'pro-rc-party-wall': () => import('./pro-rc-party-wall.stabileo.txt?raw'),
  'pro-steel-building-slabs': () => import('./pro-steel-building-slabs-generated.stabileo.txt?raw'),
} as const;
