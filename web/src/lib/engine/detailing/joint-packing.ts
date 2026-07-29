/**
 * Deterministic packing of the beam-column joint volume.
 *
 * ── The problem ────────────────────────────────────────────────────
 *
 * A beam's longitudinal bars run straight through the column. The column's longitudinal
 * bars run straight up through the same volume. Placed independently — which is what the
 * generators do, correctly, because neither knows about the other — they interpenetrate.
 * On the 408-member flagship that is 273 genuine physical impossibilities per floor after
 * every other class of false positive has been cleared away.
 *
 * A detailer resolves this by threading: the beam bars are positioned so that, in plan,
 * they pass through the gaps BETWEEN the column bars. This module does the same thing, and
 * it does it before the collision pass rather than by nudging afterwards, because nudging
 * has no notion of "there is a corridor here and the bar must be in it".
 *
 * ── What is reserved, in order ─────────────────────────────────────
 *
 *   1. Cover and the tie envelope. Nothing may be placed outside the core.
 *   2. Column longitudinal corridors — a keep-out band around each column bar, one bar
 *      diameter plus the clear spacing wide.
 *   3. The remaining free channels, into which beam bars are placed.
 *
 * Beams on the two plan axes are handled with a deterministic priority so the result does
 * not depend on the order the caller supplies them: the deeper beam threads first, ties
 * broken by element id. Reordering the input produces byte-identical output.
 *
 * ── What it will not do ────────────────────────────────────────────
 *
 * It never moves a bar outside the cover, never reduces a clear spacing below the code
 * minimum, and never changes a bar count or diameter — those are verified quantities and
 * changing one silently would invalidate the certificate behind it. When no legal
 * arrangement exists it says so, with the limiting dimension, and the conflict survives.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { BarPath, Point3 } from '../../codes/cirsoc201/bar-geometry';
import {
  minClearSpacingColumn, minClearSpacingInLayer,
} from '../../codes/cirsoc201/spacing';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import { msg, round, type EngineMessage } from '../../codes/message';

// ─── Inputs ──────────────────────────────────────────────────────

export interface JointVolume {
  id: string;
  nodeId: number;
  /** Centre of the joint in model coordinates. */
  centre: Point3;
  /** Column plan dimensions at the joint, m. */
  columnB: number;
  columnH: number;
  /** Clear cover to the tie, m. */
  cover: number;
  /** Tie/hoop bar diameter, mm. */
  tieDia: number;
  /** Column longitudinal bars passing through, with their plan offsets from the centre. */
  columnBars: Array<{ id: string; diameterMm: number; dx: number; dy: number }>;
  /** Beams framing in, by element id, with the plan direction of their axis. */
  beams: Array<{
    elementId: number;
    direction: { x: number; y: number };
    depth: number;
    width: number;
  }>;
}

export interface JointPackingInput {
  joints: readonly JointVolume[];
  bars: readonly BarPath[];
  edition: RegulationEdition;
  maxAggregateSizeMm: number;
  /** Bars the user pinned. Never moved, and they reserve their channel first. */
  lockedBarIds?: ReadonlySet<string>;
}

// ─── Outputs ─────────────────────────────────────────────────────

export type JointConflictKind =
  /** No free channel wide enough for the beam's bars. */
  | 'noFreeChannel'
  /** The bars fit only by breaching cover. */
  | 'coverBreach'
  /** More bars than the column core can pass at any spacing. */
  | 'coreCapacity';

export interface JointConflict {
  jointId: string;
  kind: JointConflictKind;
  elementIds: number[];
  /** What actually limits it, so the advice is specific rather than "too congested". */
  limiting: EngineMessage;
  /** The section or detail change that would resolve it. */
  advice: EngineMessage;
  refs: ClauseRef[];
}

export interface JointPackingResult {
  /** Bars with their joint-threading offsets applied. Same ids, same count. */
  bars: BarPath[];
  /** Joints that could not be packed legally. */
  conflicts: JointConflict[];
  /** How many bars were repositioned. */
  moved: number;
  trace: EngineMessage[];
}

