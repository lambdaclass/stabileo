/**
 * label-layout.ts — placing labels so they do not land on top of each other.
 *
 * # The problem, stated once
 *
 * Every annotation on the canvas wants to sit at one particular place: a load's
 * value belongs next to its arrow, a member's tag next to the member. When two
 * of them want overlapping places, both become unreadable — and the drawing
 * looks broken in a way that suggests the numbers are wrong rather than merely
 * badly positioned.
 *
 * The previous answer was a per-load `labelYOffset` decided upstream: a
 * hard-coded nudge that had to be maintained by hand, knew nothing about what
 * was actually on screen, and could not react to zoom. Two distributed loads on
 * one beam still collided, because the offset was chosen without looking.
 *
 * # The approach
 *
 * Greedy placement in priority order, which is the standard answer to label
 * collision and the right one here for a specific reason: it lets us decide WHO
 * keeps their preferred spot. The largest load is the one a reader looks for
 * first, so it is placed first and keeps its natural position; smaller ones move
 * out of its way. That produces the ordering by magnitude a reader expects
 * rather than an arbitrary one that depends on element ids.
 *
 * A label displaced along its own preferred direction — outward from the member
 * it annotates — stays visibly attached to what it describes. Displacing it
 * sideways, or to wherever there happens to be room, would break that.
 *
 * # What counts as an obstacle
 *
 * Other labels, and the STRUCTURE itself: a value written across a column is as
 * unreadable as one written across another value, which is what the point-load
 * labels were doing. Members are passed in as segments and treated as thin
 * boxes, so the same routine handles both.
 */

/**
 * Collects every label drawn in one frame so they can be laid out together.
 *
 * Resolving each KIND of load separately is not enough, and the reason is the
 * whole point of this module: a point load's value and a distributed load's
 * value are drawn by different functions, know nothing about each other, and
 * land on the same beam. Whoever ran last won. One collector, passed through
 * the draw context and flushed once, is what makes the guarantee hold across
 * the whole drawing rather than within each renderer.
 */
export interface LabelCollector {
  /** Queue a label. Nothing is drawn until `flush`. */
  add(entry: { text: string; colour: string; font: string; box: LabelBox }): void;
  /** Declare something labels must avoid — an arrow, a member, a node marker. */
  block(seg: SegmentObstacle): void;
  /** Lay everything out and draw it. Safe to call with nothing queued. */
  flush(ctx: CanvasRenderingContext2D, extra?: SegmentObstacle[]): void;
}

export function createLabelCollector(): LabelCollector {
  const entries: Array<{ text: string; colour: string; font: string; box: LabelBox }> = [];
  const blockers: SegmentObstacle[] = [];
  return {
    add(entry) { entries.push(entry); },
    block(seg) { blockers.push(seg); },
    flush(ctx, extra = []) {
      if (entries.length === 0) return;
      const obstacles = [...blockers, ...extra].flatMap((s) => segmentToBoxes(s));
      /*
       * Measure the text instead of trusting a declared width.
       *
       * Every caller was guessing — "about 84 px for a point load" — and a
       * guess is wrong in both directions: too wide pushes a label clear of an
       * obstacle it never touched (which is why point-load values drifted far
       * from their node), too narrow lets it land on one it does. The canvas
       * knows the answer once the font is set, and this is the one place that
       * has both the font and the string.
       */
      const boxes = entries.map((e) => {
        ctx.font = e.font;
        // The size the canvas actually uses: the reader's label size may have
        // scaled the one asked for (canvas/text-scale.ts).
        const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? '') || parseFloat(e.font) || 12;
        return { ...e.box, width: ctx.measureText(e.text).width, height: size + 2 };
      });
      const placed = placeLabels(boxes, obstacles);
      const prevAlign = ctx.textAlign;
      const prevBaseline = ctx.textBaseline;
      // Everything is measured from the alphabetic baseline, so anything the
      // caller left set would move the text away from the box that was tested.
      ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < entries.length; i++) {
        ctx.textAlign = entries[i].box.anchorX ?? 'center';
        ctx.font = entries[i].font;
        ctx.fillStyle = entries[i].colour;
        ctx.fillText(entries[i].text, placed[i].x, placed[i].y);
      }
      ctx.textAlign = prevAlign;
      ctx.textBaseline = prevBaseline;
      entries.length = 0;
      blockers.length = 0;
    },
  };
}

