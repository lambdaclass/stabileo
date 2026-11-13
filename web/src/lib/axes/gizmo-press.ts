// The gizmo the press landed on: a release counts only on that same gizmo's viewport.
let press: { x: number; y: number; el: Element } | null = null;

const inside = (el: Element | null | undefined, x: number, y: number): boolean => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};

export function pressOnGizmo(e: MouseEvent, el: Element | null | undefined): boolean {
  press = e.button === 0 && el && inside(el, e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY, el } : null;
  return press !== null;
}

export function releaseOnGizmo(e: MouseEvent, el: Element | null | undefined): 'none' | 'click' | 'drag' {
  const p = press;
  if (p && p.el !== el) return 'none';
  press = null;
  if (!p) return 'none';
  return Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 4 ? 'click' : 'drag';
}

/** A press the viewport lost (the pointer left it, or it unmounted) is forgotten. */
export function forgetGizmoPress(el: Element | null | undefined): void {
  if (press && press.el === el) press = null;
}
