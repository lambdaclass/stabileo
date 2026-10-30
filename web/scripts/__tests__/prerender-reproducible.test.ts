import { describe, expect, it } from 'vitest';
import { chartClipId } from '../../src/components/research/shauer2025/LineChart.svelte';
import { fetchBuildStars } from '../prerender';
import { compareDirectories } from '../check-prerender-reproducible.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('prerender reproducibility (#875)', () => {
  describe('deterministic chart clip-path IDs', () => {
    const series1 = [{ name: 'Stabileo', points: [[0, 0], [1, 10], [2, 20]] as [number, number][] }];
    const series2 = [{ name: 'Reference', points: [[0, 0], [1, 9.5], [2, 19.8]] as [number, number][] }];

    it('generates deterministic clip IDs across repeated calls with identical content', () => {
      const id1 = chartClipId('x (m)', 'Moment (kN·m)', series1);
      const id2 = chartClipId('x (m)', 'Moment (kN·m)', series1);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^clip-[a-z0-9]+$/);
    });

    it('differentiates charts with different series or labels', () => {
      const idA = chartClipId('x (m)', 'Moment (kN·m)', series1);
      const idB = chartClipId('x (m)', 'Shear (kN)', series1);
      const idC = chartClipId('x (m)', 'Moment (kN·m)', series2);
      expect(idA).not.toBe(idB);
      expect(idA).not.toBe(idC);
      expect(idB).not.toBe(idC);
    });

    it('differentiates charts with different points', () => {
      const seriesModified = [{ name: 'Stabileo', points: [[0, 0], [1, 15], [2, 30]] as [number, number][] }];
      const id1 = chartClipId('x', 'y', series1);
      const id2 = chartClipId('x', 'y', seriesModified);
      expect(id1).not.toBe(id2);
    });

    it('respects an explicit id when provided', () => {
      const custom = chartClipId('x', 'y', series1, [], 260, false, 'custom-chart-1');
      expect(custom).toBe('clip-custom-chart-1');
    });
  });

  describe('single build-time GitHub stars fetch', () => {
    it('uses STABILEO_BUILD_STARS environment variable when present', async () => {
      const prev = process.env.STABILEO_BUILD_STARS;
      try {
        process.env.STABILEO_BUILD_STARS = '9876';
        const stars = await fetchBuildStars();
        expect(stars).toBe(9876);
      } finally {
        if (prev !== undefined) process.env.STABILEO_BUILD_STARS = prev;
        else delete process.env.STABILEO_BUILD_STARS;
      }
    });

    it('gracefully handles missing or invalid STABILEO_BUILD_STARS', async () => {
      const prev = process.env.STABILEO_BUILD_STARS;
      try {
        process.env.STABILEO_BUILD_STARS = 'invalid';
        // When invalid and in tests (offline/unauthenticated), falls back to null rather than throwing
        const stars = await fetchBuildStars();
        expect(typeof stars === 'number' || stars === null).toBe(true);
      } finally {
        if (prev !== undefined) process.env.STABILEO_BUILD_STARS = prev;
        else delete process.env.STABILEO_BUILD_STARS;
      }
    });
  });

  describe('directory byte-identity comparison', () => {
    it('reports identical directories with matching byte contents', () => {
      const dirA = mkdtempSync(join(tmpdir(), 'test-repro-a-'));
      const dirB = mkdtempSync(join(tmpdir(), 'test-repro-b-'));
      try {
        writeFileSync(join(dirA, 'index.html'), '<html><body>Hello</body></html>');
        writeFileSync(join(dirB, 'index.html'), '<html><body>Hello</body></html>');
        writeFileSync(join(dirA, 'about.html'), '<html><body>About</body></html>');
        writeFileSync(join(dirB, 'about.html'), '<html><body>About</body></html>');

        const result = compareDirectories(dirA, dirB);
        expect(result.identical).toBe(true);
        expect(result.differing).toEqual([]);
        expect(result.onlyInA).toEqual([]);
        expect(result.onlyInB).toEqual([]);
        expect(result.totalA).toBe(2);
      } finally {
        rmSync(dirA, { recursive: true, force: true });
        rmSync(dirB, { recursive: true, force: true });
      }
    });

    it('detects differing file content and missing files', () => {
      const dirA = mkdtempSync(join(tmpdir(), 'test-repro-a-'));
      const dirB = mkdtempSync(join(tmpdir(), 'test-repro-b-'));
      try {
        writeFileSync(join(dirA, 'index.html'), '<html><body>Hello 1</body></html>');
        writeFileSync(join(dirB, 'index.html'), '<html><body>Hello 2</body></html>');
        writeFileSync(join(dirA, 'only-a.html'), 'foo');
        writeFileSync(join(dirB, 'only-b.html'), 'bar');

        const result = compareDirectories(dirA, dirB);
        expect(result.identical).toBe(false);
        expect(result.differing).toEqual(['index.html']);
        expect(result.onlyInA).toEqual(['only-a.html']);
        expect(result.onlyInB).toEqual(['only-b.html']);
      } finally {
        rmSync(dirA, { recursive: true, force: true });
        rmSync(dirB, { recursive: true, force: true });
      }
    });
  });
});

