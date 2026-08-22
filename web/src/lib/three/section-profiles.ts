// Section Profile Shapes for 3D Visualization
// Creates THREE.Shape objects for different section types,
// which can be extruded along element axes.

import * as THREE from 'three';
import type { Section } from '../store/model.svelte';
import { buildSectionOutline } from '../engine/generators/section-outline';
import type { BuiltUpArrangement } from '../engine/generators/built-up-section';

/**
 * Create an I/H beam shape (doubly-symmetric).
 * Profile centered at origin, strong axis along Y.
 *
 *    ┌────────b────────┐
 *    │      tf         │
 *    └──┐          ┌───┘
 *       │   tw     │
 *       │          │  h
 *       │          │
 *    ┌──┘          └───┐
 *    │      tf         │
 *    └─────────────────┘
 */
export function createIShape(h: number, b: number, tw: number, tf: number): THREE.Shape {
  const halfH = h / 2;
  const halfB = b / 2;
  const halfTw = tw / 2;

  const shape = new THREE.Shape();
  // Bottom flange (from bottom-left, counter-clockwise)
  shape.moveTo(-halfB, -halfH);
  shape.lineTo(halfB, -halfH);
  shape.lineTo(halfB, -halfH + tf);
  shape.lineTo(halfTw, -halfH + tf);
  // Web (right side up)
  shape.lineTo(halfTw, halfH - tf);
  // Top flange
  shape.lineTo(halfB, halfH - tf);
  shape.lineTo(halfB, halfH);
  shape.lineTo(-halfB, halfH);
  shape.lineTo(-halfB, halfH - tf);
  shape.lineTo(-halfTw, halfH - tf);
  // Web (left side down)
  shape.lineTo(-halfTw, -halfH + tf);
  shape.lineTo(-halfB, -halfH + tf);
  shape.closePath();

  return shape;
}

/**
 * Create a rectangular hollow section (RHS/tube).
 */
export function createRHSShape(h: number, b: number, t: number): THREE.Shape {
  const halfH = h / 2;
  const halfB = b / 2;

  const outer = new THREE.Shape();
  outer.moveTo(-halfB, -halfH);
  outer.lineTo(halfB, -halfH);
  outer.lineTo(halfB, halfH);
  outer.lineTo(-halfB, halfH);
  outer.closePath();

  // Inner cutout
  const inner = new THREE.Path();
  inner.moveTo(-halfB + t, -halfH + t);
  inner.lineTo(halfB - t, -halfH + t);
  inner.lineTo(halfB - t, halfH - t);
  inner.lineTo(-halfB + t, halfH - t);
  inner.closePath();
  outer.holes.push(inner);

  return outer;
}

/**
 * Create a circular hollow section (CHS/pipe).
 */
export function createCHSShape(r: number, t: number): THREE.Shape {
  const outer = new THREE.Shape();
  outer.absellipse(0, 0, r, r, 0, Math.PI * 2, false, 0);

  if (t > 0 && t < r) {
    const inner = new THREE.Path();
    inner.absellipse(0, 0, r - t, r - t, 0, Math.PI * 2, false, 0);
    outer.holes.push(inner);
  }

  return outer;
}

/**
 * Create a solid rectangular section.
 */
export function createRectShape(h: number, b: number): THREE.Shape {
  const halfH = h / 2;
  const halfB = b / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfB, -halfH);
  shape.lineTo(halfB, -halfH);
  shape.lineTo(halfB, halfH);
  shape.lineTo(-halfB, halfH);
  shape.closePath();
  return shape;
}

/**
 * Create a U/channel shape (open to the right).
 */
export function createUShape(h: number, b: number, tw: number, tf: number): THREE.Shape {
  const halfH = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -halfH);
  shape.lineTo(b, -halfH);
  shape.lineTo(b, -halfH + tf);
  shape.lineTo(tw, -halfH + tf);
  shape.lineTo(tw, halfH - tf);
  shape.lineTo(b, halfH - tf);
  shape.lineTo(b, halfH);
  shape.lineTo(0, halfH);
  shape.closePath();
  return shape;
}

/**
 * Lipped channel (cold-formed C): web at x=0, two flanges to +x, return lips of
 * length `c` and thickness `lipT` at the flange tips, turned back toward centre.
 */
