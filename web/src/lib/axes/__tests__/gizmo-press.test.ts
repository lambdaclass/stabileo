import { describe, expect, it } from 'vitest';
import { forgetGizmoPress, pressOnGizmo, releaseOnGizmo } from '../gizmo-press';

const box = (left: number, top: number) => ({ getBoundingClientRect: () => ({ left, top, right: left + 40, bottom: top + 40, width: 40, height: 40 }) }) as unknown as Element;
const ev = (x: number, y: number, button = 0) => ({ clientX: x, clientY: y, button }) as MouseEvent;

describe('a press on the axes gizmo', () => {
  it('is a click when released close to where it started, and a drag otherwise', () => {
    const g = box(0, 0);
    expect(pressOnGizmo(ev(10, 10), g)).toBe(true);
    expect(releaseOnGizmo(ev(12, 11), g)).toBe('click');
    expect(pressOnGizmo(ev(10, 10), g)).toBe(true);
    expect(releaseOnGizmo(ev(60, 10), g)).toBe('drag');
  });

  it('counts only on the viewport whose gizmo it landed on, and is forgotten when that viewport loses it', () => {
    const a = box(0, 0), b = box(500, 0);
    pressOnGizmo(ev(10, 10), a);
    expect(releaseOnGizmo(ev(10, 10), b)).toBe('none');
    forgetGizmoPress(a);
    expect(releaseOnGizmo(ev(10, 10), a)).toBe('none');
  });
});
