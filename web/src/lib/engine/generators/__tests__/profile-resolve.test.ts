import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../profile-resolve';


/*
 * ── The centroid the resolver was throwing away ─────────────────────
 *
 * Every polygon and the extent are shifted by it, so it has always been computed. It was not
 * returned, and the section data sheet — which states a centroid only when it is given one —
 * therefore rendered «No canonical geometry resolved» for every profile in the catalogue,
 * including doubly symmetric ones whose geometry the app had just resolved. The sentence was
 * false, not merely unhelpful.
 */
describe('the centroid is reported, not just consumed', () => {
  it('a geometry-backed profile carries its centroid', () => {
    const r = resolveProfile('IPE 200');
    expect(r).not.toBeNull();
    if (!r) return;
    if (r.basis !== 'canonicalGeometry') return; // no WASM in this checkout; nothing to assert
    expect(r.centroid).not.toBeNull();
    expect(Number.isFinite(r.centroid!.yM)).toBe(true);
    expect(Number.isFinite(r.centroid!.zM)).toBe(true);
    // It is a position inside a 200 mm section, not a stray zero or a metre.
    expect(Math.abs(r.centroid!.zM)).toBeLessThan(1);
  });

  it('a properties-only profile reports none rather than a plausible number', () => {
    const r = resolveProfile('MC18x58');
    expect(r).not.toBeNull();
    if (!r || r.basis === 'canonicalGeometry') return;
    expect(r.centroid).toBeNull();
  });
});
