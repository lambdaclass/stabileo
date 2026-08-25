/**
 * Project a generated topology onto a plane, for the preview drawing.
 *
 * ── Why this is a pure module and not markup ────────────────────────
 *
 * Because the preview is the one part of the generator surface that can lie. The counts
 * already come from the same object Generate emits, so they cannot; a drawing built by ad-hoc
 * arithmetic inside a template can, and the failure mode is a picture that looks plausible
 * for geometry that is not what will be built. Projecting here means the projection is
 * testable: the elevation view can be checked against known coordinates, and the isometric
 * one against the invariants an axonometric projection has to satisfy.
 *
 * ── Two views, because the reference workflow needs both ────────────
 *
 * `elevation` is the frame seen along the building — the view an engineer sizes a truss in.
 * `isometric` is the whole assembly, which is the only way to see that six frames were
 * placed and tied rather than one.
 *
 * Pure: no store, no runes, no i18n, no DOM.
 */

import type { MemberRole } from './member-roles';
import type { GenSupport, Topology } from './truss-topology';

export type PreviewView = 'elevation' | 'isometric';

/** A member, projected. Screen coordinates, y growing downward as SVG expects. */
export interface PreviewSegment {
  role: MemberRole;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Depth for painter ordering in the isometric view; 0 in elevation. */
  depth: number;
}

export interface PreviewPoint {
  x: number;
  y: number;
  depth: number;
}

export interface PreviewSupport extends PreviewPoint {
  type: GenSupport['type'];
}

export interface Projection {
  segments: PreviewSegment[];
  nodes: PreviewPoint[];
  supports: PreviewSupport[];
  /** Footprint outline in the isometric view; empty in elevation. */
  footprint: PreviewPoint[];
  /** SVG viewBox covering everything, with margin. */
  viewBox: { x: number; y: number; w: number; h: number };
}

/** Isometric half-angle. 30° is the axonometric everybody reads without thinking. */
const ISO = Math.PI / 6;
const COS_ISO = Math.cos(ISO);
const SIN_ISO = Math.sin(ISO);

/**
 * World → screen.
 *
 * Elevation drops Y entirely: a generated frame lives at one Y, and for a shed the caller
 * passes the single frame rather than the building. Both views negate Z, because SVG counts
 * downward and structures do not.
 */
function project(view: PreviewView, x: number, y: number, z: number): PreviewPoint {
  if (view === 'elevation') return { x, y: -z, depth: 0 };
  return {
    x: (x - y) * COS_ISO,
    y: (x + y) * SIN_ISO - z,
    // Further from the viewer = drawn first. `x + y` increases away from the near corner.
    depth: x + y,
  };
}

export interface ProjectOptions {
  view: PreviewView;
  /** Fraction of the larger dimension added as margin. */
  marginFraction?: number;
  /** Draw the building footprint. Isometric only; ignored otherwise. */
  footprint?: { spanM: number; lengthM: number };
}

/**
 * Project a topology.
 *
 * Returns a `viewBox` that already fits the content, so the caller never computes a scale.
 * A degenerate topology — one node, or every node coincident — still gets a usable box
 * rather than a zero-width one that renders as nothing.
 */
export function projectTopology(t: Topology, opts: ProjectOptions): Projection {
  const view = opts.view;
  const pts = t.nodes.map((n) => project(view, n.x, n.y, n.z));

  const segments: PreviewSegment[] = t.members.map((m) => {
    const a = pts[m.a];
    const b = pts[m.b];
    return {
      role: m.role,
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      depth: (a.depth + b.depth) / 2,
    };
  });
  // Painter's order: the far members first, so the near ones overlap them.
  segments.sort((p, q) => p.depth - q.depth);

  const supports: PreviewSupport[] = t.supports.map((s) => ({ ...pts[s.node], type: s.type }));

  const footprint: PreviewPoint[] = (view === 'isometric' && opts.footprint)
    ? [
        project(view, 0, 0, 0),
        project(view, opts.footprint.spanM, 0, 0),
        project(view, opts.footprint.spanM, opts.footprint.lengthM, 0),
        project(view, 0, opts.footprint.lengthM, 0),
      ]
    : [];

  return { segments, nodes: pts, supports, footprint, viewBox: fit([...pts, ...footprint], opts.marginFraction ?? 0.08) };
}

/** Bounding box of the projected points, padded, never zero-sized. */
function fit(pts: readonly PreviewPoint[], marginFraction: number): Projection['viewBox'] {
  if (pts.length === 0) return { x: -1, y: -1, w: 2, h: 2 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  // A single node, or a vertical-only structure, would otherwise give a zero dimension and
  // an SVG that draws nothing at all.
  const rawW = Math.max(maxX - minX, 1e-6);
  const rawH = Math.max(maxY - minY, 1e-6);
  const margin = Math.max(rawW, rawH) * marginFraction;
  return {
    x: minX - margin,
    y: minY - margin,
    w: rawW + margin * 2,
    h: rawH + margin * 2,
  };
}

/**
 * Role colours, in ONE place.
 *
 * The legend and the drawing read the same map, so a member can never be drawn in a colour
 * the legend attributes to something else — which is the specific way a preview legend goes
 * wrong. Chosen to stay distinguishable in the dark theme AND to differ in lightness, so
 * they survive a monochrome screenshot in a report.
 */
export const ROLE_COLOUR: Record<MemberRole, string> = {
  chord: '#4aa3e8',
  post: '#8fa0b4',
  diagonal: '#e8944a',
  rafter: '#4ecdc4',
  column: '#4aa3e8',
  beam: '#6fd98f',
  purlin: '#c9d4e0',
  bracing: '#b98fe0',
};

/** Stroke width in world units, so thicker members read as more important at any zoom. */
export function roleWidth(role: MemberRole, viewBox: Projection['viewBox']): number {
  const base = Math.max(viewBox.w, viewBox.h) / 220;
  const heavy: MemberRole[] = ['chord', 'column', 'rafter', 'beam'];
  return heavy.includes(role) ? base * 1.7 : base;
}
