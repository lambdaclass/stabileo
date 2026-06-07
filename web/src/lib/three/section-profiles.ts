// Section Profile Shapes for 3D Visualization
// Creates THREE.Shape objects for different section types,
// which can be extruded along element axes.

import * as THREE from 'three';
import type { Section } from '../store/model.svelte';

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
