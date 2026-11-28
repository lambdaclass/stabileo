export type PanelSide = 'left' | 'right';

const KEY = 'stabileo-panel-side';
const WIDTH_KEY = 'stabileo-panel-width';
const OPEN_KEY = 'stabileo-panel-open';
export const DEFAULT_PANEL_WIDTH = 540;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private window */ }
}

function storedWidth(): number {
  const v = Number(read(WIDTH_KEY));
  return Number.isFinite(v) && v >= 240 && v <= 1200 ? v : DEFAULT_PANEL_WIDTH;
}

let side = $state<PanelSide>(read(KEY) === 'right' ? 'right' : 'left');
let width = $state(storedWidth());

export const shellLayout = {
  get panelSide(): PanelSide { return side; },
  set panelSide(v: PanelSide) {
    side = v;
    write(KEY, v);
    if (typeof window !== 'undefined') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  },
  toggle(): void {
    this.panelSide = side === 'left' ? 'right' : 'left';
  },
  /** One width for the docked panel in every mode; set while dragging, kept with `rememberWidth`. */
  get panelWidth(): number { return width; },
  set panelWidth(v: number) { width = v; },
  rememberWidth(): void { write(WIDTH_KEY, String(Math.round(width))); },
  get panelOpenAtStart(): boolean { return read(OPEN_KEY) !== 'closed'; },
  rememberPanelOpen(open: boolean): void { write(OPEN_KEY, open ? 'open' : 'closed'); },
};
