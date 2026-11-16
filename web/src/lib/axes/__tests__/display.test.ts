import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axesStore } from '../axes.svelte';
import { allChoices, DEFAULT_AXES } from '../frame';
import {
  coordLabels, modelCoords, modelFlags, modelLoad3D, modelRot, modelVec, shownCoords, twoD, userFlags, userRot, userVec,
} from '../display';
import { TWO_D_DISPLACEMENT_LABELS, TWO_D_NODAL_LOAD_LABELS, TWO_D_REACTION_LABELS, twoDVerticalAxisLabel } from '../../geometry/coordinate-system';

afterEach(() => { axesStore.reset(); });

describe('the display layer over the user frame', () => {
  it('keeps every value and name as it was under the default frame', () => {
    expect(axesStore.choice).toEqual(DEFAULT_AXES);
    expect(userVec(1, 2, 3)).toEqual([1, 2, 3]);
    expect(coordLabels(false)).toEqual(['X', 'Z']);
    expect(TWO_D_REACTION_LABELS).toEqual({ horizontal: 'Rx', vertical: 'Rz', moment: 'My' });
    expect(twoD.rot(0.5)).toBe(0.5);
  });

  it('round-trips coordinates, vectors, rotations and flags in every frame', () => {
    for (const c of allChoices()) {
      axesStore.choice = c;
      const node = { x: 1.5, y: -2, z: 4 };
      expect(modelCoords(shownCoords(node, true), true)).toEqual(node);
      const flat = modelCoords(shownCoords({ x: 3, y: 2 }, false), false);
      expect([flat.x, flat.y]).toEqual([3, 2]);
      expect(modelVec(...userVec(1, 2, 3))).toEqual([1, 2, 3]);
      expect(modelRot(...userRot(1, 2, 3))).toEqual([1, 2, 3]);
      expect(modelFlags(...userFlags('a', 'b', 'c'))).toEqual(['a', 'b', 'c']);
      expect(twoD.fromRot(twoD.rot(0.25))).toBe(0.25);
    }
  });

  it('turns a load typed along the user Y into the model vertical when Y is up', () => {
    axesStore.choice = { up: '+Y', right: '+X', hand: 'right' };
    expect(modelLoad3D('fy', -10)).toMatchObject({ fx: 0, fy: 0, fz: -10 });
    expect(modelLoad3D('fz', 5).fy + 0).toBe(-5);
    expect(userVec(0, 0, 3)).toEqual([0, 3, 0]);
  });

  it('names the 2D plane after the user axes', () => {
    axesStore.choice = { up: '+Y', right: '+X', hand: 'right' };
    expect(twoDVerticalAxisLabel()).toBe('Y');
    expect(TWO_D_REACTION_LABELS).toEqual({ horizontal: 'Rx', vertical: 'Ry', moment: 'Mz' });
    expect(TWO_D_DISPLACEMENT_LABELS.rotation).toBe('θz');
    expect(TWO_D_NODAL_LOAD_LABELS.vertical).toBe('Fy');
  });

  it('flips the shown sign of a horizontal value when the user X points left', () => {
    axesStore.choice = { up: '+Z', right: '-X', hand: 'right' };
    expect(twoD.x(2)).toBe(-2);
    expect(twoD.fromX(-2)).toBe(2);
  });
});

const SRC = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('screens that show global axes go through the display layer', () => {
  const seam = [
    'components/Viewport.svelte', 'components/NodeEditor.svelte', 'components/tables/NodesTable.svelte',
    'components/tables/ResultsTable.svelte', 'components/tables/SupportsTable.svelte', 'components/property/NodeDetails.svelte',
    'components/pro/ProNodesTab.svelte', 'components/pro/PlacementHud.svelte', 'components/pro/ProResultsTab.svelte',
    'components/StatusBar.svelte', 'components/ContextMenu.svelte', 'components/floating-tools/ToolLoadOptions.svelte',
    'lib/engine/result-tables.ts', 'lib/export/excel.ts', 'lib/store/file.ts', 'lib/viewport/draw-entities.ts',
    'lib/viewport3d/axis-gizmo.ts', 'lib/store/support-tool-3d.ts',
  ];
  for (const f of seam) {
    it(`${f} reads the user frame`, () => {
      expect(read(f)).toMatch(/axes\/(display|axes\.svelte)'/);
    });
  }

  it('no screen prints a raw model component next to an axis name', () => {
    const forbidden = [/\{dsp\(d\.u[xyz]\)\}/, /\{frc\(r\.f[xyz]\)\}/, /fmtQ\(r\.f[xyz], 'force'\)/, /fmtQ\(d\.u[xyz], 'displacement'\)/, /\[X, \$\{/, /'Y' : TWO_D/];
    for (const f of seam) for (const re of forbidden) expect(read(f), `${f} ${re}`).not.toMatch(re);
  });
});
