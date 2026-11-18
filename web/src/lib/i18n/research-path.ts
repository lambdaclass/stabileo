export const RESEARCH_GALLERY = '/research';

export function isResearchRoute(path: string): boolean {
  return path === RESEARCH_GALLERY || path.startsWith(`${RESEARCH_GALLERY}/`);
}