export interface LabelBox {
  /** Preferred position: where the label goes if nothing is in the way. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Unit vector along which the label may be pushed, screen space.
   *
   * Displacement follows this so the label stays on the side of the member it
   * belongs to. Zero-length means the label cannot move and will simply be
   * placed at its preferred spot.
   */
  dirX: number;
  dirY: number;
  /**
   * Higher goes first and keeps its preferred position. Use the magnitude the
   * label reports, so the biggest number stays where the eye looks for it.
   */
  priority: number;
  /**
   * Where `x` sits relative to the text. `'left'` matches a `fillText` drawn
   * with the default `textAlign`, which is what canvas code writes without
   * thinking about it; the box then extends to the right of `x`.
   *
   * Getting this wrong misplaces the collision box by half a width — the label
   * is tested somewhere it will not be drawn, so it dodges obstacles it does
   * not touch and lands on ones it does.
   */
  anchorX?: 'left' | 'center' | 'right';
  /**
   * Labels that belong together and must be read as one list.
   *
   * Two loads on one beam are not two independent annotations that happen to
   * be near each other — they are the load table for that beam. Sharing a
   * group makes them a BLOCK: ordered by size with the largest on top, stacked
   * at a fixed line spacing, and moved together when something is in the way.
   * Placed independently they end up in whatever order the search happened to
   * find room in, which reads as no order at all.
   */
  group?: string;
  /**
   * Tie-break within a group when two values are equal, lowest first.
   *
   * Equal magnitudes are common — the same UDL on every floor of a frame — and
   * without this their order comes down to iteration order, so the same model
   * can list them differently after an edit that changed nothing.
   */
  rank?: number;
  /**
   * How far the label is allowed to look for room.
   *
   * - `'forward'` — along `dir` only.
   * - `'both'` — along `dir` either way, preferring `dir`.
   * - `'any'` — `dir` first, then perpendicular to it.
   *
   * Stacked distributed loads want `'forward'`: they must all move away from
   * the member, or the smaller ones end up inside the arrows.
   *
   * A point load's value wants `'any'`, and the reason is worth stating: an
   * escape direction only helps if it is transverse to the obstacle. Sliding a
   * label left when what blocks it is a horizontal beam moves it the whole
   * search distance and leaves it on the beam — which is how the axial and
   * moment values ended up 150 px away and still unreadable. Searching the
   * perpendicular too costs one more ring and finds the way out immediately.
   */
  sweep?: 'forward' | 'both' | 'any';
}

export interface PlacedLabel {
  x: number;
  y: number;
  /** How far it had to move, in pixels. Zero means it got its first choice. */
  displaced: number;
}

/** An axis-aligned box that a label must not cover. */
export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Line segment obstacle — a member, an arrow, a row of symbols. */
export interface SegmentObstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * Half-thickness in px. A line has none of its own, but the thing it stands
   * for often does: the row of `+` symbols marking a thermal load is a strip
   * about ten pixels deep, and describing it as a bare line lets a label land
   * in the middle of it.
   */
  pad?: number;
}

const overlaps = (a: Obstacle, b: Obstacle): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * A segment as one box, padded so a label does not merely graze it.
 *
 * Exact for an axis-aligned member — a beam or a column, which is most of what
 * a frame is made of. For anything diagonal use `segmentToBoxes`.
 */
export function segmentToBox(s: SegmentObstacle, pad = 3): Obstacle {
  const p = s.pad ?? pad;
  const x = Math.min(s.x1, s.x2) - p;
  const y = Math.min(s.y1, s.y2) - p;
  return {
    x, y,
    width: Math.abs(s.x2 - s.x1) + p * 2,
    height: Math.abs(s.y2 - s.y1) + p * 2,
  };
}

