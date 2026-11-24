const presses = new WeakMap<Element, { x: number; y: number }>();

export function pressOnGizmo(e: MouseEvent, el: Element | null | undefined): boolean {
  if (!el) return false;
  presses.delete(el);
  const r = el.getBoundingClientRect();
  if (e.button !== 0 || r.width <= 0 || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false;
  presses.set(el, { x: e.clientX, y: e.clientY });
  return true;
}

export function releaseOnGizmo(e: MouseEvent, el: Element | null | undefined): 'none' | 'click' | 'drag' {
  if (!el) return 'none';
  const p = presses.get(el);
  presses.delete(el);
  if (!p) return 'none';
  return Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 4 ? 'click' : 'drag';
}

export function forgetGizmoPress(el: Element | null | undefined): void {
  if (el) presses.delete(el);
}
