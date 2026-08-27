/**
 * The reinforcement, as geometry you can orbit.
 *
 * ── What this module is and is not ─────────────────────────────────
 *
 * It is a renderer. It takes a `SceneModel` — already projected from the document, already
 * sampled, already carrying its marks — and turns it into Three.js objects. It decides
 * colours, tube radii and draw-call batching, and it decides nothing else. No bar position,
 * no clearance, no length. If a number appears on screen it came from the document.
 *
 * That division is why the scene model is a separate, pure module: everything worth testing
 * about WHAT is shown is testable without WebGL, and this file only has to be right about
 * how it looks.
 *
 * ── Why the tubes are built by hand ────────────────────────────────
 *
 * `THREE.TubeGeometry` re-samples its curve at equal arc length. Handed a bar polyline it
 * would place its rings wherever it liked, which on a 135° stirrup hook — five sample points
 * inside 25 mm — means the hook is smoothed away or missed. The bars in this model were
 * sampled by `samplePath` at a chord tolerance chosen so the collision checker measures the
 * real bend; re-sampling them here would throw that away and, worse, would make the picture
 * disagree with the check.
 *
 * So the tube walks the polyline's own vertices, one ring per vertex, with a parallel
 * transport frame. Parallel transport rather than a Frenet frame because a Frenet frame flips
 * its normal through an inflection and spins wildly where curvature vanishes — which is most
 * of a reinforcing bar, since a straight run has no defined normal at all.
 *
 * ── Why the geometry is merged ─────────────────────────────────────
 *
 * A floor is thousands of bars. One mesh per bar is thousands of draw calls and a viewport
 * that stutters before the model is interesting. Bars are merged into one buffer per colour
 * category, and the mapping from a picked triangle back to its bar is kept alongside — so
 * the batching stays invisible to the user, who can still click a stirrup and be told which
 * mark it is.
 *
 * ── Why the merge is ALSO split by family ──────────────────────────
 *
 * Because a colour is not a switch. Batched by colour alone, every column bar and every slab
 * bar sat in the same buffer, so "hide columns" could only be expressed by handing the renderer
 * a smaller scene — which meant re-tubing all 20 917 bars to answer a checkbox. Measured on the
 * 7-storey building: 5,9 s for the first columns toggle and up to 16,7 s for slabs, to arrive at
 * a picture whose visible geometry was already on the GPU.
 *
 * So a batch is one family AND one colour, and a family switch is `mesh.visible`. Nothing is
 * sampled, no buffer is allocated, no index is recomputed and no picking map is rebuilt.
 *
 * The filters that are NOT family-shaped — isolate this member, show only these states — cannot
 * be a visibility flag, because they cut ACROSS a batch. They are answered by re-selecting which
 * of the batch's already-built triangles are drawn: the index is compacted from a master copy
 * that never changes, and the positions and normals are never touched. That is the honest
 * distinction, and it is why this file has two mechanisms rather than one.
 */

import * as THREE from 'three';
import {
  SCENE_SOLID_KINDS, barMatchesFilter, barSolidKind, kindByElement, solidMatchesFilter,
  type SceneBar, type SceneConflictMarker, type SceneFilter, type SceneModel, type SceneSolid,
  type SceneSolidKind,
} from '../engine/detailing/scene-model';

// ─── Palette ─────────────────────────────────────────────────────

export const REBAR_COLORS = {
  longitudinal: 0x3d7dd8,
  transverse: 0xe8913c,
  /** A bar named by an unresolved conflict. Overrides its role colour. */
  conflicted: 0xe0444a,
  concrete: 0x9aa4b0,
  /**
   * Concrete with no steel in it.
   *
   * A distinct colour rather than a subtler shade of the same grey, because this is not a
   * variation on "concrete" — it is a member the app could not design, and it has to read as
   * a problem from across the room.
   */
  unreinforced: 0xd4762a,
  conflictMarker: 0xff2d55,
  selected: 0xffd400,
  /**
   * A bar belonging to a PROPOSAL rather than a certified design.
   *
   * Violet, which is not on the role/conflict axis at all — the two blues and the orange say
   * WHAT a bar is, the red says a bar is in conflict, and this says the whole member is not
   * settled. A darker blue would have read as "longitudinal, slightly different", which is
   * exactly the confusion between a proposal and a design that must not be possible on sight.
   *
   * It loses to `conflicted`: a provisional bar that is ALSO in conflict is drawn red, because
   * the conflict is the more specific and more urgent fact about that particular bar.
   */
  provisional: 0xa066d3,
} as const;

/** The colours bars are batched by. */
export type RebarCategory = 'longitudinal' | 'transverse' | 'conflicted' | 'provisional';

/** In batch order, which is also render order. */
const REBAR_CATEGORIES: readonly RebarCategory[] = [
  'longitudinal', 'transverse', 'provisional', 'conflicted',
];

function categoryOf(b: SceneBar): RebarCategory {
  if (b.conflicted) return 'conflicted';
  if (b.provisional) return 'provisional';
  return b.role;
}

/**
 * The family a batch belongs to.
 *
 * `unknown` is a real answer rather than a bucket for mistakes. A bar whose owning member the
 * scene cannot resolve must still be DRAWN — hiding steel because nothing could work out which
 * switch owns it is the silent omission this whole view exists to prevent — and it must answer
 * no family's switch, because folding it into one would let "hide columns" hide steel nobody
 * ever said was a column's.
 */
export type RebarFamily = SceneSolidKind | 'unknown';

/** Every batch family, in build order. Families first, then the unresolved. */
export const REBAR_FAMILIES: readonly RebarFamily[] = [...SCENE_SOLID_KINDS, 'unknown'];

/**
 * How round a conflict marker is.
 *
 * ── Why these numbers, and why they are a named constant ───────────
 *
 * A marker is a DOT. What it has to communicate is where the conflict is and how bad it is, and
 * the second of those is carried by the marker's SIZE — scaled by the shortfall, floored so a 2 mm
 * one is still visible. Its roundness communicates nothing.
 *
 * At 10 × 8 a marker was 140 triangles. The 7-storey building carries 39 240 open conflicts, so the
 * markers alone were 5 493 600 triangles — five and a half times the 1 008 672 the entire
 * reinforcement needs. 6 × 4 is 36 triangles and 1 412 640 in total: the same position, the same
 * radius, the same colour, the same instance matrix, 3,89× less geometry. It reads as a faceted bead
 * at the size a marker is viewed rather than as a smooth ball, which is a fair description of what
 * it is.
 *
 * ── What that bought, measured, and what it did not ────────────────
 *
 * A family switch with the markers on screen, median of three on the E2E runner's software
 * rasteriser:
 *
 *     hide columns   5 412 ms → 2 611 ms
 *     show columns   4 934 ms → 2 610 ms
 *
 * About 1,9×, against 3,89× less geometry — so the triangles were not the whole cost. The rest is
 * fill rate: 39 240 translucent spheres cover the same screen area however few triangles each is
 * made of, and blending them is per-fragment work no tessellation change can reach. Switching the
 * markers themselves is too noisy on this runner to quote a factor for; the benchmark prints its
 * raw samples rather than a conclusion.
 *
 * Named rather than inlined so the benchmark can report what it measured against, and so a future
 * change to it is a change to a documented decision rather than to two digits in a constructor.
 */