/**
 * A segment as a CHAIN of boxes that follows the line.
 *
 * One bounding box around a diagonal declares the entire triangle on either
 * side of it occupied — a truss brace would forbid a quarter of the screen,
 * and every label near it would be shoved the full search distance away for no
 * reason. Chaining short boxes keeps the obstacle the shape of the member.
 *
 * An axis-aligned segment gets a single box, since for that case the bounding
 * box IS the member and subdividing would only add work.
 */
export function segmentToBoxes(s: SegmentObstacle, pad = 3, span = 24): Obstacle[] {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return [segmentToBox(s, pad)];

  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / span));
  const out: Obstacle[] = [];
  for (let i = 0; i < n; i++) {
    out.push(segmentToBox({
      x1: s.x1 + (dx * i) / n, y1: s.y1 + (dy * i) / n,
      x2: s.x1 + (dx * (i + 1)) / n, y2: s.y1 + (dy * (i + 1)) / n,
      pad: s.pad,
    }, pad));
  }
  return out;
}

/**
 * Place labels so none overlaps another or an obstacle.
 *
 * `step` is how far each attempt moves; `maxSteps` bounds the search so a
 * hopeless case — a label boxed in on every side — degrades to "slightly
 * overlapping" rather than to an infinite loop or a label thrown off screen.
 * The step is deliberately small: a label that ends up far from what it
 * annotates has not been placed, it has been lost, so it is better to search
 * finely nearby than coarsely over a wide area.
 *
 * Returned in the SAME ORDER as the input, whatever order they were placed in,
 * because the caller indexes by its own list.
 */
export function placeLabels(
  labels: LabelBox[],
  obstacles: Obstacle[] = [],
  step = 10,
  maxSteps = 10,
): PlacedLabel[] {
  const out: PlacedLabel[] = new Array(labels.length);
  const taken: Obstacle[] = [...obstacles];

  /*
   * Grouped labels are placed as one block, ungrouped ones on their own.
   *
   * Blocks go first, and largest block first, because a block is several lines
   * of text: it needs the room while there is room to be had, and a single
   * stray label displaced by 10 px costs far less than a load table broken
   * apart.
   */
  const units = buildUnits(labels);
  units.sort((a, b) => b.priority - a.priority);

  for (const unit of units) {
    const { ux, uy } = unitDir(labels[unit.members[0]]);
    const slots = layoutSlots(unit, labels);
    const bounds = unionBox(slots);
    const sweep = labels[unit.members[0]].sweep ?? 'forward';

    let shift: [number, number] = [0, 0];
    let free = false;
    for (const cand of candidateOffsets(ux, uy, sweep, step, maxSteps)) {
      const moved = { ...bounds, x: bounds.x + cand[0], y: bounds.y + cand[1] };
      if (!taken.some((o) => overlaps(moved, o))) { shift = cand; free = true; break; }
    }
    /*
     * Nothing free: keep the preferred spot rather than the last thing tried.
     * A label that cannot avoid an overlap is at least still beside what it
     * describes; one parked at the end of the search is both overlapping and
     * detached, which reads as belonging to something else.
     */
    if (!free) shift = [0, 0];

    taken.push({ ...bounds, x: bounds.x + shift[0], y: bounds.y + shift[1] });
    for (let k = 0; k < unit.members.length; k++) {
      const i = unit.members[k];
      out[i] = {
        x: slots[k].anchorX + shift[0],
        y: slots[k].anchorY + shift[1],
        displaced: Math.hypot(shift[0], shift[1]),
      };
    }
  }

  return out;
}

interface Unit {
  /** Indices into the caller's array, in the order they will be stacked. */
  members: number[];
  priority: number;
}

