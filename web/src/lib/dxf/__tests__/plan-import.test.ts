import { describe, it, expect } from 'vitest';
import { parseDxf } from '../parser';
import { mapPlanToModel, defaultPlanMapperOptions } from '../plan-mapper';
import { generatePlanTemplate } from '../plan-template';

describe('Plan → 3D DXF import (end-to-end)', () => {
  // Parse the template once for all tests
  const dxfText = generatePlanTemplate();
  const parsed = parseDxf(dxfText);

  it('template generates valid DXF that parser can read', () => {
    expect(parsed.lines.length).toBeGreaterThan(0);
    expect(parsed.texts.length).toBeGreaterThan(0);
    expect(parsed.layers.length).toBeGreaterThan(0);
  });

  it('parser detects all expected layers', () => {
    const layerNames = parsed.layers.map(l => l.toUpperCase());
    expect(layerNames).toContain('DED_P_VIGAS');
    expect(layerNames).toContain('DED_P_COLUMNAS');
    expect(layerNames).toContain('DED_P_APOYOS_FIJOS');
    expect(layerNames).toContain('DED_P_TEXTO');
    expect(layerNames).toContain('DED_P_AYUDA');
  });

  it('parser reads LINE segments on beam and column layers', () => {
    const beamLines = parsed.lines.filter(l => l.layer === 'DED_P_VIGAS');
    const colLines = parsed.lines.filter(l => l.layer === 'DED_P_COLUMNAS');
    // Template has 7 beam rectangles (4 sides each = 28 lines) + 5 rect columns (4 sides each = 20 lines)
    expect(beamLines.length).toBeGreaterThanOrEqual(20); // at least 5 beams × 4 sides
    expect(colLines.length).toBeGreaterThanOrEqual(16); // at least 4 rect columns × 4 sides
  });

  it('parser reads CIRCLE entities on column layer', () => {
    const colCircles = parsed.circles.filter(c => c.layer === 'DED_P_COLUMNAS');
    // Template has 1 circular column (C05 D40)
    expect(colCircles.length).toBeGreaterThanOrEqual(1);
  });

  it('parser reads TEXT annotations', () => {
    const textos = parsed.texts.filter(t => t.layer === 'DED_P_TEXTO');
    expect(textos.length).toBeGreaterThan(0);
    // Should have column and beam labels
    const values = textos.map(t => t.value);
    const hasColumnLabel = values.some(v => /C\d+/.test(v));
    const hasBeamLabel = values.some(v => /V\d+/.test(v));
    expect(hasColumnLabel).toBe(true);
    expect(hasBeamLabel).toBe(true);
  });

  describe('plan mapper', () => {
    const result = mapPlanToModel(parsed, {
      ...defaultPlanMapperOptions,
      unit: 'm',
      columnHeight: 3.0,
      floorZ: 0.0,
    });

    it('detects columns from template', () => {
      // Template has 6 columns (5 rectangular + 1 circular)
      expect(result.columns.length).toBe(6);
    });

    it('detects rectangular and circular columns', () => {
      const rectCols = result.columns.filter(c => c.shape === 'rect');
      const circCols = result.columns.filter(c => c.shape === 'circular');
      expect(rectCols.length).toBe(5);
      expect(circCols.length).toBe(1);
      // Circular column should have diameter ~0.40m
      expect(circCols[0].diameter).toBeCloseTo(0.40, 1);
    });

    it('detects beams from template', () => {
      // Template has 7 beams
      expect(result.beams.length).toBe(7);
    });

    it('creates 3D nodes at floor level and column base', () => {
      const floorNodes = result.nodes.filter(n => Math.abs(n.z) < 0.01);
      const baseNodes = result.nodes.filter(n => Math.abs(n.z + 3.0) < 0.01);
      // Should have nodes at z=0 (floor) and z=-3 (column base)
      expect(floorNodes.length).toBeGreaterThan(0);
      expect(baseNodes.length).toBeGreaterThan(0);
      // Each column creates a base node
      expect(baseNodes.length).toBe(6);
    });

    it('creates frame elements for beams and columns', () => {
      expect(result.elements.length).toBeGreaterThan(0);
      // At minimum: 6 columns + some beam segments
      expect(result.elements.length).toBeGreaterThanOrEqual(6 + 7);
    });

    it('all elements are frame type', () => {
      for (const el of result.elements) {
        expect(el.type).toBe('frame');
      }
    });

    it('creates supports at column bases', () => {
      // Template has 6 fixed supports
      expect(result.supports.length).toBe(6);
      for (const s of result.supports) {
        expect(s.type).toBe('fixed');
      }
      // Supports should be at base nodes (z = -3)
      for (const s of result.supports) {
        const node = result.nodes.find(n => n.id === s.nodeId);
        expect(node).toBeDefined();
        expect(node!.z).toBeCloseTo(-3.0, 1);
      }
    });

    it('creates sections for beams and columns', () => {
      expect(result.sections.length).toBeGreaterThanOrEqual(2);
      // Should have at least a beam section and a column section
      for (const sec of result.sections) {
        expect(sec.a).toBeGreaterThan(0);
        expect(sec.iz).toBeGreaterThan(0);
      }
    });

    it('creates at least one material', () => {
      expect(result.materials.length).toBeGreaterThanOrEqual(1);
      expect(result.materials[0].e).toBe(30000); // default concrete
    });

    it('detects distributed load from template', () => {
      // Debug: check warnings related to loads
      const loadWarnings = result.warnings.filter(w => w.toLowerCase().includes('load') || w.toLowerCase().includes('carga') || w.toLowerCase().includes('magnitude') || w.toLowerCase().includes('overlap'));
      console.log('Load warnings:', loadWarnings);
      console.log('Total warnings:', result.warnings.length);
      // Template has 1 distributed load on V1
      expect(result.distributedLoads.length).toBeGreaterThanOrEqual(1);
      // Load should be in -Z direction (gravity)
      for (const dl of result.distributedLoads) {
        expect(dl.qz).toBeLessThan(0); // negative = downward
      }
    });

    it('element node references are valid', () => {
      const nodeIds = new Set(result.nodes.map(n => n.id));
      for (const el of result.elements) {
        expect(nodeIds.has(el.nodeI)).toBe(true);
        expect(nodeIds.has(el.nodeJ)).toBe(true);
        expect(el.nodeI).not.toBe(el.nodeJ);
      }
    });

    it('support node references are valid', () => {
      const nodeIds = new Set(result.nodes.map(n => n.id));
      for (const s of result.supports) {
        expect(nodeIds.has(s.nodeId)).toBe(true);
      }
    });

    it('beam-column intersections split beams correctly', () => {
      // The template has beams spanning between columns
      // V1 goes from C1 to C2 (5m), V2 from C2 to C3 (5m)
      // Each should produce at least 1 beam element
      // Some beams may pass through intermediate columns and get split
      const beamElements = result.elements.filter(el => {
        const ni = result.nodes.find(n => n.id === el.nodeI)!;
        const nj = result.nodes.find(n => n.id === el.nodeJ)!;
        // Horizontal elements (same Z, at floor level)
        return Math.abs(ni.z - nj.z) < 0.01 && Math.abs(ni.z) < 0.01;
      });
      expect(beamElements.length).toBeGreaterThanOrEqual(7);
    });

    it('columns are vertical elements', () => {
      const columnElements = result.elements.filter(el => {
        const ni = result.nodes.find(n => n.id === el.nodeI)!;
        const nj = result.nodes.find(n => n.id === el.nodeJ)!;
        // Vertical: same X,Y but different Z
        return Math.abs(ni.x - nj.x) < 0.01 &&
               Math.abs(ni.y - nj.y) < 0.01 &&
               Math.abs(ni.z - nj.z) > 0.5;
      });
      expect(columnElements.length).toBe(6);
    });

    it('produces no critical warnings for the template', () => {
      // Template should be well-formed, no text/geometry mismatches
      const criticalWarnings = result.warnings.filter(
        w => w.includes('differ') || w.includes('No columns') || w.includes('No beams')
      );
      expect(criticalWarnings).toEqual([]);
    });
  });
});