export const MARKER_SEGMENTS = { width: 6, height: 4 } as const;

/**
 * Triangles in one marker, counted from the geometry rather than from a formula.
 *
 * A sphere's two polar rings are triangles and the rest are quads, so the arithmetic is
 * `width × (2·height − 2)` — and writing that out here would be a second implementation of
 * something Three already decides. Built once and thrown away; the benchmark reports the number so
 * the reduction is a measurement rather than a claim.
 */
function markerTriangles(): number {
  const g = new THREE.SphereGeometry(1, MARKER_SEGMENTS.width, MARKER_SEGMENTS.height);
  const n = (g.getIndex()?.count ?? 0) / 3;
  g.dispose();
  return n;
}

// ─── Tube geometry ───────────────────────────────────────────────

/**
 * Ring positions and normals along a polyline, using a parallel transport frame.
 *
 * Exported for testing: the frame is the one thing here that can be subtly wrong in a way no
 * screenshot reveals — a twisting tube still looks like a bar.
 */
export function transportFrames(points: readonly THREE.Vector3[]): {
  tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[];
} {
  const n = points.length;
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    // A zero tangent means two coincident samples. Inheriting the previous one keeps the
    // frame continuous rather than producing a NaN ring that renders as a black spike.
    if (t.lengthSq() < 1e-20) t.copy(tangents[i - 1] ?? new THREE.Vector3(1, 0, 0));
    tangents.push(t.normalize());
  }

  // Seed the normal with any axis not parallel to the first tangent.
  const t0 = tangents[0];
  const seed = Math.abs(t0.z) < 0.9
    ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const normals: THREE.Vector3[] = [
    new THREE.Vector3().crossVectors(t0, seed).normalize(),
  ];
  const binormals: THREE.Vector3[] = [
    new THREE.Vector3().crossVectors(t0, normals[0]).normalize(),
  ];

  for (let i = 1; i < n; i++) {
    // Rotate the previous normal by the same rotation that takes t[i-1] to t[i]. Where the
    // tangent does not turn, the normal does not move — which is the property a Frenet frame
    // lacks and the reason a straight run does not spin.
    const prev = tangents[i - 1];
    const cur = tangents[i];
    const axis = new THREE.Vector3().crossVectors(prev, cur);
    const nrm = normals[i - 1].clone();
    if (axis.lengthSq() > 1e-20) {
      axis.normalize();
      const angle = Math.acos(Math.min(1, Math.max(-1, prev.dot(cur))));
      nrm.applyAxisAngle(axis, angle);
    }
    // Re-orthogonalise against the tangent so drift cannot accumulate over a long bar.
    nrm.addScaledVector(cur, -nrm.dot(cur)).normalize();
    normals.push(nrm);
    binormals.push(new THREE.Vector3().crossVectors(cur, nrm).normalize());
  }

  return { tangents, normals, binormals };
}

/**
 * Append one bar's tube to the buffers being accumulated.
 *
 * Returns the number of triangles written, so the caller can record which range of the
 * merged mesh belongs to which bar.
 */
function appendTube(
  points: readonly THREE.Vector3[], radius: number, radial: number,
  pos: number[], nor: number[], idx: number[],
): number {
  const n = points.length;
  if (n < 2) return 0;
  const { normals, binormals } = transportFrames(points);
  const base = pos.length / 3;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a);
      const sy = Math.sin(a);
      const nx = normals[i].x * cx + binormals[i].x * sy;
      const ny = normals[i].y * cx + binormals[i].y * sy;
      const nz = normals[i].z * cx + binormals[i].z * sy;
      pos.push(points[i].x + nx * radius, points[i].y + ny * radius, points[i].z + nz * radius);
      nor.push(nx, ny, nz);
    }
  }

  let tris = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      const a = base + i * radial + j;
      const b = base + i * radial + j1;
      const c = base + (i + 1) * radial + j1;
      const d = base + (i + 1) * radial + j;
      idx.push(a, b, c, a, c, d);
      tris += 2;
    }
  }
  return tris;
}

// ─── Concrete prisms ─────────────────────────────────────────────

/**
 * A prism from a convex base polygon and a sweep vector.
 *
 * Fan-triangulated, which is correct for the convex bases this model produces — rectangular
 * members, rectangular pads, rectangular panels. A concave base would need a real
 * triangulator, and would be silently wrong here; nothing in the detailing engine produces
 * one, and if something ever does, it needs its own case rather than a fan that folds.
 */
function appendPrism(
  base: readonly THREE.Vector3[], extrude: THREE.Vector3,
  pos: number[], nor: number[], idx: number[],
): void {
  const n = base.length;
  if (n < 3) return;
  const top = base.map((p) => p.clone().add(extrude));

  const pushFace = (pts: THREE.Vector3[]) => {
    const a = new THREE.Vector3().subVectors(pts[1], pts[0]);
    const b = new THREE.Vector3().subVectors(pts[2], pts[0]);
    const nv = new THREE.Vector3().crossVectors(a, b).normalize();
    const first = pos.length / 3;
    for (const p of pts) {
      pos.push(p.x, p.y, p.z);
      nor.push(nv.x, nv.y, nv.z);
    }
    for (let i = 1; i < pts.length - 1; i++) idx.push(first, first + i, first + i + 1);
  };

  pushFace([...base].reverse());
  pushFace(top);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pushFace([base[i], base[j], top[j], top[i]]);
  }
}

// ─── The group ───────────────────────────────────────────────────

/** Where a picked triangle came from. */
export interface BarRange { barId: string; firstTri: number; triCount: number }

/** The same, for the concrete batch: which solid a picked triangle belongs to. */
export interface SolidRange { solidId: string; firstTri: number; triCount: number }

/** Binary search over ascending, contiguous triangle ranges. */
function rangeAt<T extends { firstTri: number; triCount: number }>(
  ranges: readonly T[], faceIndex: number,
): T | null {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (faceIndex < r.firstTri) hi = mid - 1;
    else if (faceIndex >= r.firstTri + r.triCount) lo = mid + 1;
    else return r;
  }
  return null;
}