export function createCShape(h: number, b: number, tw: number, tf: number, c: number, lipT: number): THREE.Shape {
  const halfH = h / 2;
  // Clamp so lips/flanges never overrun the section.
  const lip = Math.min(c, halfH - tf);
  // Degenerate lip guard: the outline below walks DOWN from (b, -halfH+lip) to
  // (b-lipT, -halfH+tf), so lip must exceed tf or the path reverses and
  // self-intersects (earcut then emits garbage triangles). This happens when a
  // user fills `t` as a wall thickness — its meaning on every other profile —
  // instead of the lip length this shape expects. Render a plain (unlipped)
  // channel in that case.
  if (lip <= tf || lipT <= 0) {
    const u = new THREE.Shape();
    u.moveTo(0, -halfH);
    u.lineTo(b, -halfH);
    u.lineTo(b, -halfH + tf);
    u.lineTo(tw, -halfH + tf);
    u.lineTo(tw, halfH - tf);
    u.lineTo(b, halfH - tf);
    u.lineTo(b, halfH);
    u.lineTo(0, halfH);
    u.closePath();
    return u;
  }
  const s = new THREE.Shape();
  s.moveTo(0, -halfH);              // bottom-left (web outer, bottom)
  s.lineTo(b, -halfH);             // bottom flange outer → tip
  s.lineTo(b, -halfH + lip);       // bottom lip, outer face (up by c)
  s.lineTo(b - lipT, -halfH + lip);// across lip thickness
  s.lineTo(b - lipT, -halfH + tf); // lip inner → flange inner
  s.lineTo(tw, -halfH + tf);       // bottom flange inner → web inner
  s.lineTo(tw, halfH - tf);        // web inner face (up)
  s.lineTo(b - lipT, halfH - tf);  // top flange inner
  s.lineTo(b - lipT, halfH - lip); // top lip inner
  s.lineTo(b, halfH - lip);        // across top lip thickness
  s.lineTo(b, halfH);              // top lip outer → flange tip
  s.lineTo(0, halfH);              // top flange outer → web
  s.closePath();
  return s;
}

/**
 * Create a lipped zed (Z) outline — a cold-formed section whose flanges point OPPOSITE ways.
 *
 * Same parameter meanings as `createCShape`, so a Z section stores exactly what a C does:
 * `t` is the lip LENGTH and `tl` the lip thickness. For a real cold-formed profile `tw`, `tf`
 * and `tl` are all the sheet thickness; they stay separate here only because the `Section` that
 * reaches this function carries them separately.
 *
 * ── Geometry, and where the origin sits ───────────────────────────────
 *
 * Vertically centred like every other outline in this file. Horizontally the WEB is placed at
 * `x ∈ [0, tw]`, the top flange runs to `+b` and the bottom flange to `tw − b`, which is the
 * direct analogue of `createCShape` putting its web at `x = 0`. So the outline straddles the
 * origin, as a Z does, and the web's outer face is still the reference — a Z and a C of the same
 * dimensions line up on the same face.
 *
 * ── Point symmetry is the invariant worth knowing ─────────────────────
 *
 * Every vertex has a partner at `(tw − x, −y)`. That is what makes the section a Z rather than
 * a channel drawn wrong, and `cold-formed-shapes.test.ts` asserts it over the vertex list
 * instead of eyeballing the picture.
 *
 * ── The degenerate cases, and why they are guarded ────────────────────
 *
 * The path walks along the flange undersides toward the lips, so it self-intersects — and
 * earcut then emits garbage triangles — if a lip is shorter than the sheet is thick (`c ≤ tl`)
 * or if the flange is not wider than two thicknesses (`b ≤ 2·tw`). `createCShape` guards the
 * first for the same reason; the second is specific to the zed, whose flanges are traversed in
 * both directions. Either way the honest fallback is the same section without lips.
 */
export function createZShape(h: number, b: number, tw: number, tf: number, c: number, lipT: number): THREE.Shape {
  const halfH = h / 2;
  const lip = Math.min(c, halfH - tf);
  const s = new THREE.Shape();

  if (lip <= tf || lipT <= 0 || b <= 2 * tw || lip <= lipT) {
    // Plain (unlipped) zed: web, and one flange each way.
    s.moveTo(tw - b, -halfH);
    s.lineTo(tw, -halfH);
    s.lineTo(tw, halfH - tf);
    s.lineTo(b, halfH - tf);
    s.lineTo(b, halfH);
    s.lineTo(0, halfH);
    s.lineTo(0, -halfH + tf);
    s.lineTo(tw - b, -halfH + tf);
    s.closePath();
    return s;
  }

  // Lipped. Walked as one closed loop: bottom lip → bottom flange → web (right face) → top
  // flange underside → top lip → back along the top → web (left face) → bottom flange top face.
  s.moveTo(tw - b, -halfH + lip);        // bottom lip, outer face, top
  s.lineTo(tw - b, -halfH);              // down to the bottom
  s.lineTo(tw, -halfH);                  // along the bottom flange, to the web's far face
  s.lineTo(tw, halfH - tf);              // up the web's far face
  s.lineTo(b - lipT, halfH - tf);        // top flange underside, out to the lip
  s.lineTo(b - lipT, halfH - lip);       // down the top lip's inner face
  s.lineTo(b, halfH - lip);              // across the lip thickness
  s.lineTo(b, halfH);                    // up the lip's outer face
  s.lineTo(0, halfH);                    // back along the top of the top flange
  s.lineTo(0, -halfH + tf);              // down the web's near face
  s.lineTo(tw - b + lipT, -halfH + tf);  // bottom flange top face, out to the lip
  s.lineTo(tw - b + lipT, -halfH + lip); // up the bottom lip's inner face
  s.closePath();
  return s;
}

