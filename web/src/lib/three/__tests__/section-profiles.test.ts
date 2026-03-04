/**
 * Section Profile Tests — Verify THREE.Shape generation for different section types
 */

import { describe, it, expect } from 'vitest';
import {
  createIShape,
  createRHSShape,
  createRectShape,
  createCHSShape,
  createUShape,
  createLShape,
  createTShape,
  createSectionShape,
} from '../section-profiles';
import type { Section } from '../../store/model.svelte';

describe('Section Profile Shapes', () => {
  describe('createIShape', () => {
    it('creates I-shape with correct vertex count', () => {
      const shape = createIShape(0.2, 0.1, 0.0056, 0.0085);
      const pts = shape.getPoints();
      // I-shape has 12 outer vertices
      expect(pts.length).toBe(13); // 12 vertices + closing = 13 getPoints
    });
  });

  describe('createRHSShape', () => {
    it('creates RHS with outer + inner hole', () => {
      const shape = createRHSShape(0.2, 0.1, 0.005);
      expect(shape.holes.length).toBe(1);
    });
  });

  describe('createRectShape', () => {
    it('creates rectangle with 4 vertices', () => {
      const shape = createRectShape(0.3, 0.2);
      const pts = shape.getPoints();
      expect(pts.length).toBe(5); // 4 + closing
    });
  });

  describe('createCHSShape', () => {
    it('creates CHS with hole for hollow', () => {
      const shape = createCHSShape(0.05, 0.005);
      expect(shape.holes.length).toBe(1);
    });

    it('creates CHS without hole for solid', () => {
      const shape = createCHSShape(0.05, 0);
      expect(shape.holes.length).toBe(0);
    });
  });

  describe('createUShape', () => {
    it('creates U-shape', () => {
      const shape = createUShape(0.2, 0.1, 0.006, 0.009);
      const pts = shape.getPoints();
      expect(pts.length).toBeGreaterThan(4);
    });
  });

  describe('createLShape', () => {
    it('creates L-shape', () => {
      const shape = createLShape(0.2, 0.2, 0.01);
      const pts = shape.getPoints();
      expect(pts.length).toBeGreaterThan(4);
    });
  });

  describe('createTShape', () => {
    it('creates T-shape', () => {
      const shape = createTShape(0.2, 0.1, 0.006, 0.009);
      const pts = shape.getPoints();
      expect(pts.length).toBeGreaterThan(4);
    });
  });

  describe('createSectionShape', () => {
    it('returns I-shape for IPE section', () => {
      const sec: Section = { id: 1, name: 'IPE200', a: 0.00285, iz: 1.943e-5, shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085 };
      const shape = createSectionShape(sec);
      expect(shape).not.toBeNull();
    });

    it('returns rect for rectangular section', () => {
      const sec: Section = { id: 1, name: 'Rect', a: 0.06, iz: 4.5e-4, shape: 'rect', h: 0.3, b: 0.2 };
      const shape = createSectionShape(sec);
      expect(shape).not.toBeNull();
    });

    it('returns null for section without shape or h/b', () => {
      const sec: Section = { id: 1, name: 'Generic', a: 0.01, iz: 1e-4 };
      const shape = createSectionShape(sec);
      expect(shape).toBeNull();
    });

    it('returns RHS for hollow rectangular section', () => {
      const sec: Section = { id: 1, name: 'RHS200x100x5', a: 0.0028, iz: 1.5e-5, shape: 'RHS', h: 0.2, b: 0.1, t: 0.005 };
      const shape = createSectionShape(sec);
      expect(shape).not.toBeNull();
      expect(shape!.holes.length).toBe(1);
    });

    it('returns CHS for circular hollow section', () => {
      const sec: Section = { id: 1, name: 'CHS100x5', a: 0.0015, iz: 1e-6, shape: 'CHS', h: 0.1, t: 0.005 };
      const shape = createSectionShape(sec);
      expect(shape).not.toBeNull();
      expect(shape!.holes.length).toBe(1);
    });

    it('estimates I-shape from h and b without explicit shape', () => {
      const sec: Section = { id: 1, name: 'Unknown', a: 0.003, iz: 2e-5, h: 0.2, b: 0.1 };
      const shape = createSectionShape(sec);
      expect(shape).not.toBeNull();
    });
  });
});
