/**
 * How well a click lands on a node, measured — and two hypotheses this bench refuted.
 *
 * ── What it was built to test, and what it actually found ──────────
 *
 * The complaint is that node markers look enormous in «Modelo con secciones». The first two
 * explanations I wrote down were both wrong, and this file is what showed it:
 *
 *   1. **«The spheres steal clicks from members.»** `Viewport3D` raycasts `nodesParent` FIRST and
 *      only then `elementsParent` (lines 1145 and 1154), so a node covering a member really would
 *      take the click. **Measured: 0 % at every camera distance tested.** A 140 mm sphere does not
 *      reach the quarter point of a 1.25 m truss panel. The mechanism is real; the effect is not.
 *   2. **«Node picking is failing.»** The first version of this bench aimed at each node's
 *      mathematically exact centre and reported hit rates of 92 %, 67 % and 0 %. That is an
 *      artefact of the probe, not a defect: `SphereGeometry` puts its poles on the Y axis, this app
 *      uses `cam.up = (0, 0, 1)` so an elevation view looks exactly along ±Y, and a ray down a
 *      sphere's polar axis is degenerate — it returns 16 triangles from one side and none from the
 *      other. Real clicks land a pixel or two off centre and hit cleanly, which is why the sampling
 *      below is deliberately offset.
 *
 * ── What the measurement does support ──────────────────────────────
 *
 * The defect is **visual and scale-dependent**, and that is all. A world-fixed radius means the
 * marker's apparent size is inversely proportional to camera distance: about 8 px with the whole
 * truss on screen, 144 px when a user zooms in to read a section — which is exactly what the
 * sections mode is for. Nothing about interaction degrades; the picture does.
 *
 * That narrower conclusion is the useful one, because it says what a fix has to achieve (constant
 * apparent size) and what it must not cost (nothing, since nothing is broken).
 *
 * Measured on a truss because that is where nodes crowd, and where the profiles are angles: an
 * `L 30x30x3` is 30 mm deep against a 140 mm marker.
 *
 * `raycastMs` is the cost of the query alone. A mouse, a frame budget and a person are not in it,
 * so it must not be quoted as interaction time.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NodesInstanced } from '../nodes-instanced';
import { ElementsPicking } from '../elements-picking';
import { generateTruss, DEFAULT_TRUSS_PARAMS } from '../../engine/generators/truss-topology';

/** A truss with plenty of nodes — the geometry the complaint is about. */
const topology = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 20, panelsPerHalf: 8 });

/** The scene the app builds: node spheres in one parent, member proxies in another. */
function buildScene(nodeRadius?: number) {
  const nodes = new NodesInstanced(nodeRadius === undefined ? {} : { radius: nodeRadius });
  const elems = new ElementsPicking();
  for (const n of topology.nodes) nodes.upsert(n.i, n.x, n.y, n.z);
  for (const [k, m] of topology.members.entries()) {
    const a = topology.nodes[m.a], b = topology.nodes[m.b];
    elems.upsert(k, { x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z });
  }
  const nodesParent = new THREE.Group(); nodesParent.add(nodes.mesh);
  const elemsParent = new THREE.Group(); elemsParent.add(elems.mesh);
  nodesParent.updateMatrixWorld(true); elemsParent.updateMatrixWorld(true);
  return { nodes, elems, nodesParent, elemsParent };
}

/**
 * A camera at a chosen distance from the truss, looking at a node in the middle of it.
 *
 * Distance is a PARAMETER, and that is the whole design of this bench. The first version framed
 * the entire 20 m truss and reported a false-positive rate of zero — correctly, because at that
 * distance a 140 mm sphere subtends about 8 px and reaches nothing. The complaint is not about
 * that view.
 *
 * A world-fixed radius means the marker's apparent size is inversely proportional to distance: it
 * is a dot when the whole structure is on screen and a boulder when a user zooms in to read a
 * section — which is exactly what «Modelo con secciones» is for. So the defect has to be measured
 * across zoom, not at one framing.
 */