/**
 * Create an L-angle shape.
 */
export function createLShape(h: number, b: number, t: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(b, 0);
  shape.lineTo(b, t);
  shape.lineTo(t, t);
  shape.lineTo(t, h);
  shape.lineTo(0, h);
  shape.closePath();

  // Center the shape
  const cx = b / 2;
  const cy = h / 2;
  // We need to translate. THREE.Shape doesn't support translate directly,
  // so we rebuild:
  const centered = new THREE.Shape();
  centered.moveTo(0 - cx, 0 - cy);
  centered.lineTo(b - cx, 0 - cy);
  centered.lineTo(b - cx, t - cy);
  centered.lineTo(t - cx, t - cy);
  centered.lineTo(t - cx, h - cy);
  centered.lineTo(0 - cx, h - cy);
  centered.closePath();

  return centered;
}

/**
 * Create a T-shape.
 */
export function createTShape(h: number, b: number, tw: number, tf: number): THREE.Shape {
  const halfB = b / 2;
  const halfH = h / 2;
  const halfTw = tw / 2;

  const shape = new THREE.Shape();
  // Web (bottom part)
  shape.moveTo(-halfTw, -halfH);
  shape.lineTo(halfTw, -halfH);
  shape.lineTo(halfTw, halfH - tf);
  // Top flange
  shape.lineTo(halfB, halfH - tf);
  shape.lineTo(halfB, halfH);
  shape.lineTo(-halfB, halfH);
  shape.lineTo(-halfB, halfH - tf);
  shape.lineTo(-halfTw, halfH - tf);
  shape.closePath();

  return shape;
}

/**
 * Create a THREE.Shape for the given section profile.
 * Returns null if section data is insufficient (fallback to cylinder).
 */
/**
 * Every closed outline this section is made of, for the extruded 3-D view.
 *
 * ── Why a list and not a shape ──────────────────────────────────────
 *
 * Because a built-up member is several profiles at a spacing, and `createSectionShape`
 * cannot say that: it returns one outline, chosen by `sec.shape`. A generated section carries
 * no `shape` — deliberately, so the canonical resolver cannot rebuild one part's geometry and
 * overwrite the assembly's properties — and so it fell to the `default:` branch below, which
 * says "Default to I-shape". Measured: a double-channel box chord and a back-to-back angle
 * post BOTH rendered as a fabricated 13-point I-beam.
 *
 * When `sec.composition` is present the outline comes from the SAME placement table the
 * section's own properties came from, so the picture and the numbers describe one assembly.
 * It is also the accurate outline rather than an idealised one — root radii, flange taper and
 * all — because it is the geometry engine's own polygon set.
 *
 * Falls through to the single-shape path for every section that is not a generated assembly,
 * so nothing that renders correctly today changes.
 */
export function createSectionShapes(sec: Section): THREE.Shape[] {
  const composition = sec.composition;
  if (composition) {
    const outline = buildSectionOutline({
      profileName: composition.profileName,
      arrangement: composition.arrangement as BuiltUpArrangement,
      gapMm: composition.gapMm,
      // The section's own rotation, if any. Element roll is applied to the mesh, not here.
      rotationDeg: sec.rotation ?? 0,
    });
    if (!outline.unavailable && outline.polygons.length > 0) {
      const solid = outline.polygons.filter((p) => !p.isVoid);
      const voids = outline.polygons.filter((p) => p.isVoid);
      const shapes = solid.map((p) => {
        const s = new THREE.Shape(p.vertices.map(([y, z]) => new THREE.Vector2(y, z)));
        /*
         * Voids are attached to EVERY solid outline rather than matched to their own part.
         * `CanonicalPolygon` does not say which outer ring a hole belongs to, and a hole that
         * lies outside a shape is ignored by the triangulator — so attaching all of them is
         * correct for the arrangements here, where each part is a translated copy of one
         * profile and its own void is the only one inside it.
         */
        for (const v of voids) {
          s.holes.push(new THREE.Path(v.vertices.map(([y, z]) => new THREE.Vector2(y, z))));
        }
        return s;
      });
      if (shapes.length > 0) return shapes;
    }
    // An assembly whose outline could not be built draws nothing rather than a stand-in: a
    // fabricated I-beam where two angles belong is worse than a wireframe line.
    return [];
  }

  const single = createSectionShape(sec);
  return single ? [single] : [];
}