export interface RebarSceneOptions {
  /**
   * Multiplier on the true bar radius.
   *
   * 1 is the truth and is the default. A Ø8 stirrup is 8 mm across in a 6 m beam and reads as
   * a hairline; the option exists so a user can exaggerate to see a cage, and it is an
   * explicit choice rather than a fudge baked into the geometry.
   */
  diameterScale?: number;
  /** Sides per tube. Six reads as round at the scale bars are viewed and costs little. */
  radialSegments?: number;
  /** Draw the concrete. Off gives the bare cage. */
  showConcrete?: boolean;
  /** Draw a marker at each unresolved conflict. */
  showConflicts?: boolean;
  /**
   * Multiplier on the concrete's opacity.
   *
   * 1 keeps the defaults tuned for seeing steel through the shell. The control exists because
   * "how transparent" is genuinely a per-question preference: reading a cage wants it faint,
   * checking that a beam meets a column wants it solid.
   */
  concreteOpacity?: number;
  /**
   * A section plane, as an axis and a position along it in model coordinates.
   *
   * ── Why a plane rather than a box ──────────────────────────────
   *
   * The question a section answers is "what is inside here", and one plane answers it. A
   * clipping BOX adds five more numbers to steer and, in a cage, mostly produces views where
   * the thing you were looking at is outside one of the other faces.
   *
   * Applied through Three's material clipping, so it cuts the merged batches without
   * rebuilding any geometry — which matters because the batches are the whole reason a floor
   * of thousands of bars renders at all.
   */
  section?: { axis: 'x' | 'y' | 'z'; at: number; flip?: boolean };
}

const AXIS_NORMALS = {
  x: new THREE.Vector3(-1, 0, 0),
  y: new THREE.Vector3(0, -1, 0),
  z: new THREE.Vector3(0, 0, -1),
} as const;

function planesFor(section: RebarSceneOptions['section']): THREE.Plane[] {
  if (!section) return [];
  const n = AXIS_NORMALS[section.axis].clone();
  if (section.flip) n.negate();
  // `constant` is the signed distance from the origin along the normal.
  return [new THREE.Plane(n, section.flip ? -section.at : section.at)];
}

/**
 * One merged bar mesh: one family, one colour.
 *
 * `ranges` is the batch's whole population and never changes. `drawn` is the subset currently
 * on screen, and its `firstTri` values are in the coordinates of whatever index the mesh is
 * using at that moment — which is what a picked `faceIndex` is measured in, and therefore what
 * the picking map has to be expressed in.
 */
export interface RebarBarBatch {
  family: RebarFamily;
  category: RebarCategory;
  mesh: THREE.Mesh;
  /** Every bar in the batch, in buffer order, as ranges into the FULL index. */
  ranges: BarRange[];
  /** The bars currently drawn, as ranges into the index the mesh is currently bound to. */
  drawn: BarRange[];
}

/** The same, for concrete: one family, and reinforced or not. */
export interface RebarSolidBatch {
  kind: SceneSolidKind;
  reinforced: boolean;
  mesh: THREE.Mesh;
  ranges: SolidRange[];
  drawn: SolidRange[];
}

/**
 * What is switched on.
 *
 * Separate from `RebarSceneOptions` on purpose: everything here is answered WITHOUT touching a
 * vertex, and everything there changes what the vertices are. Keeping the two apart is what
 * stops a checkbox being wired to a rebuild by accident.
 */
export interface RebarVisibility {
  /**
   * The scene filter, applied as visibility rather than as a smaller scene.
   *
   * The same `SceneFilter` the panel already builds and `filterScene` already interprets, and
   * the predicates used here are `barMatchesFilter` and `solidMatchesFilter` themselves — not a
   * second reading of them. A picture that disagreed with the tally beside it would be worse
   * than a slow one.
   */
  filter?: SceneFilter;
  /** Draw the concrete. Off gives the bare cage. */
  concrete?: boolean;
  /** Draw the conflict markers. */
  conflicts?: boolean;
}

/** What the build produced. Fixed at construction — the whole point is that it does not move. */
export interface RebarSceneStats {
  /** Bars that produced geometry. A degenerate one-point bar is not one of them. */
  tubes: number;
  solids: number;
  /** Triangles in the bar and concrete batches. Markers are counted separately, and why. */
  triangles: number;
  barBatches: number;
  solidBatches: number;
  /** Conflict markers built. One instance each. */
  markers: number;
  /** Triangles in ONE marker, at the current tessellation. */
  markerTriangles: number;
  /**
   * Triangles the markers contribute in total.
   *
   * Reported apart from `triangles` because they are a different kind of cost with a different
   * remedy: the reinforcement's triangles are the thing the view exists to show and cannot be
   * reduced, and a marker's are a rendering choice about a dot.
   */
  markerTrianglesTotal: number;
}

/**
 * What is DRAWN right now, counted per family.
 *
 * ── Why this exists, and why it is not the tally ───────────────────
 *
 * The rail already shows a per-family tally, and it is computed in Svelte from `filterScene`.
 * That is a statement about the FILTER. This is a statement about the SCENE — how many of this
 * family's bars the renderer is currently putting on screen — and the two are not the same
 * observable.
 *
 * They came apart, silently and completely: a defect in the viewport's visibility effect meant
 * the store changed, the filter recomputed, the tally updated, and `mesh.visible` was never
 * touched. Every switch in the rail governed nothing, and every test in the suite was green,
 * because none of them could see this side of the line. A test that asserts a count nobody
 * renders from is a test that passes while the feature is dead.
 *
 * Zero-filled over every family the build could produce, so "this family has nothing on screen"
 * is the number 0 rather than an absent key — a caller comparing before and after must not have
 * to distinguish those two.
 */
export interface RebarSceneCensus {
  /** Bars drawn, per family. */
  bars: Record<RebarFamily, number>;
  /** Concrete solids drawn, per family. */
  solids: Record<SceneSolidKind, number>;
  /** Conflict markers on screen. */
  markers: number;
  /** Triangles drawn, bars and concrete together. */
  triangles: number;
  /** Meshes a raycast would consider — what is selectable. */
  pickable: number;
}