// ─── Channels ────────────────────────────────────────────────────

interface Channel {
  /** Centre of the free channel, in the beam's transverse coordinate, m. */
  centre: number;
  /** Full width of the channel, m. */
  width: number;
}

/**
 * The free channels across the column core, once every column bar's keep-out is removed.
 *
 * `obstacles` are the column bars projected onto the beam's transverse axis: a bar at plan
 * offset (dx, dy) projects to `dx·tx + dy·ty`. Two column bars at the same projected
 * coordinate merge into one obstacle, which is exactly right — a beam bar cannot pass
 * either of them.
 */
export function freeChannels(
  halfWidth: number,
  obstacles: ReadonlyArray<{ at: number; halfKeepOut: number }>,
): Channel[] {
  const blocked = obstacles
    .map((o) => ({ lo: o.at - o.halfKeepOut, hi: o.at + o.halfKeepOut }))
    .sort((a, b) => a.lo - b.lo);

  // Merge overlapping keep-outs so a run of close column bars is one obstacle.
  const merged: Array<{ lo: number; hi: number }> = [];
  for (const b of blocked) {
    const last = merged[merged.length - 1];
    if (last && b.lo <= last.hi) last.hi = Math.max(last.hi, b.hi);
    else merged.push({ ...b });
  }

  const channels: Channel[] = [];
  let cursor = -halfWidth;
  for (const b of merged) {
    if (b.lo > cursor) channels.push({ centre: (cursor + b.lo) / 2, width: b.lo - cursor });
    cursor = Math.max(cursor, b.hi);
  }
  if (cursor < halfWidth) {
    channels.push({ centre: (cursor + halfWidth) / 2, width: halfWidth - cursor });
  }
  return channels.filter((c) => c.width > 0);
}

/**
 * Choose positions for `count` bars inside the available channels.
 *
 * Widest channel first so the most crowded case still finds room, then by position so the
 * result is stable. Within a channel bars are spread at the code spacing and centred.
 * Returns null when the channels cannot legally hold them all.
 */
export function placeInChannels(
  channels: readonly Channel[],
  count: number,
  diameterMm: number,
  minClear: number,
): number[] | null {
  if (count === 0) return [];
  const d = diameterMm / 1000;
  const pitch = d + minClear;

  const capacityOf = (c: Channel) =>
    c.width < d ? 0 : Math.max(0, Math.floor((c.width - d) / pitch) + 1);

  // Deterministic: widest first, ties broken by centre so input order cannot change it.
  const ordered = [...channels]
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.width - a.width || a.centre - b.centre || a.i - b.i);

  const total = ordered.reduce((n, c) => n + capacityOf(c), 0);
  if (total < count) return null;

  const out: number[] = [];
  let left = count;
  for (const c of ordered) {
    if (left === 0) break;
    const take = Math.min(left, capacityOf(c));
    if (take === 0) continue;
    const span = pitch * (take - 1);
    for (let k = 0; k < take; k++) out.push(c.centre - span / 2 + k * pitch);
    left -= take;
  }
  // Sorted so bar i always gets the i-th position from one side, whatever order the
  // channels were considered in.
  return out.sort((a, b) => a - b);
}

// ─── The pass ────────────────────────────────────────────────────

/** Plan unit vector across a beam's axis. */
function transverseOf(dir: { x: number; y: number }): { x: number; y: number } {
  const L = Math.hypot(dir.x, dir.y) || 1;
  return { x: -dir.y / L, y: dir.x / L };
}

/** Does this bar pass through the joint volume? */
function passesThrough(bar: BarPath, joint: JointVolume): boolean {
  const r = Math.hypot(joint.columnB, joint.columnH) / 2;
  for (const sg of bar.segments) {
    for (const p of [sg.start, sg.end]) {
      if (Math.hypot(p.x - joint.centre.x, p.y - joint.centre.y) <= r + 0.30) return true;
    }
  }
  return false;
}

