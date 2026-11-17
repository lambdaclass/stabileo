/** How far the sheets' design has got, for the card at the viewer's foot; apart, so the card imports none of the sheets. */
export interface SheetProgress { phase: 'demands' | 'design'; done: number; total: number }

export const sheetsProgress = $state<{ now: SheetProgress | null }>({ now: null });

export function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return new Promise((r) => setTimeout(r, 0));
  return new Promise((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 50);
  });
}