export function createSectionShape(sec: Section): THREE.Shape | null {
  const shape = sec.shape;
  const h = sec.h ?? 0;
  const b = sec.b ?? 0;
  const tw = sec.tw ?? 0;
  const tf = sec.tf ?? 0;
  const t = sec.t ?? 0;
  const tl = sec.tl ?? 0;

  if (!shape && h <= 0 && b <= 0) return null;

  switch (shape) {
    case 'I':
    case 'H':
      if (h > 0 && b > 0 && tw > 0 && tf > 0) {
        return createIShape(h, b, tw, tf);
      }
      // Estimate from h and b
      if (h > 0 && b > 0) {
        return createIShape(h, b, h * 0.05, h * 0.08);
      }
      return null;

    case 'RHS':
      if (h > 0 && b > 0 && t > 0) {
        return createRHSShape(h, b, t);
      }
      if (h > 0 && b > 0) {
        return createRHSShape(h, b, Math.min(h, b) * 0.1);
      }
      return null;

    case 'CHS': {
      const radius = h > 0 ? h / 2 : b > 0 ? b / 2 : 0;
      if (radius > 0) {
        return createCHSShape(radius, t > 0 ? t : radius * 0.1);
      }
      return null;
    }

    case 'rect':
      if (h > 0 && b > 0) {
        return createRectShape(h, b);
      }
      return null;

    case 'U':
      if (h > 0 && b > 0 && tw > 0 && tf > 0) {
        return createUShape(h, b, tw, tf);
      }
      if (h > 0 && b > 0) {
        return createUShape(h, b, h * 0.05, h * 0.08);
      }
      return null;

    case 'L':
      if (h > 0 && b > 0 && t > 0) {
        return createLShape(h, b, t);
      }
      if (h > 0 && b > 0) {
        return createLShape(h, b, Math.min(h, b) * 0.1);
      }
      return null;

    case 'T':
      if (h > 0 && b > 0 && tw > 0 && tf > 0) {
        return createTShape(h, b, tw, tf);
      }
      if (h > 0 && b > 0) {
        return createTShape(h, b, h * 0.05, h * 0.08);
      }
      return null;

    case 'C': {
      // Lipped (cold-formed) channel. Section model: t = lip length (c), tl = lip thickness.
      if (h > 0 && b > 0) {
        const web = tw > 0 ? tw : h * 0.04;
        const fl = tf > 0 ? tf : h * 0.04;
        const lip = t > 0 ? t : Math.min(h, b) * 0.2;
        const lipT = tl > 0 ? tl : fl;
        return createCShape(h, b, web, fl, lip, lipT);
      }
      return null;
    }

    case 'Z': {
      // Lipped (cold-formed) zed. Section model matches the channel's: t = lip length (c),
      // tl = lip thickness. See `createZShape` on the origin and the degenerate guards.
      if (h > 0 && b > 0) {
        const web = tw > 0 ? tw : h * 0.04;
        const fl = tf > 0 ? tf : h * 0.04;
        const lip = t > 0 ? t : Math.min(h, b) * 0.2;
        const lipT = tl > 0 ? tl : fl;
        return createZShape(h, b, web, fl, lip, lipT);
      }
      return null;
    }

    case 'invL':
      // Inverted/unequal angle — render with the same L outline (orientation
      // difference is cosmetic; geometry is representative).
      if (h > 0 && b > 0) {
        return createLShape(h, b, t > 0 ? t : Math.min(h, b) * 0.1);
      }
      return null;

    case 'generic':
      // Try to make something from h and b
      if (h > 0 && b > 0) {
        return createRectShape(h, b);
      }
      return null;

    default:
      // No shape specified, try to use h/b
      if (h > 0 && b > 0) {
        // Default to I-shape if we have h and b
        return createIShape(h, b, h * 0.05, h * 0.08);
      }
      return null;
  }
}
