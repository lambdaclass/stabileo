import { describe, it, expect } from 'vitest';
import { ElementsBatched } from '../elements-batched';

// Regression: the batched wireframe must grow its DRAWN instance count when a
// small model is replaced by a larger one (the reported 3D partial-render bug —
// "first model had N members, only N show in the bigger model").
function instCount(eb: ElementsBatched): number {
  const g = eb.mesh.geometry as unknown as { attributes: Record<string, { count?: number; data?: { count: number } }>; instanceCount?: number };
  const a = g.attributes.instanceStart;
  return a?.count ?? a?.data?.count ?? -1;
}
function drawCount(eb: ElementsBatched): number {
  return (eb.mesh.geometry as unknown as { instanceCount?: number }).instanceCount ?? -1;
}

describe('ElementsBatched grow', () => {
  it('count + drawn geometry grow from 1 → 3 segments (no first-model cap)', () => {
    const eb = new ElementsBatched();
    eb.upsert(1, 0, 0, 0, 1, 0, 0); eb.flush();
    expect(eb.count).toBe(1);
    expect(instCount(eb)).toBe(1);
    expect(drawCount(eb)).toBe(1);

    eb.upsert(2, 1, 0, 0, 2, 0, 0);
    eb.upsert(3, 2, 0, 0, 3, 0, 0);
    eb.flush();
    expect(eb.count).toBe(3);
    expect(instCount(eb)).toBe(3);
    expect(drawCount(eb)).toBe(3);     // GPU draws all 3, not just the first
  });

  it('recreates the geometry object on GROW (GPU refresh), reuses it on same-count flush', () => {
    // Root-cause fix: an in-place setPositions keeps the same geometry id, and some
    // GPU drivers then keep drawing the old (smaller) instance count after the model
    // grows. On grow we swap in a fresh geometry so the renderer re-uploads.
    const eb = new ElementsBatched();
    eb.upsert(1, 0, 0, 0, 1, 0, 0); eb.flush();
    const geo1 = eb.mesh.geometry;

    // Same count (e.g. a node drag moving an endpoint) → geometry REUSED (no churn).
    eb.upsert(1, 0, 0, 0, 2, 0, 0); eb.flush();
    expect(eb.mesh.geometry).toBe(geo1);

    // Grow (small model → bigger model) → geometry OBJECT replaced.
    eb.upsert(2, 1, 0, 0, 2, 0, 0); eb.upsert(3, 2, 0, 0, 3, 0, 0); eb.flush();
    expect(eb.mesh.geometry).not.toBe(geo1);
    expect((eb.mesh.geometry as unknown as { instanceCount?: number }).instanceCount).toBe(3);
  });

  it('clear() (model swap) then re-fill larger draws all segments', () => {
    const eb = new ElementsBatched();
    eb.upsert(1, 0, 0, 0, 1, 0, 0); eb.flush();
    expect(eb.count).toBe(1);

    eb.clear();
    for (let i = 1; i <= 6; i++) eb.upsert(i, i, 0, 0, i + 1, 0, 0);
    eb.flush();
    expect(eb.count).toBe(6);
    expect(instCount(eb)).toBe(6);
    expect(drawCount(eb)).toBe(6);
  });
});
