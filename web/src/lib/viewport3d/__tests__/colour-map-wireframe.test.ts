/**
 * A colour map must reach the members that wireframe actually draws.
 *
 * `ctx.elementGroups` is a partial registry: in wireframe render mode a plain
 * member is drawn by the batched LineSegments2 and gets no Group of its own
 * (see `needsGroup` in scene-sync), so on a model without hinges the map is
 * EMPTY. Every colour map walked that map, so "Member colour" — and the
 * heatmap, and the verification colours — painted nothing at all in the
 * default render mode while still reporting `colorMapApplied = true`. The
 * member stayed grey and the feature looked broken rather than absent.
 *
 * The model is the element registry; the group is optional decoration. These
 * tests drive syncColorMap3D with no groups whatsoever and read the colour off
 * the batched mesh, which is the thing on screen.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { modelStore, resultsStore, uiStore } from '../../store';
import { ElementsBatched } from '../../three/elements-batched';
import { syncColorMap3D, type ResultsSyncContext } from '../results-sync';
import { axialForceColor } from '../../three/selection-helpers';

/** Two members, no hinges — so wireframe builds no groups for either. */
function twoBarModel(): { tie: number; strut: number } {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0, 0);
  const n2 = modelStore.addNode(4, 0, 0);
  const n3 = modelStore.addNode(4, 0, 3);
  return {
    tie: modelStore.addElement(n1, n2, 'frame'),
    strut: modelStore.addElement(n2, n3, 'frame'),
  };
}

function context(batched: ElementsBatched): ResultsSyncContext {
  return {
    initialized: true,
    resultsParent: new THREE.Group(),
    scene: new THREE.Scene(),
    elementGroups: new Map(), // wireframe: no groups, and that is the point
    elementsBatched: batched,
    shellGroups: new Map(),
    deformedGroup: null, diagramGroup: null, overlayDiagramGroup: null, despieceGroup: null,
    reactionGroup: null, constraintForcesGroup: null, nodeLabelsGroup: null,
    elementLabelsGroup: null, lengthLabelsGroup: null, verificationLabelsGroup: null,
    lastDeformedAnimScale: null, lastDespieceSep: null,
    colorMapApplied: false,
  };
}

/** Minimal solved state: only the axial pair the colour map reads. */
function publishAxial(forces: Array<{ elementId: number; n: number }>): void {
  resultsStore.setResults3D({
    displacements: [],
    reactions: [],
    elementForces: forces.map(f => ({
      elementId: f.elementId,
      nStart: f.n, nEnd: f.n,
      vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
      tStart: 0, tEnd: 0,
      myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
      length: 1,
    })),
  } as unknown as NonNullable<typeof resultsStore.results3D>);
}

const TENSION = axialForceColor(1);
const COMPRESSION = axialForceColor(-1);

describe('colour maps in wireframe render mode (no element groups)', () => {
  beforeEach(() => {
    uiStore.renderMode3D = 'wireframe';
    resultsStore.clear3D();
    resultsStore.diagramType = 'none';
  });

  it('axial member colour reaches the batched mesh with no groups at all', () => {
    const { tie, strut } = twoBarModel();
    const eb = new ElementsBatched();
    eb.upsert(tie, 0, 0, 0, 4, 0, 0);
    eb.upsert(strut, 4, 0, 0, 4, 3, 0);
    const ctx = context(eb);

    publishAxial([{ elementId: tie, n: 120 }, { elementId: strut, n: -80 }]);
    resultsStore.diagramType = 'axialColor';
    syncColorMap3D(ctx);

    expect(ctx.colorMapApplied).toBe(true);
    expect(eb.getBaseColor(tie), 'tie should be the tension colour').toBe(TENSION);
    expect(eb.getBaseColor(strut), 'strut should be the compression colour').toBe(COMPRESSION);
  });

  it('turning the map off restores the per-type base colour', () => {
    const { tie, strut } = twoBarModel();
    const eb = new ElementsBatched();
    eb.upsert(tie, 0, 0, 0, 4, 0, 0);
    eb.upsert(strut, 4, 0, 0, 4, 3, 0);
    const ctx = context(eb);

    publishAxial([{ elementId: tie, n: 120 }, { elementId: strut, n: -80 }]);
    resultsStore.diagramType = 'axialColor';
    syncColorMap3D(ctx);
    resultsStore.diagramType = 'none';
    syncColorMap3D(ctx);

    expect(ctx.colorMapApplied).toBe(false);
    expect(eb.getBaseColor(tie)).not.toBe(TENSION);
    expect(eb.getBaseColor(strut)).not.toBe(COMPRESSION);
    // Both are frames, so both land on the same wireframe grey.
    expect(eb.getBaseColor(tie)).toBe(eb.getBaseColor(strut));
  });
});