function cameraAt(distanceM: number) {
  const mid = topology.nodes[Math.floor(topology.nodes.length / 2)];
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 1000);
  /*
   * Deliberately OFF the exact axis. A camera looking straight down −Y sends every centred ray
   * down the node sphere's polar axis, where ray-triangle intersection is degenerate — that is
   * what produced the false «picking is broken» reading, not any defect. A few degrees of tilt is
   * both more realistic and numerically clean.
   */
  cam.position.set(mid.x + distanceM * 0.25, mid.y - distanceM, mid.z + distanceM * 0.18);
  cam.up.set(0, 0, 1);
  cam.lookAt(mid.x, mid.y, mid.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Apparent diameter, in pixels, of a sphere of this radius at this distance. */
function apparentPx(radiusM: number, distanceM: number, viewportH = 900, fovDeg = 50): number {
  const fov = (fovDeg * Math.PI) / 180;
  return (2 * radiusM / distanceM) / fov * viewportH;
}

/**
 * Cast at a world point the way a click does: project it to NDC, then ray from the camera.
 *
 * Resolution order is the app's — nodes first, then elements — so "what would the user have
 * selected" is what comes back, not "what is nearest".
 */
function clickAt(
  world: THREE.Vector3, cam: THREE.PerspectiveCamera,
  s: ReturnType<typeof buildScene>, pixelOffset = { x: 0, y: 0 }, viewportPx = { w: 1600, h: 900 },
): { kind: 'node' | 'element' | 'nothing'; id: number | null } {
  const ndc = world.clone().project(cam);
  ndc.x += (pixelOffset.x * 2) / viewportPx.w;
  ndc.y -= (pixelOffset.y * 2) / viewportPx.h;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);

  const nodeHits = rc.intersectObjects(s.nodesParent.children, true);
  if (nodeHits.length > 0) {
    const inst = nodeHits[0].instanceId;
    return { kind: 'node', id: inst == null ? null : s.nodes.nodeIdAt(inst) };
  }
  const elemHits = rc.intersectObjects(s.elemsParent.children, true);
  if (elemHits.length > 0) {
    const inst = elemHits[0].instanceId;
    return { kind: 'element', id: inst == null ? null : s.elems.elementIdAt(inst) };
  }
  return { kind: 'nothing', id: null };
}

/** Points along a member, away from both its ends — where a user clicks to select a BAR. */
function memberInteriorPoints(fraction: number): { point: THREE.Vector3; member: number }[] {
  return topology.members.map((m, k) => {
    const a = topology.nodes[m.a], b = topology.nodes[m.b];
    const t = fraction;
    return {
      member: k,
      point: new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
    };
  });
}

