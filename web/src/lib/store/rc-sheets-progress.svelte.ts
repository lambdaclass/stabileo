/** How far the sheets' design has got, for the card at the viewer's foot; apart, so the card imports none of the sheets. */
export interface SheetProgress { phase: 'demands' | 'design'; done: number; total: number }

export const sheetsProgress = $state<{ now: SheetProgress | null }>({ now: null });
