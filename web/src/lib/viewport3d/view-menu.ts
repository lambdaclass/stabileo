export type RenderMode3D = 'wireframe' | 'solid' | 'sections';
export type BarStyle = 'lines' | 'sections';

export const BAR_STYLES: ReadonlyArray<{ style: BarStyle; mode: RenderMode3D; label: string; hint: string }> = [
  { style: 'lines', mode: 'wireframe', label: 'viewMenu.lines', hint: 'viewMenu.linesHint' },
  { style: 'sections', mode: 'sections', label: 'viewMenu.sections', hint: 'viewMenu.sectionsHint' },
];

export const barStyle = (m: RenderMode3D): BarStyle => (m === 'sections' ? 'sections' : 'lines');
