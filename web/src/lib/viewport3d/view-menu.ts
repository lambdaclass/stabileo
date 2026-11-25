/**
 * How Basic's view menu offers the bars: as lines or with their sections. The thick lines and the
 * physical geometry stay in the settings, and a model shown in either reads as the choice it is
 * closest to.
 */
export type RenderMode3D = 'wireframe' | 'solid' | 'sections' | 'physical';
export type BasicBarStyle = 'lines' | 'sections';

export const BASIC_BAR_STYLES: ReadonlyArray<{ style: BasicBarStyle; mode: RenderMode3D; label: string; hint: string }> = [
  { style: 'lines', mode: 'wireframe', label: 'viewMenu.lines', hint: 'viewMenu.linesHint' },
  { style: 'sections', mode: 'sections', label: 'viewMenu.sections', hint: 'viewMenu.sectionsHint' },
];

export const basicBarStyle = (m: RenderMode3D): BasicBarStyle => (m === 'wireframe' || m === 'solid' ? 'lines' : 'sections');
