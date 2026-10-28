/**
 * What the legacy-projects corpus records (#718), shared by `generate.mjs`.
 */

/**
 * 3D examples opened in PRO rather than in Basic 3D: the PRO catalogue's fixtures
 * (`lib/data/pro-examples.ts`) and the shell, design and foundation examples only PRO solves.
 */
export const PRO_EXAMPLES = new Set([
  'rc-qa-diagnostic', '3d-building', 'pro-edificio-7p', 'rc-design-frame', 'torre-irregular-con-retiros',
  'cad-arch-structure-dxf', 'cad-arch-only-dxf', 'pipe-rack', '3d-nave-industrial', 'offshore-platform',
  'xl-diagrid-tower', 'cable-stayed-bridge', 'geodesic-dome', 'full-stadium', 'suspension-bridge',
  'mat-foundation', 'la-bombonera',
  'deep-beam-shell', 'rc-qa-diagnostic-shells', 'rc-beam-flexure', 'rc-design-qa-8', 'rc-design-qa-row2',
  'rc-design-qa-seismic',
]);

/** The workspace an example is saved from: 2D examples in Basic 2D, 3D ones in PRO or Basic 3D. */
export function workspaceOf(id, is2D) {
  if (is2D) return '2d';
  return PRO_EXAMPLES.has(id) ? 'pro' : '3d';
}

/**
 * Members + shells above which an example is saved but not solved: the showcase models (stadiums,
 * towers, bridges, CAD imports, the 408-member frame) would make the results megabytes and the
 * test minutes. Their files are still opened and migrated by the test.
 */
export const SOLVE_LIMIT = 300;

/** Files larger than this are committed gzipped (the bytes inside are the version's own). */
export const GZIP_ABOVE = 64 * 1024;

/** The tabs of each version's session file: one per workspace. */
export const SESSION_TABS = [
  { id: 'simply-supported', workspace: '2d' },
  { id: '3d-portal-frame', workspace: '3d' },
  { id: 'rc-design-qa-8', workspace: 'pro' },
];
