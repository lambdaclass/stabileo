export const MAIN_TOOL_IDS = ['simply-supported-beam', 'cantilever-beam', 'column-buckling', 'continuous-beam', 'portal-frame', 'truss-2d', 'influence-line', 'beam-natural-frequency'] as const;
export const EXAMPLE_IDS = ['beam-frame', 'slab-on-columns', 'earthquake-frame', 'rc-column', 'outrigger', 'tower'] as const;
export const EXAMPLE_PATHS = ['/examples', ...EXAMPLE_IDS.map(id => `/examples/${id}`)];
