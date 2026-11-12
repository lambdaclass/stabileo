let press: { x: number; y: number } | null = null;

const inside = (el: Element | null | undefined, x: number, y: number): boolean => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};

export function pressOnGizmo(e: MouseEvent, el: Element | null | undefined): boolean {
  press = e.button === 0 && inside(el, e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY } : null;
  return press !== null;
}

export function releaseOnGizmo(e: MouseEvent): 'none' | 'click' | 'drag' {
  const p = press;
  press = null;
  if (!p) return 'none';
  return Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 4 ? 'click' : 'drag';
}