export interface RebarScene {
  group: THREE.Group;
  /** Merged bar meshes, by family and colour, with the map back to individual bars. */
  bars: RebarBarBatch[];
  /** Merged concrete meshes, by family, with the map back to individual solids. */
  solids: RebarSolidBatch[];
  /** The conflict markers, or null when the document has no open conflict. */
  markers: THREE.InstancedMesh | null;
  stats: RebarSceneStats;
  /**
   * Which conflict is drawn in a marker slot, or null when that slot is not drawn.
   *
   * The compaction MOVES markers between slots — slot 0 is not conflict 0 once a filter is on —
   * so "the marker I clicked is the conflict I think it is" is a property that has to be
   * resolved through this map rather than assumed from an index. It is what
   * `pickableConflicts()` exists to be used with.
   */
  conflictAt(instanceIndex: number): SceneConflictMarker | null;
  /**
   * The marker mesh, when there is one to pick.
   *
   * Separate from `pickable()` on purpose, and this is not tidiness. Markers are small spheres
   * sitting INSIDE the cage, at exactly the places where bars are densest. Putting them in the
   * same list would make every hit list start with a marker and would take clicks away from the
   * bars around them — the picker resolves bars, then concrete, and a marker that won by
   * distance would be a bar the user could no longer select.
   *
   * So the caller raycasts markers FIRST and separately, and treats a marker hit as a
   * deliberate act: a marker is a thing the app put there to be clicked, and a click within its
   * radius means the conflict, not the steel behind it.
   */
  pickableConflicts(): THREE.InstancedMesh[];
  /** Which bar a raycast hit, or null when the hit was concrete or a marker. */
  barIdAt(mesh: THREE.Object3D, faceIndex: number | undefined): string | null;
  /**
   * Which concrete solid a raycast hit.
   *
   * Concrete is pickable for the same reason bars are: the user's question is usually about
   * a MEMBER — what is this beam, why has it no steel — and requiring them to hit a 16 mm
   * tube to ask it makes the members with no steel the hardest ones to interrogate. Which
   * are, of course, exactly the ones they need to interrogate.
   */
  solidIdAt(mesh: THREE.Object3D, faceIndex: number | undefined): string | null;
  /** Every mesh a raycast should consider, bars and concrete alike. */
  pickable(): THREE.Mesh[];
  /**
   * Change the concrete's opacity without touching a vertex.
   *
   * ── Why this is not a rebuild ──────────────────────────────────
   *
   * Opacity is a MATERIAL property. Dragging the slider used to re-tube all 20 917 bars and
   * re-prism every solid — measured at 1,6 s per step on the 7-storey building — to arrive at
   * geometry identical to the one already on the GPU. Nothing about where the steel is
   * depends on how see-through the concrete is.
   */
  setConcreteOpacity(scale: number): void;
  /**
   * Move or clear the section plane without touching a vertex.
   *
   * Clipping is done by the material against a plane, so a section is a plane swap. Rebuilding
   * for it cost the same 1,6 s and produced the same buffers.
   */
  setSection(section: RebarSceneOptions['section']): void;
  /**
   * Show and hide, without touching a vertex.
   *
   * ── What this replaces ─────────────────────────────────────────
   *
   * Handing the renderer a filtered scene. `filterScene` returns a new object, the signature of
   * a smaller scene differs, and the viewport therefore re-tubed all 20 917 bars to answer a
   * layer switch — 5,9 s for columns, up to 16,7 s for slabs, measured on the 7-storey building.
   *
   * A family switch is now `mesh.visible` on the batches of that family: no sampling, no
   * allocation, no picking map. An isolate or a status filter cuts across batches, so it is
   * answered by compacting each batch's INDEX from a master copy — the tubes themselves are
   * never rebuilt, and the picking map is re-expressed rather than recomputed.
   *
   * Idempotent, and safe to call on every reactive touch: absent fields keep their current
   * value, so this is not a way to accidentally clear a filter.
   */
  setVisibility(next: RebarVisibility): void;
  /** What is currently shown. The renderer's own state, for the caller that needs to read it. */
  visibility(): Required<RebarVisibility>;
  /** Triangles currently drawn, bars and concrete together. Zero when everything is off. */
  drawnTriangles(): number;
  /** What is on screen, per family. See `RebarSceneCensus` for why this is not the tally. */
  census(): RebarSceneCensus;
  dispose(): void;
}

/**
 * The scene the open workspace is currently rendering, or null when none is.
 *
 * ── Why a module-level handle ──────────────────────────────────────
 *
 * So a browser test can ask the RENDERER what it is drawing, rather than asking the panel what
 * it has filtered. There is exactly one 3-D workspace at a time — it is a full-window overlay —
 * so one handle is the whole truth, and the viewport clears it on teardown so a closed workspace
 * cannot answer for a scene that no longer exists.
 *
 * Read-only from the outside: `census()` allocates a fresh object and no caller can reach the
 * meshes through it.
 */
let liveScene: RebarScene | null = null;

/** Called by the viewport when it builds a scene, and with null when it tears one down. */
export function setLiveRebarScene(scene: RebarScene | null): void {
  liveScene = scene;
}

/** What the open workspace is drawing, per family. Null when no workspace is open. */
export function liveRebarSceneCensus(): RebarSceneCensus | null {
  return liveScene?.census() ?? null;
}

/**
 * The conflict drawn in a marker slot of the open scene, for TEST HOOKS only.
 *
 * Read-only and allocation-free, exactly parallel to `liveRebarSceneCensus` above and for the
 * same reason: `e2e-hooks.ts` cannot reach `liveScene`, and the alternative is a test that
 * rebuilds the marker list and asserts against its own copy rather than against what is drawn.
 *
 * `conflictAt` resolves the SLOT, not an index into the document's conflicts — the compaction
 * moves markers between slots when a filter is on — so a caller asking for slot 0 gets whatever
 * is actually drawn there, which is what a click would have hit.
 *
 * Nothing in the application calls this.
 */
export function liveRebarSceneConflictAt(slot: number): SceneConflictMarker | null {
  return liveScene?.conflictAt(slot) ?? null;
}

const DEFAULTS = { diameterScale: 1, radialSegments: 6 };

/**
 * How many times tubes have been built in this page.
 *
 * ── Why a counter and not a timing ─────────────────────────────────
 *
 * Because the claim being made is "a layer switch does not rebuild the geometry", and a timing
 * only ever shows that it was fast on the machine that ran it. This is the property itself: the
 * number must not move when a checkbox does. It is what lets a browser test assert the fix rather
 * than infer it from a stopwatch, which is how a latency regression gets explained away as a busy
 * CI runner.
 *
 * Monotonic and process-wide, so a caller reads it before and after and compares.
 */
let builds = 0;

export function rebarSceneBuilds(): number {
  return builds;
}

/**
 * A batch's index buffer, in two states.
 *
 * `full` is built once and never written to again — it is the master every subset is copied out
 * of. `scratch` is allocated only if a subset is ever actually asked for, so the common case
 * (every bar in the batch drawn, or the whole batch hidden) costs no extra memory at all.
 *
 * Swapping which of the two the geometry uses is how a subset is drawn. Three keeps its GPU
 * buffer per ATTRIBUTE object, so swapping back and forth reuses both uploads rather than
 * re-uploading either.
 */
interface IndexState {
  full: THREE.BufferAttribute;
  scratch: THREE.BufferAttribute | null;
  /** True when `full` is bound and the entire batch is drawn. */
  whole: boolean;
}

