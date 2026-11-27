import { describe, expect, it } from 'vitest';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyDefaultNavigation } from '../scene-setup';

const controls = () => ({ enableDamping: true, enableRotate: true, screenSpacePanning: true }) as unknown as OrbitControls;

describe('the plan view moves with the pointer', () => {
  it('over the floor, without inertia, so it stops where the drag stops, and without orbiting', () => {
    const c = controls();
    applyDefaultNavigation(c, { leftSlides: true, plan: true });
    expect([c.enableDamping, c.enableRotate, c.screenSpacePanning]).toEqual([false, false, false]);
  });

  it('gets its inertia back when it is left', () => {
    const c = controls();
    applyDefaultNavigation(c, { leftSlides: true, plan: true });
    applyDefaultNavigation(c);
    expect([c.enableDamping, c.enableRotate, c.screenSpacePanning]).toEqual([true, true, true]);
  });
});