/** One unit per group, one per ungrouped label. */
function buildUnits(labels: LabelBox[]): Unit[] {
  const groups = new Map<string, number[]>();
  const units: Unit[] = [];

  labels.forEach((l, i) => {
    if (l.group === undefined) {
      units.push({ members: [i], priority: l.priority });
    } else {
      const g = groups.get(l.group);
      if (g) g.push(i); else groups.set(l.group, [i]);
    }
  });

  for (const members of groups.values()) {
    /*
     * Largest first, then by rank. Rank is what settles the common case of
     * equal magnitudes — the same UDL on every floor — so that dead, live,
     * wind and seismic always read in that order instead of in whatever order
     * the model stored them.
     */
    members.sort((a, b) =>
      labels[b].priority - labels[a].priority
      || (labels[a].rank ?? 0) - (labels[b].rank ?? 0));
    units.push({ members, priority: Math.max(...members.map((i) => labels[i].priority)) });
  }
  return units;
}

function unitDir(l: LabelBox): { ux: number; uy: number } {
  const len = Math.hypot(l.dirX, l.dirY);
  return len > 1e-9 ? { ux: l.dirX / len, uy: l.dirY / len } : { ux: 0, uy: 0 };
}

/** Where each member of a unit sits, before the unit is displaced. */
interface Slot extends Obstacle { anchorX: number; anchorY: number }

/**
 * Stack a unit's members into lines.
 *
 * The block starts at the OUTERMOST preferred position of its members — the
 * largest load's arrows are the longest, so anchoring to the innermost would
 * put the whole table inside them — and grows away from the member. Lines are
 * then handed out top to bottom on screen, so the biggest number is the top
 * line however the escape direction happens to point.
 */
function layoutSlots(unit: Unit, labels: LabelBox[]): Slot[] {
  const first = labels[unit.members[0]];
  const { ux, uy } = unitDir(first);
  const n = unit.members.length;
  const lineHeight = Math.max(...unit.members.map((i) => labels[i].height)) + 1;

  // Furthest preferred position along the escape direction.
  let base = -Infinity;
  let baseX = first.x;
  let baseY = first.y;
  for (const i of unit.members) {
    const proj = labels[i].x * ux + labels[i].y * uy;
    if (proj > base) { base = proj; baseX = labels[i].x; baseY = labels[i].y; }
  }

  const positions = Array.from({ length: n }, (_, k) => ({
    x: baseX + ux * k * lineHeight,
    y: baseY + uy * k * lineHeight,
  }));
  // Topmost line to the first member, which is the largest.
  positions.sort((a, b) => a.y - b.y);

  return unit.members.map((i, k) => {
    const l = labels[i];
    const p = positions[k];
    const left = l.anchorX === 'left' ? 0 : l.anchorX === 'right' ? -l.width : -l.width / 2;
    return {
      anchorX: p.x, anchorY: p.y,
      x: p.x + left, y: p.y - l.height,
      width: l.width, height: l.height,
    };
  });
}

function unionBox(slots: Slot[]): Obstacle {
  const x = Math.min(...slots.map((s) => s.x));
  const y = Math.min(...slots.map((s) => s.y));
  return {
    x, y,
    width: Math.max(...slots.map((s) => s.x + s.width)) - x,
    height: Math.max(...slots.map((s) => s.y + s.height)) - y,
  };
}

/**
 * Displacements to try, nearest first: the preferred spot, then one ring at a
 * time. Within a ring the unit's own direction comes first, so ties break
 * toward where it wants to be.
 */
function candidateOffsets(
  ux: number, uy: number, sweep: string, step: number, maxSteps: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]];
  if (Math.hypot(ux, uy) < 1e-9) return out;
  const px = uy;
  const py = -ux;
  for (let k = 1; k <= maxSteps; k++) {
    const d = k * step;
    out.push([ux * d, uy * d]);
    if (sweep !== 'forward') out.push([-ux * d, -uy * d]);
    if (sweep === 'any') {
      out.push([px * d, py * d]);
      out.push([-px * d, -py * d]);
    }
  }
  return out;
}