/** A batch plus what it needs to answer a per-item filter without a lookup. */
interface BarBatchInternal extends RebarBarBatch {
  /** The bars behind `ranges`, index-aligned. */
  items: SceneBar[];
  index: IndexState;
}

interface SolidBatchInternal extends RebarSolidBatch {
  items: SceneSolid[];
  index: IndexState;
}

/** Bind the whole batch. Cheap and idempotent: no copy, just which attribute is in use. */
function bindWhole(mesh: THREE.Mesh, st: IndexState): void {
  if (st.whole) return;
  mesh.geometry.setIndex(st.full);
  mesh.geometry.setDrawRange(0, Infinity);
  st.whole = true;
}

/**
 * Draw only the items a predicate keeps, and say where each of them landed.
 *
 * ── Why the index and not the vertices ─────────────────────────────
 *
 * Because the vertices are correct already. An isolate does not change where a bar is, only
 * whether you are looking at it, so the work is choosing which of the triangles already on the
 * GPU to draw. One typed-array copy out of a master that never changes replaces re-sampling
 * every polyline, re-running every transport frame and re-emitting every ring.
 *
 * Returns the drawn ranges re-expressed in the compacted index's coordinates, because that is
 * what a picked `faceIndex` will be measured in. Getting this wrong does not look wrong — it
 * reports the neighbouring bar's mark, which is the kind of defect that ships.
 */
function drawSubset<T extends { firstTri: number; triCount: number }>(
  mesh: THREE.Mesh, st: IndexState, ranges: T[], keep: (i: number) => boolean,
): T[] {
  let all = true;
  for (let i = 0; i < ranges.length; i++) {
    if (!keep(i)) { all = false; break; }
  }
  if (all) {
    bindWhole(mesh, st);
    return ranges;
  }

  const src = st.full.array as Uint16Array | Uint32Array;
  if (!st.scratch) {
    const room = src instanceof Uint32Array
      ? new Uint32Array(src.length) : new Uint16Array(src.length);
    st.scratch = new THREE.BufferAttribute(room, 1);
    // Rewritten on every filter change, so the driver is told to expect that rather than
    // treating each rewrite as a surprise.
    st.scratch.setUsage(THREE.DynamicDrawUsage);
  }
  const dst = st.scratch.array as Uint16Array | Uint32Array;

  const drawn: T[] = [];
  let tri = 0;
  for (let i = 0; i < ranges.length; i++) {
    if (!keep(i)) continue;
    const r = ranges[i];
    dst.set(src.subarray(r.firstTri * 3, (r.firstTri + r.triCount) * 3), tri * 3);
    drawn.push({ ...r, firstTri: tri });
    tri += r.triCount;
  }

  st.scratch.needsUpdate = true;
  mesh.geometry.setIndex(st.scratch);
  mesh.geometry.setDrawRange(0, tri * 3);
  st.whole = false;
  return drawn;
}

/**
 * Whether a filter can be answered by batch visibility alone.
 *
 * `hideBars` and `solidKinds` are properties of a whole batch: a batch is one family, so either
 * every bar in it passes those two or none does. Everything else — an assembly, a role, a layer,
 * a conflict, an isolated member, a floor family — cuts ACROSS a batch and needs the index
 * compacted.
 *
 * Note the `!== undefined` rather than a truthiness test: an EMPTY array is a real restriction
 * that matches nothing, and reading it as "no restriction" is how a filter UI shows the whole
 * floor the moment the user deselects the last item.
 */
function needsPerBar(f: SceneFilter): boolean {
  return f.assemblyIds !== undefined || f.roles !== undefined || f.layerIds !== undefined
    || f.families !== undefined || f.elementIds !== undefined || f.conflictedOnly === true;
}

/** The same question for concrete: `solidKinds` and `hideUnreinforced` are both batch keys. */
function needsPerSolid(f: SceneFilter): boolean {
  return f.assemblyIds !== undefined || f.elementIds !== undefined;
}

/**
 * The batch-level half of `barMatchesFilter`, for one family.
 *
 * A batch is one family, so `hideBars` and `solidKinds` are decided for the whole of it at once.
 * A family that could not be resolved answers no family switch, which is `barMatchesFilter`'s own
 * rule for a bar whose kind is undefined — stated once here so the batch loop and the conflict
 * markers cannot form two versions of it.
 */
function familyVisible(
  family: RebarFamily, f: SceneFilter, kinds: ReadonlySet<SceneSolidKind> | null,
): boolean {
  if (f.hideBars === true) return false;
  if (kinds === null || family === 'unknown') return true;
  return kinds.has(family);
}