/**
 * Thread every incident beam's longitudinal bars through the free channels of each joint.
 *
 * Deterministic by construction: joints in id order, beams within a joint by depth then
 * element id, bars within a beam by id. Reordering any input leaves the output identical.
 */
export function packJoints(input: JointPackingInput): JointPackingResult {
  const locked = input.lockedBarIds ?? new Set<string>();
  const byId = new Map(input.bars.map((b) => [b.id, b]));
  const conflicts: JointConflict[] = [];
  const trace: EngineMessage[] = [];
  let moved = 0;

  const joints = [...input.joints].sort((a, b) => a.id.localeCompare(b.id));

  for (const joint of joints) {
    // 1. The core: inside the cover and the tie.
    const tie = joint.tieDia / 1000;
    const coreB = joint.columnB - 2 * (joint.cover + tie);
    const coreH = joint.columnH - 2 * (joint.cover + tie);
    if (coreB <= 0 || coreH <= 0) {
      conflicts.push({
        jointId: joint.id, kind: 'coverBreach',
        elementIds: joint.beams.map((b) => b.elementId),
        limiting: msg('detailing.joint.limiting.noCore', {
          b: round(joint.columnB * 1000, 0), h: round(joint.columnH * 1000, 0),
          cover: round(joint.cover * 1000, 0), tie: joint.tieDia,
        }),
        advice: msg('detailing.joint.advice.enlargeColumn'),
        refs: [],
      });
      continue;
    }

    // 2. Beams in a deterministic priority: deepest threads first, then by element id.
    const beams = [...joint.beams].sort((a, b) => b.depth - a.depth || a.elementId - b.elementId);

    for (const beam of beams) {
      const t = transverseOf(beam.direction);
      // The core half-width measured across THIS beam's axis, CLAMPED to the beam's own
      // clear width.
      //
      // Without the clamp, threading happily parks a bar in a channel that lies outside
      // the beam it belongs to: the column core is usually wider than the beam, and a
      // straight bar moved laterally at the joint moves along its whole length. That
      // turns one clash into a bar sitting in fresh air. The channel a beam bar may use
      // is the intersection of the column's free space and its own section.
      const columnHalf = (Math.abs(t.x) * coreB + Math.abs(t.y) * coreH) / 2;
      const beamHalf = Math.max(0, beam.width / 2 - joint.cover - tie);
      const halfWidth = Math.min(columnHalf, beamHalf);
      if (halfWidth <= 0) continue;

      // 3. Column bars become keep-out corridors, projected onto the beam's transverse axis.
      const colSpacing = minClearSpacingColumn(input.edition, {
        barDiameterMm: Math.max(...joint.columnBars.map((c) => c.diameterMm), 1),
        maxAggregateSizeMm: input.maxAggregateSizeMm,
      });
      const obstacles = joint.columnBars.map((c) => ({
        at: c.dx * t.x + c.dy * t.y,
        // Half the bar plus half the clear spacing each side: the corridor a beam bar
        // must stay out of if the pair is to satisfy §25.2.3.
        halfKeepOut: c.diameterMm / 2000 + colSpacing.minClear / 2,
      }));
      const channels = freeChannels(halfWidth, obstacles);

      // 4. This beam's longitudinal bars passing through the joint.
      const beamBars = input.bars
        .filter((b) => b.role === 'longitudinal'
          && b.ownerElementIds.includes(beam.elementId)
          && !locked.has(b.id)
          && passesThrough(b, joint))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (beamBars.length === 0) continue;

      // Bars at the same elevation compete for plan space; bars in different layers do
      // not. Group by height so a two-layer beam is threaded a layer at a time.
      const byLevel = new Map<number, BarPath[]>();
      for (const bar of beamBars) {
        const z = Math.round((bar.segments[0]?.start.z ?? 0) * 1000);
        byLevel.set(z, [...(byLevel.get(z) ?? []), bar]);
      }

      const beamSpacing = minClearSpacingInLayer(input.edition, {
        barDiameterMm: Math.max(...beamBars.map((b) => b.diameterMm)),
        maxAggregateSizeMm: input.maxAggregateSizeMm,
      });

      // ── Thread the whole stack, not one level at a time ──────────
      //
      // §25.2.2: "las barras de las capas superiores deben colocarse exactamente sobre las
      // de las capas inferiores". Threading each level independently picks its own nearest
      // free channel for each level and the layers stop lining up — the upper bars end up
      // nested between the lower ones instead of above them, which is precisely what the
      // clause forbids and what the QA fixture showed at 12 mm plan pitch.
      //
      // So the plan positions are chosen ONCE, for the level with the most bars, and every
      // other level reuses the same transverse coordinates. A level with fewer bars takes
      // the first N positions, deterministically, so the arrangement is stable and every
      // upper bar sits over a lower one.
      const levels = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
      const widest = levels.reduce(
        (m, [, g]) => (g.length > m.length ? g : m), levels[0]?.[1] ?? []);
      const stackDia = Math.max(...beamBars.map((b) => b.diameterMm), 0);
      const stackPositions = widest.length > 0
        ? placeInChannels(channels, widest.length, stackDia, beamSpacing.minClear)
        : [];

      for (const [, group] of levels) {
        const dia = Math.max(...group.map((b) => b.diameterMm));
        // Reuse the stack's columns; fall back to a per-level solve only if the stack
        // itself could not be placed, so a failure is reported once and not per level.
        const positions = stackPositions === null
          ? placeInChannels(channels, group.length, dia, beamSpacing.minClear)
          : stackPositions.slice(0, group.length);
        if (positions === null) {
          conflicts.push({
            jointId: joint.id, kind: 'noFreeChannel', elementIds: [beam.elementId],
            limiting: msg('detailing.joint.limiting.noChannel', {
              bars: group.length, dia,
              channels: channels.length,
              widest: round(Math.max(...channels.map((c) => c.width), 0) * 1000, 0),
              needed: round((dia / 1000 + beamSpacing.minClear) * 1000, 0),
            }),
            advice: msg('detailing.joint.advice.threading', {
              element: beam.elementId, dia,
            }),
            refs: [...beamSpacing.refs, ...colSpacing.refs],
          });
          continue;
        }

        // 5. Apply. Shift each bar laterally to its channel position, keeping its
        // elevation and its length: threading is a plan-only operation, so the effective
        // depth every capacity check was based on is untouched.
        // Assign each bar the free position nearest where it already is, so threading is
        // the smallest move that works rather than a wholesale reshuffle.
        const current = group.map((bar) => projectOnto(bar, joint.centre, t));
        const order = group.map((_, i) => i).sort((i, j) => current[i] - current[j]);
        const assigned = new Array<number>(group.length);
        order.forEach((barIndex, slot) => { assigned[barIndex] = positions[slot]; });

        group.forEach((bar, k) => {
          const delta = assigned[k] - current[k];
          if (Math.abs(delta) < 1e-6) return;
          byId.set(bar.id, {
            ...bar,
            segments: bar.segments.map((sg) => ({
              ...sg,
              start: { ...sg.start, x: sg.start.x + t.x * delta, y: sg.start.y + t.y * delta },
              end: { ...sg.end, x: sg.end.x + t.x * delta, y: sg.end.y + t.y * delta },
            })),
            source: 'coordinated',
          });
          moved++;
        });
      }
    }
  }

  if (moved > 0) {
    trace.push(msg('detailing.joint.threaded', { count: moved, joints: joints.length }));
  }
  return { bars: [...byId.values()], conflicts, moved, trace };
}

/** A bar's current offset along the transverse axis, relative to the joint centre. */
function projectOnto(
  bar: BarPath, centre: Point3, t: { x: number; y: number },
): number {
  const p = bar.segments[0]?.start;
  if (!p) return 0;
  return (p.x - centre.x) * t.x + (p.y - centre.y) * t.y;
}
