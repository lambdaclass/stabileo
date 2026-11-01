import { describe, expect, it, vi } from 'vitest';
import { Mesh, Scene, Color } from 'three';
import { ScalarFieldScene } from '../scalar-field-scene';
import { shellContourColor } from '../shell-contour-colour';

describe('viewer mesh switching', () => {
  it('replaces coarse geometry on replay and cached mesh switches, including field mapping', () => {
    const scene = new Scene();
    const owner = new ScalarFieldScene(scene);
    const coarse = { xy: [0, 0, 2, 0, 2, 2, 0, 2], cells: [0, 1, 2, 3], size: 4 as const };
    const reference = { xy: [0, 0, 1, 0, 2, 0, 0, 1, 1, 1, 2, 1], cells: [0, 1, 4, 3, 1, 2, 5, 4], size: 4 as const };
    const triangle = { xy: [10, 0, 12, 0, 10, 2], cells: [2, 0, 1], size: 3 as const };
    let previous: Mesh | null = null;
    for (const data of [coarse, reference, coarse, triangle, reference]) {
      const disposed = previous ? vi.spyOn(previous.geometry, 'dispose') : null;
      const field = owner.rebuild(data.xy, data.cells, data.size, 3);
      if (disposed) expect(disposed).toHaveBeenCalledOnce();
      expect(scene.children).toEqual([field.group]);
      const mesh = field.group.children[0] as Mesh;
      const values = data.xy.filter((_, i) => i % 2 === 0).map((_, i) => i / 10);
      field.setDisplacement(null, 1);
      field.setField(values, { min: 0, max: 1 });
      const position = mesh.geometry.getAttribute('position');
      const colour = mesh.geometry.getAttribute('color');
      // A quad is stored as its four corners plus a centre vertex carrying the Q4 centre value.
      const perCell = data.size === 4 ? 5 : 3;
      for (let i = 0; i < data.cells.length; i++) {
        const node = data.cells[i];
        const v = Math.floor(i / data.size) * perCell + (i % data.size);
        expect(position.getX(v)).toBe(data.xy[2 * node]);
        expect(position.getY(v)).toBe(data.xy[2 * node + 1]);
        expect(new Color(colour.getX(v), colour.getY(v), colour.getZ(v)).getHex()).toBe(shellContourColor(values[node], 0, 1));
      }
      if (data.size === 4) for (let c = 0; c < data.cells.length / 4; c++) {
        const corners = [0, 1, 2, 3].map((k) => data.cells[4 * c + k]);
        const mean = corners.reduce((sum, n) => sum + values[n], 0) / 4;
        const centre = 5 * c + 4;
        expect(new Color(colour.getX(centre), colour.getY(centre), colour.getZ(centre)).getHex()).toBe(shellContourColor(mean, 0, 1));
      }
      expect(mesh.geometry.drawRange.count).toBe(data.cells.length / data.size * (data.size === 4 ? 12 : 3));
      previous = mesh;
    }
    owner.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
