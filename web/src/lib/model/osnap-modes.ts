/** The kinds of object snap (`osnap.ts`), apart so the UI store can name them without the drawing code. */
export const OSNAP_MODES = ['endpoint', 'midpoint', 'center', 'quadrant', 'intersection', 'perpendicular', 'nearest'] as const;
export type OsnapMode = (typeof OSNAP_MODES)[number];
export const DEFAULT_OSNAP: readonly OsnapMode[] = ['endpoint', 'midpoint', 'center', 'quadrant', 'intersection'];