/** The three numbers, for a given drawn radius at a given camera distance. */
function measure(nodeRadius: number | undefined, distanceM: number) {
  const s = buildScene(nodeRadius);
  const cam = cameraAt(distanceM);

  // Only nodes in front of the camera and inside the frustum: a node behind the viewer is not a
  // click anybody could make, and counting it as a miss would understate the hit rate.
  const visible = topology.nodes.filter((n) => {
    const ndc = new THREE.Vector3(n.x, n.y, n.z).project(cam);
    return ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  });

  /*
   * Two pixels off centre, which is where a click actually lands. Aiming at the exact centre
   * measures the tessellation's polar singularity instead of the target.
   */
  let nodeHits = 0;
  const t0 = performance.now();
  for (const n of visible) {
    const r = clickAt(new THREE.Vector3(n.x, n.y, n.z), cam, s, { x: 2, y: 1 });
    if (r.kind === 'node' && r.id === n.i) nodeHits++;
  }
  const raycastMs = visible.length ? (performance.now() - t0) / visible.length : 0;

  // A member's quarter and mid points. The quarter point is the honest test: it is inside the
  // member and close enough to an end that an oversized node marker reaches it.
  let stolen = 0, total = 0;
  for (const f of [0.15, 0.25, 0.5, 0.75, 0.85]) {
    for (const { point } of memberInteriorPoints(f)) {
      const ndc = point.clone().project(cam);
      if (ndc.z <= -1 || ndc.z >= 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
      total++;
      if (clickAt(point, cam, s).kind === 'node') stolen++;
    }
  }

  return {
    nodeCount: visible.length,
    memberCount: topology.members.length,
    hitRate: visible.length ? nodeHits / visible.length : 1,
    falsePositiveRate: total ? stolen / total : 0,
    memberPointsTested: total,
    raycastMs,
    scene: s,
    cam,
  };
}

/** How far off centre, in pixels, a click on a node still lands on it. */
function effectiveTargetPx(s: ReturnType<typeof buildScene>, cam: THREE.PerspectiveCamera): number {
  const n = topology.nodes[Math.floor(topology.nodes.length / 2)];
  const p = new THREE.Vector3(n.x, n.y, n.z);
  for (let px = 1; px <= 120; px++) {
    if (clickAt(p, cam, s, { x: px, y: 0 }).kind !== 'node') return px - 1;
  }
  return 120;
}

/** The distances a user actually works at, from whole-structure down to detail. */
const DISTANCES = [18, 8, 4, 2, 1];

/** What a screen-space gizmo would resolve to: constant apparent size, whatever the distance. */
const GIZMO_PX = 7;
const gizmoRadiusAt = (distanceM: number) =>
  (GIZMO_PX / 900) * ((50 * Math.PI) / 180) * distanceM / 2;

describe('BEFORE — the fixed 0.07 m radius, swept across zoom', () => {
  const rows = DISTANCES.map((d) => ({ d, ...measure(undefined, d) }));

  it('records the baseline, and shows the defect is scale-dependent', () => {
    /*
     * The table is the evidence. The first version of this bench measured at ONE distance — the
     * whole truss on screen — and found a false-positive rate of zero, which is true and was the
     * wrong question: at 18 m a 140 mm sphere is about 8 px and reaches nothing.
     *
     * A world-fixed radius fails at the OTHER end. Zoom in to read a section and the same sphere
     * grows without limit in apparent size, until it covers the members it is supposed to mark.
     */
    console.log('[BEFORE] fixed radius 0.07 m — apparent size and clicks lost, by camera distance');
    for (const r of rows) {
      console.log(
        `  d=${String(r.d).padStart(2)} m  sphere=${apparentPx(0.07, r.d).toFixed(0).padStart(4)} px` +
        `  nodes visible=${String(r.nodeCount).padStart(2)}  hit=${(r.hitRate * 100).toFixed(0).padStart(3)} %` +
        `  member clicks lost=${(r.falsePositiveRate * 100).toFixed(1).padStart(5)} %  (${r.memberPointsTested} pts)` +
        `  raycast=${r.raycastMs.toFixed(3)} ms`,
      );
    }
    expect(rows.length).toBe(DISTANCES.length);
  });

  it('lands every realistic click on its node, at every distance', () => {
    // The baseline that must survive any change to the drawn size. «Realistic» is doing work here:
    // two pixels off centre, because dead centre measures the polar singularity (see the header).
    for (const r of rows) expect(r.hitRate, `d=${r.d}`).toBe(1);
  });

  it('grows without limit as the user zooms in', () => {
    /*
     * The defect, stated as the property rather than as a threshold: apparent size is inversely
     * proportional to distance, so there is no zoom at which a world-fixed marker stops growing.
     * At 1 m it is already an order of magnitude larger than at 18 m.
     */
    const far = apparentPx(0.07, 18), near = apparentPx(0.07, 1);
    expect(near / far).toBeCloseTo(18, 0);
    expect(near).toBeGreaterThan(100);
  });

  it('does NOT take clicks away from members — the hypothesis this refuted', () => {
    /*
     * Recorded as a negative result rather than deleted. The node-first raycast order means a
     * marker large enough WOULD make members unselectable, so the mechanism deserves a permanent
     * test; it simply does not fire at these dimensions, because a 140 mm sphere does not reach
     * the quarter point of a 1.25 m panel.
     *
     * If a future change enlarges the marker, or a generator produces much shorter members, this
     * is where it shows up.
     */
    for (const r of rows) expect(r.falsePositiveRate, `d=${r.d}`).toBe(0);
  });
});

describe('AFTER — a screen-space gizmo of constant apparent size', () => {
  /*
   * Screen-space sizing needs a render loop, so this stands in for it exactly: at each distance,
   * the world radius a 7 px marker resolves to. Same mechanism the members already use —
   * `Line2`/`LineMaterial` exist to give width in pixels — and it isolates the property under test
   * from the implementation.
   */
  const rows = DISTANCES.map((d) => ({ d, r: gizmoRadiusAt(d), ...measure(gizmoRadiusAt(d), d) }));

  it('records the comparison', () => {
    console.log(`[AFTER ] screen-space gizmo, ${GIZMO_PX} px constant`);
    for (const r of rows) {
      console.log(
        `  d=${String(r.d).padStart(2)} m  radius=${(r.r * 1000).toFixed(1).padStart(5)} mm` +
        `  sphere=${apparentPx(r.r, r.d).toFixed(0).padStart(4)} px` +
        `  hit=${(r.hitRate * 100).toFixed(0).padStart(3)} %` +
        `  member clicks lost=${(r.falsePositiveRate * 100).toFixed(1).padStart(5)} %` +
        `  raycast=${r.raycastMs.toFixed(3)} ms`,
      );
    }
    expect(rows.length).toBe(DISTANCES.length);
  });

  it('keeps a constant apparent size, which is the point', () => {
    for (const r of rows) expect(apparentPx(r.r, r.d)).toBeCloseTo(GIZMO_PX, 6);
  });

  it('still lands every realistic click, with a marker an order of magnitude smaller', () => {
    // Non-negotiable: shrinking the marker must not cost node selection. At 1 m the gizmo is
    // 3.4 mm where the fixed sphere was 70 mm, and the click still lands.
    for (const r of rows) expect(r.hitRate, `d=${r.d}`).toBe(1);
  });

  it('takes no clicks away from members, at any distance', () => {
    // The improvement, and the reason a constant apparent size is the right fix rather than a
    // smaller constant world size: it holds at every zoom instead of at one.
    for (const r of rows) expect(r.falsePositiveRate, `d=${r.d}`).toBe(0);
  });

  it('and is never so small that it stops being a target', () => {
    // The other failure mode. 7 px is a deliberate floor: a 2 px marker would be honest about
    // scale and impossible to click, which is why the drawn radius and the PICK radius have to be
    // allowed to differ — see `create-element-mesh.ts:242` for the pattern already in the app.
    for (const r of rows) expect(apparentPx(r.r, r.d)).toBeGreaterThanOrEqual(4);
  });
});