export function createRebarScene(
  scene: SceneModel, options: RebarSceneOptions = {},
): RebarScene {
  builds += 1;
  const radial = Math.max(3, options.radialSegments ?? DEFAULTS.radialSegments);
  const scale = options.diameterScale ?? DEFAULTS.diameterScale;
  const group = new THREE.Group();
  group.name = 'rebar-scene';
  const clippingPlanes = planesFor(options.section);

  /**
   * Which family owns each bar, resolved against the WHOLE model.
   *
   * `kindByElement` is the same map `filterScene` and `summariseScene` build, from the same
   * function, so the batch a bar lands in and the family the tally counts it under cannot
   * disagree. `ownerScope` inside `barSolidKind` is what keeps a slab bar out of a column's
   * batch when their numbers collide — 11 340 slab bars and 234 wall bars were once counted as
   * column steel through exactly that collision.
   */
  const kindOfElement = kindByElement(scene.solids);

  const byBatch = new Map<string, SceneBar[]>();
  for (const b of scene.bars) {
    const family = barSolidKind(b, kindOfElement) ?? 'unknown';
    const key = `${family}:${categoryOf(b)}`;
    const list = byBatch.get(key);
    if (list) list.push(b); else byBatch.set(key, [b]);
  }

  const bars: BarBatchInternal[] = [];
  const solidMeshes: SolidBatchInternal[] = [];
  const disposables: Array<{ dispose(): void }> = [];
  let triangles = 0;

  // Emitted in a canonical order rather than in encounter order, so two runs over the same
  // document produce the same batches in the same sequence — which is what makes the picking
  // maps and the tests comparable at all.
  for (const family of REBAR_FAMILIES) {
    for (const category of REBAR_CATEGORIES) {
      const list = byBatch.get(`${family}:${category}`);
      if (!list) continue;

      const pos: number[] = [];
      const nor: number[] = [];
      const idx: number[] = [];
      const ranges: BarRange[] = [];
      const items: SceneBar[] = [];
      let tri = 0;

      for (const b of list) {
        const pts = b.polyline.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        const written = appendTube(pts, (b.diameterMm / 2000) * scale, radial, pos, nor, idx);
        if (written === 0) continue;
        ranges.push({ barId: b.barId, firstTri: tri, triCount: written });
        items.push(b);
        tri += written;
      }
      if (ranges.length === 0) continue;

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geom.setIndex(idx);
      geom.computeBoundingSphere();

      const mat = new THREE.MeshStandardMaterial({
        color: REBAR_COLORS[category], roughness: 0.55, metalness: 0.35,
        clippingPlanes, clipShadows: true,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = `rebar-${family}-${category}`;
      mesh.userData.rebarFamily = family;
      mesh.userData.rebarCategory = category;
      group.add(mesh);
      disposables.push(geom, mat);
      triangles += tri;
      bars.push({
        family, category, mesh, ranges, drawn: ranges, items,
        index: { full: geom.getIndex()!, scratch: null, whole: true },
      });
    }
  }

  /**
   * Concrete, batched by family AND by whether it has steel in it.
   *
   * Split by `reinforced` so the unreinforced members can carry their own colour and a higher
   * opacity: they are the exception the user needs to see, and a translucent grey
   * indistinguishable from every other member would bury them again.
   *
   * Split by family for the same reason the bars are — so "hide slabs" is a visibility flag and
   * not a reason to re-prism every solid in the model.
   */
  if (options.showConcrete !== false && scene.solids.length > 0) {
    for (const kind of SCENE_SOLID_KINDS) {
      for (const reinforced of [true, false]) {
        const subset = (scene.solids as SceneSolid[])
          .filter((s) => s.kind === kind && s.reinforced === reinforced);
        if (subset.length === 0) continue;

        const pos: number[] = [];
        const nor: number[] = [];
        const idx: number[] = [];
        const ranges: SolidRange[] = [];
        const items: SceneSolid[] = [];
        let tri = 0;
        for (const s of subset) {
          const before = idx.length / 3;
          appendPrism(
            s.base.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
            new THREE.Vector3(s.extrude.x, s.extrude.y, s.extrude.z),
            pos, nor, idx);
          const written = idx.length / 3 - before;
          if (written === 0) continue;
          ranges.push({ solidId: s.id, firstTri: tri, triCount: written });
          items.push(s);
          tri += written;
        }
        if (pos.length === 0) continue;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geom.setIndex(idx);
        geom.computeBoundingSphere();
        const mat = new THREE.MeshStandardMaterial({
          color: reinforced ? REBAR_COLORS.concrete : REBAR_COLORS.unreinforced,
          // Translucent and not depth-writing, because the entire point of this view is to see
          // the steel THROUGH the concrete. Opaque concrete would hide the feature.
          transparent: true,
          // Clamped below 1: fully opaque concrete would hide the reinforcement, which is the
          // one thing this view exists to show.
          opacity: Math.min(0.92, (reinforced ? 0.22 : 0.45) * (options.concreteOpacity ?? 1)),
          depthWrite: false,
          side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
          clippingPlanes,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = reinforced
          ? `rebar-concrete-${kind}` : `rebar-concrete-${kind}-unreinforced`;
        mesh.renderOrder = 1;
        group.add(mesh);
        disposables.push(geom, mat);
        triangles += tri;
        solidMeshes.push({
          kind, reinforced, mesh, ranges, drawn: ranges, items,
          index: { full: geom.getIndex()!, scratch: null, whole: true },
        });
      }
    }
  }

  // ── Conflict markers ──────────────────────────────────────────
  let markers: THREE.InstancedMesh | null = null;
  /**
   * The markers' own matrices, kept so a filter can hide some of them and put them back.
   *
   * An `InstancedMesh` draws its first `count` instances, so showing a subset means compacting
   * the matrix buffer — and compacting in place destroys the original. This is the master, the
   * same role the full index plays for the batches.
   */
  let markerMatrices: Float32Array | null = null;
  /** Whether the live instance buffer has been moved away from the master. */
  let markersCompacted = false;
  /**
   * Which conflict is drawn in each instance slot.
   *
   * The compaction moves markers around, so slot 0 is not conflict 0 once a filter is on. This is
   * the map back — the marker equivalent of `BarRange`, and the piece that would be needed the day
   * a marker becomes clickable. Written into a pre-allocated array so a toggle allocates nothing.
   */
  const drawnConflictOf = new Int32Array(scene.conflicts.length);
  let drawnConflictCount = 0;

  if (options.showConflicts !== false && scene.conflicts.length > 0) {
    const geom = new THREE.SphereGeometry(
      1, MARKER_SEGMENTS.width, MARKER_SEGMENTS.height);
    const mat = new THREE.MeshBasicMaterial({
      color: REBAR_COLORS.conflictMarker, transparent: true, opacity: 0.75,
    });
    const marks = new THREE.InstancedMesh(geom, mat, scene.conflicts.length);
    marks.name = 'rebar-conflicts';
    const m = new THREE.Matrix4();
    scene.conflicts.forEach((c, i) => {
      /**
       * Sized by the shortfall, floored so a marker is always visible.
       *
       * A 2 mm interpenetration and a 40 mm one are different problems, and a fixed-size dot
       * says they are the same. The floor exists because a marker scaled to a real 2 mm
       * shortfall is invisible, and an invisible warning is not a warning.
       */
      const shortfall = Math.max(0, c.required - c.clearance);
      const r = Math.max(0.02, Math.min(0.12, shortfall * 1.5));
      m.makeScale(r, r, r).setPosition(c.at.x, c.at.y, c.at.z);
      marks.setMatrixAt(i, m);
    });
    marks.instanceMatrix.needsUpdate = true;
    marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(marks);
    disposables.push(geom, mat);
    markers = marks;
    markerMatrices = (marks.instanceMatrix.array as Float32Array).slice();
  }

  /**
   * A conflict is drawn while EITHER of the bars it names is drawn.
   *
   * The same rule `filterScene` applies. A marker for a conflict between two hidden bars is a
   * warning about something the user is not looking at; a marker whose other bar is hidden is
   * still about the bar in front of them, and dropping it would silently downgrade a conflicted
   * cage to a clean one.
   *
   * ── Why the two bars are resolved ONCE ─────────────────────────
   *
   * The 7-storey building carries 39 240 open conflicts. Looking each one's bars up by id on every
   * switch, and running the full filter predicate over them, made the conflict markers the only
   * part of a family toggle that scaled with the model — measured at 0,9–2,5 ms per switch, which
   * is most of a switch that should be a handful of flags. Resolved here, the switch reads two
   * pre-computed families and a set.
   */
  const barById = scene.conflicts.length > 0
    ? new Map(scene.bars.map((b) => [b.barId, b] as const)) : null;
  const familyOfBar = (x: SceneBar | undefined): RebarFamily | null =>
    (x ? barSolidKind(x, kindOfElement) ?? 'unknown' : null);
  const conflictRefs = barById
    ? scene.conflicts.map((c) => {
      const a = barById.get(c.barIds[0]);
      const b = barById.get(c.barIds[1]);
      return { a, b, fa: familyOfBar(a), fb: familyOfBar(b) };
    })
    : [];

  // ── Visibility ────────────────────────────────────────────────
  const shown: Required<RebarVisibility> = {
    filter: {},
    concrete: options.showConcrete !== false,
    conflicts: options.showConflicts !== false,
  };

  function applyVisibility(): void {
    const f = shown.filter;
    const perBar = needsPerBar(f);
    // A set rather than the array's own `includes`, because this is consulted once per batch and
    // once per conflict, and there are 39 240 conflicts in the building this was measured on.
    const kinds = f.solidKinds === undefined ? null : new Set(f.solidKinds);

    for (const batch of bars) {
      const on = familyVisible(batch.family, f, kinds);
      batch.mesh.visible = on;
      if (!on) {
        // Nothing is drawn, so nothing can be picked. The index is left alone: rebinding a
        // buffer nobody is going to draw is work for its own sake.
        batch.drawn = [];
        continue;
      }
      if (perBar) {
        batch.drawn = drawSubset(batch.mesh, batch.index, batch.ranges,
          (i) => barMatchesFilter(batch.items[i], f, kindOfElement));
      } else {
        bindWhole(batch.mesh, batch.index);
        batch.drawn = batch.ranges;
      }
    }

    const perSolid = needsPerSolid(f);
    for (const batch of solidMeshes) {
      const on = shown.concrete
        && (kinds === null || kinds.has(batch.kind))
        && (f.hideUnreinforced !== true || batch.reinforced);
      batch.mesh.visible = on;
      if (!on) {
        batch.drawn = [];
        continue;
      }
      if (perSolid) {
        batch.drawn = drawSubset(batch.mesh, batch.index, batch.ranges,
          (i) => solidMatchesFilter(batch.items[i], f));
      } else {
        bindWhole(batch.mesh, batch.index);
        batch.drawn = batch.ranges;
      }
    }

    if (markers && markerMatrices) {
      const src = markerMatrices;
      const dst = markers.instanceMatrix.array as Float32Array;
      /**
       * Put the master back before compacting again.
       *
       * A compaction moves a later marker's matrix into an earlier slot, so the live buffer no
       * longer matches the master. The next pass would then compact ALREADY MOVED matrices and
       * place markers where no conflict is. Restoring first costs one copy and only when leaving a
       * compacted state; not restoring costs correctness, silently.
       */
      let touched = false;
      if (markersCompacted) {
        dst.set(src);
        markersCompacted = false;
        touched = true;
      }
      let n = 0;
      for (let i = 0; i < conflictRefs.length; i++) {
        const r = conflictRefs[i];
        /**
         * The cheap reading when the filter is family-shaped, the exact one when it is not.
         *
         * With no per-bar axis in the filter, a bar's visibility IS its family's, so two
         * pre-computed families and a set answer it. Otherwise the full predicate runs — 39 240
         * of them is real work, but an isolate is a deliberate, occasional gesture and being
         * right about which conflicts it leaves on screen matters more than being fast at it.
         */
        const visible = perBar
          ? (r.a !== undefined && barMatchesFilter(r.a, f, kindOfElement))
            || (r.b !== undefined && barMatchesFilter(r.b, f, kindOfElement))
          : (r.fa !== null && familyVisible(r.fa, f, kinds))
            || (r.fb !== null && familyVisible(r.fb, f, kinds));
        if (!visible) continue;
        if (n !== i) {
          dst.set(src.subarray(i * 16, i * 16 + 16), n * 16);
          markersCompacted = true;
          touched = true;
        }
        // Which conflict this slot now holds. The matrix moved; the identity must move with it.
        drawnConflictOf[n] = i;
        n += 1;
      }
      drawnConflictCount = n;
      // Re-uploading 39 240 matrices that did not move is the kind of work that turns a flag into
      // a frame. `count` alone is enough when nothing was rewritten.
      if (touched) markers.instanceMatrix.needsUpdate = true;
      markers.count = n;
      markers.visible = shown.conflicts && n > 0;
    }
  }

  /**
   * Applied once here, so the state on screen is DERIVED rather than coincidental.
   *
   * Every default happens to already be correct — meshes start visible, `drawn` starts as the whole
   * population, an instanced mesh starts drawing every instance — and relying on that coincidence is
   * how the initial frame comes to disagree with every frame after it the day one default changes.
   */
  applyVisibility();

  // Counted once, not twice: `markerTriangles` builds a throwaway sphere to ask Three rather than
  // to reimplement its arithmetic, and doing that per field would build two of them.
  const perMarker = markerTriangles();
  const markerCount = markers?.instanceMatrix.count ?? 0;

  return {
    group,
    bars,
    solids: solidMeshes,
    markers,
    stats: {
      tubes: bars.reduce((n, b) => n + b.ranges.length, 0),
      solids: solidMeshes.reduce((n, s) => n + s.ranges.length, 0),
      triangles,
      barBatches: bars.length,
      solidBatches: solidMeshes.length,
      markers: markerCount,
      markerTriangles: perMarker,
      markerTrianglesTotal: perMarker * markerCount,
    },
    /**
     * Which conflict a drawn marker slot holds.
     *
     * Null past the drawn count, rather than the conflict that used to be there: an instance beyond
     * `count` is not on screen, and reporting its former occupant would be the marker version of a
     * picking map returning the neighbouring bar.
     */
    conflictAt(instanceIndex) {
      if (instanceIndex < 0 || instanceIndex >= drawnConflictCount) return null;
      return scene.conflicts[drawnConflictOf[instanceIndex]] ?? null;
    },
    /**
     * Which bar a picked triangle belongs to.
     *
     * Resolved against `drawn`, not against `ranges`. When a filter has compacted the index the
     * two differ, and a `faceIndex` the raycaster measured in the compacted index looked up in
     * the full one returns the wrong bar — which does not look wrong, it reports the neighbour's
     * mark.
     */
    barIdAt(mesh, faceIndex) {
      if (faceIndex === undefined) return null;
      const entry = bars.find((b) => b.mesh === mesh);
      return entry ? rangeAt(entry.drawn, faceIndex)?.barId ?? null : null;
    },
    solidIdAt(mesh, faceIndex) {
      if (faceIndex === undefined) return null;
      const entry = solidMeshes.find((s) => s.mesh === mesh);
      return entry ? rangeAt(entry.drawn, faceIndex)?.solidId ?? null : null;
    },
    /**
     * Bars first, then concrete.
     *
     * The raycaster returns hits sorted by distance, so ordering here does not decide what
     * wins — but the caller resolves a hit by asking the bar map first, and a bar inside
     * translucent concrete must be selectable THROUGH it. Listing both is what makes that
     * possible; leaving the concrete out is what made members with no steel unpickable.
     */
    pickable() {
      /**
       * Only what is actually drawn.
       *
       * A hidden batch is excluded rather than left to the raycaster, for two reasons. The
       * cheap one: a merged batch is millions of triangles and testing a ray against steel
       * nobody can see is the largest avoidable cost in a click. The correctness one:
       * `Mesh.raycast` does not consult `visible`, so leaving them in would let a click select a
       * bar the user has switched off — and then focus the camera on it.
       */
      return [
        ...bars.filter((b) => b.mesh.visible && b.drawn.length > 0).map((b) => b.mesh),
        ...solidMeshes.filter((s) => s.mesh.visible && s.drawn.length > 0).map((s) => s.mesh),
      ];
    },
    /**
     * The marker mesh, only while it is actually on screen.
     *
     * Same rule as `pickable()`, and for the same correctness reason: `Mesh.raycast` does not
     * consult `visible`, so a hidden marker left in the list would let a click select a
     * conflict the user has switched off — and then centre the camera on it.
     *
     * `markers.count` is the compacted count, and `InstancedMesh.raycast` respects it, so a
     * filtered-out marker cannot be hit even though its matrix is still in the buffer.
     */
    pickableConflicts() {
      return markers && markers.visible && markers.count > 0 ? [markers] : [];
    },
    setVisibility(next) {
      if (next.filter !== undefined) shown.filter = next.filter;
      if (next.concrete !== undefined) shown.concrete = next.concrete;
      if (next.conflicts !== undefined) shown.conflicts = next.conflicts;
      applyVisibility();
    },
    visibility() {
      return { ...shown };
    },
    drawnTriangles() {
      let n = 0;
      for (const b of bars) if (b.mesh.visible) for (const r of b.drawn) n += r.triCount;
      for (const s of solidMeshes) if (s.mesh.visible) for (const r of s.drawn) n += r.triCount;
      return n;
    },
    census() {
      const barsBy = Object.fromEntries(
        REBAR_FAMILIES.map((f) => [f, 0])) as Record<RebarFamily, number>;
      const solidsBy = Object.fromEntries(
        SCENE_SOLID_KINDS.map((k) => [k, 0])) as Record<SceneSolidKind, number>;
      let triangles = 0;
      // `visible` AND `drawn`: a batch switched off keeps its ranges, and counting those would
      // report steel that is not on screen — which is precisely the lie this census exists to
      // make impossible.
      for (const b of bars) {
        if (!b.mesh.visible) continue;
        barsBy[b.family] += b.drawn.length;
        for (const r of b.drawn) triangles += r.triCount;
      }
      for (const s of solidMeshes) {
        if (!s.mesh.visible) continue;
        solidsBy[s.kind] += s.drawn.length;
        for (const r of s.drawn) triangles += r.triCount;
      }
      // Counted rather than read off `pickable()`, so a caller who has destructured this method
      // off the scene still gets an answer.
      const pickable = bars.filter((b) => b.mesh.visible && b.drawn.length > 0).length
        + solidMeshes.filter((s) => s.mesh.visible && s.drawn.length > 0).length;
      return {
        bars: barsBy,
        solids: solidsBy,
        markers: markers && markers.visible ? markers.count : 0,
        triangles,
        pickable,
      };
    },
    setConcreteOpacity(scale) {
      for (const { reinforced, mesh } of solidMeshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        // Same clamp the builder applies: fully opaque concrete would hide the reinforcement,
        // which is the one thing this view exists to show.
        mat.opacity = Math.min(0.92, (reinforced ? 0.22 : 0.45) * scale);
        mat.needsUpdate = true;
      }
    },
    setSection(section) {
      const planes = planesFor(section);
      for (const { mesh } of [...bars, ...solidMeshes]) {
        const mat = mesh.material as THREE.Material;
        mat.clippingPlanes = planes;
        mat.needsUpdate = true;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}

/**
 * The extent of ONE member, for centring the camera on it.
 *
 * Returns null when the member is not in the scene — which is a real answer, not a failure:
 * the user may have filtered it out, and the caller should leave the camera alone rather than
 * fly it to the origin.
 *
 * ── Why the filter is an argument ──────────────────────────────────
 *
 * Because the renderer now holds the WHOLE model and answers the layer switches with visibility,
 * so "is this member on screen" is no longer answerable from the scene alone. Without the filter
 * this would happily frame a member the user has hidden, and the panel — which reports the
 * camera's destination from this function's RETURN — would then claim a move to something
 * invisible. Absent means "no restriction", which is what a caller with no filter means.
 */
export function elementExtent(
  scene: SceneModel, elementId: number, filter?: SceneFilter,
): { min: THREE.Vector3; max: THREE.Vector3 } | null {
  const kindOfElement = filter ? kindByElement(scene.solids) : null;
  let min: THREE.Vector3 | null = null;
  let max: THREE.Vector3 | null = null;
  const eat = (p: { x: number; y: number; z: number }) => {
    if (!min || !max) {
      min = new THREE.Vector3(p.x, p.y, p.z);
      max = new THREE.Vector3(p.x, p.y, p.z);
      return;
    }
    min.min(new THREE.Vector3(p.x, p.y, p.z));
    max.max(new THREE.Vector3(p.x, p.y, p.z));
  };

  for (const s of scene.solids) {
    if (!s.elementIds.includes(elementId)) continue;
    if (filter && !solidMatchesFilter(s, filter)) continue;
    for (const p of s.base) {
      eat(p);
      eat({ x: p.x + s.extrude.x, y: p.y + s.extrude.y, z: p.z + s.extrude.z });
    }
  }
  for (const b of scene.bars) {
    if (!b.elementIds.includes(elementId)) continue;
    if (filter && kindOfElement && !barMatchesFilter(b, filter, kindOfElement)) continue;
    for (const p of b.polyline) eat(p);
  }
  return min && max ? { min, max } : null;
}

/** A framing for an arbitrary extent, shared by the whole-scene and per-member cases. */
export function frameExtent(
  extent: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null,
  fovDeg = 50, aspect = 1,
): { centre: THREE.Vector3; distance: number } | null {
  if (!extent) return null;
  const { min, max } = extent;
  const centre = new THREE.Vector3(
    (min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 0.5);

  const halfV = (fovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * Math.max(aspect, 1e-6));
  const distance = (span / 2) / Math.tan(Math.min(halfV, halfH)) * 1.35;
  return { centre, distance };
}
