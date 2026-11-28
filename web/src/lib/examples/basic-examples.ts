import { uiStore, modelStore, resultsStore } from '../store';

export interface BasicExample { id: string; nameKey: string; descKey: string }

export const EXAMPLES_2D: readonly BasicExample[] = [
  { id: 'simply-supported', nameKey: 'ex.simply-supported', descKey: 'ex.simply-supported.desc' },
  { id: 'cantilever', nameKey: 'ex.cantilever', descKey: 'ex.cantilever.desc' },
  { id: 'cantilever-point', nameKey: 'ex.cantilever-point', descKey: 'ex.cantilever-point.desc' },
  { id: 'point-loads', nameKey: 'ex.point-loads', descKey: 'ex.point-loads.desc' },
  { id: 'gerber-beam', nameKey: 'ex.gerber-beam', descKey: 'ex.gerber-beam.desc' },
  { id: 'continuous-beam', nameKey: 'ex.continuous-beam', descKey: 'ex.continuous-beam.desc' },
  { id: 'spring-support', nameKey: 'ex.spring-support', descKey: 'ex.spring-support.desc' },
  { id: 'settlement', nameKey: 'ex.settlement', descKey: 'ex.settlement.desc' },
  { id: 'thermal', nameKey: 'ex.thermal', descKey: 'ex.thermal.desc' },
  { id: 'truss', nameKey: 'ex.truss', descKey: 'ex.truss.desc' },
  { id: 'warren-truss', nameKey: 'ex.warren-truss', descKey: 'ex.warren-truss.desc' },
  { id: 'howe-truss', nameKey: 'ex.howe-truss', descKey: 'ex.howe-truss.desc' },
  { id: 'three-hinge-arch', nameKey: 'ex.three-hinge-arch', descKey: 'ex.three-hinge-arch.desc' },
  { id: 'portal-frame', nameKey: 'ex.portal-frame', descKey: 'ex.portal-frame.desc' },
  { id: 'two-story-frame', nameKey: 'ex.two-story-frame', descKey: 'ex.two-story-frame.desc' },
  { id: 'bridge-moving-load', nameKey: 'ex.bridge-moving-load', descKey: 'ex.bridge-moving-load.desc' },
  { id: 'frame-cirsoc-dl', nameKey: 'ex.frame-cirsoc-dl', descKey: 'ex.frame-cirsoc-dl.desc' },
  { id: 'building-3story-dlw', nameKey: 'ex.building-3story-dlw', descKey: 'ex.building-3story-dlw.desc' },
  { id: 'frame-seismic', nameKey: 'ex.frame-seismic', descKey: 'ex.frame-seismic.desc' },
];

export const EXAMPLES_3D: readonly BasicExample[] = [
  { id: '3d-cantilever-load', nameKey: 'ex.3d-cantilever-load', descKey: 'ex.3d-cantilever-load.desc' },
  { id: '3d-torsion-beam', nameKey: 'ex.3d-torsion-beam', descKey: 'ex.3d-torsion-beam.desc' },
  { id: 'hinged-arch-3d', nameKey: 'ex.hingedArch3D', descKey: 'ex.hingedArch3D.desc' },
  { id: '3d-portal-frame', nameKey: 'ex.3d-portal-frame', descKey: 'ex.3d-portal-frame.desc' },
  { id: 'grid-beams', nameKey: 'ex.gridBeams', descKey: 'ex.gridBeams.desc' },
  { id: '3d-space-truss', nameKey: 'ex.3d-space-truss', descKey: 'ex.3d-space-truss.desc' },
  { id: 'space-frame', nameKey: 'ex.spaceFrame3D', descKey: 'ex.spaceFrame3D.desc' },
  { id: 'tower-3d-2', nameKey: 'ex.tower3D_2', descKey: 'ex.tower3D_2.desc' },
  { id: 'tower-3d-4', nameKey: 'ex.tower3D_4', descKey: 'ex.tower3D_4.desc' },
  { id: '3d-nave-industrial', nameKey: 'ex.3d-nave-industrial', descKey: 'ex.3d-nave-industrial.desc' },
];

export async function loadBasicExample(id: string, to3D: boolean): Promise<void> {
  const want = to3D ? '3d' : '2d';
  if (uiStore.analysisMode !== want) uiStore.analysisMode = want;
  await modelStore.loadExample(id);
  if (to3D) uiStore.showNodeLabels3D = false;
  resultsStore.clear();
  resultsStore.forgetView();
  resultsStore.clear3D();
  setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 50);
}

/** On a phone the panel is a sheet over the model: get it out of the way of what just loaded. */
export function clearPhoneSheet(): void {
  if (!uiStore.isMobile) return;
  if (uiStore.appMode === 'pro') uiStore.rightDrawerOpen = false;
  else window.dispatchEvent(new CustomEvent('stabileo-open-panel', { detail: null }));
}
