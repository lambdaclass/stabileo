export type PanelSide = 'left' | 'right';

const KEY = 'stabileo-panel-side';

function stored(): PanelSide {
  try {
    return localStorage.getItem(KEY) === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}

let side = $state<PanelSide>(stored());

export const shellLayout = {
  get panelSide(): PanelSide { return side; },
  set panelSide(v: PanelSide) {
    side = v;
    try { localStorage.setItem(KEY, v); } catch { /* private window */ }
    if (typeof window !== 'undefined') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  },
  toggle(): void {
    this.panelSide = side === 'left' ? 'right' : 'left';
  },
};
