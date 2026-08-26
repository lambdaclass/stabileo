<script lang="ts">
  /**
   * The bending schedule: a row per mark, and a picture of what to bend.
   *
   * ── What the Shape column used to say ──────────────────────────────
   *
   * `straight`, `LH90`, `UH135H135`, `bent3`. Those are `shapeCode`'s GROUPING keys — the thing
   * `assignMarks` uses to decide which bars are the same fabricated item — and they were being
   * printed as a fabrication instruction. `LH90` is one leg, one bend and a hook, and it does
   * not say how long the leg is, which way the hook turns, or how much steel is in it. A bender
   * reading that has to open the elevation, find a bar carrying the mark, and measure it.
   *
   * A bending schedule's shape column is a diagram with the leg dimensions on it. That is what
   * this renders, from `bar-shape-diagram.ts`, which computes it and refuses when there is no
   * honest one to draw.
   *
   * ── Why the SVG carries a label ────────────────────────────────────
   *
   * A `<path>` is not readable. A screen reader announces an image with no alternative text as
   * "image", and the shape column is the one column of this table that is not a number. The
   * `aria-label` states the same thing the drawing does — the shape and its legs in millimetres
   * — so the row means the same to a reader who cannot see it.
   *
   * ── Its own component ──────────────────────────────────────────────
   *
   * `DetailingWorkflow.svelte` is at its 600-line ceiling and the table plus its diagrams is
   * eighty lines. Same decision as `RcBarList` and `RcTitleBlockFields`.
   */
  import { t, tp } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import {
    rcShapeForMark, type RcShapeResult,
  } from '../../../lib/engine/detailing/bar-shape-diagram';

  const selected = $derived(detailingStore.selected);
  const schedule = $derived(detailingStore.schedule);

  /** Bar id → bar, so a mark can be resolved to the geometry it was assigned from. */
  const barById = $derived.by(() => {
    const m = new Map<string, NonNullable<typeof selected>['bars'][number]>();
    for (const b of selected?.bars ?? []) m.set(b.id, b);
    return m;
  });

  /** Mark → the ids it groups. `assignMarks` recorded them; this is a read, not a regrouping. */
  const idsOfMark = $derived.by(() => {
    const m = new Map<string, string[]>();
    for (const mk of selected?.marks ?? []) m.set(mk.mark, mk.barIds);
    return m;
  });

  /**
   * One diagram per mark, computed once for the table.
   *
   * Keyed on the mark and not on the row, because a schedule has one row per mark by
   * construction — and because a `{#each}` that called the sampler per render would resample
   * every bar on every reactive touch of the panel.
   */
  const shapes = $derived.by(() => {
    const m = new Map<string, RcShapeResult | null>();
    for (const r of schedule?.rows ?? []) {
      m.set(r.mark, rcShapeForMark(idsOfMark.get(r.mark) ?? [], (id) => barById.get(id)));
    }
    return m;
  });

  /** Metres as the millimetres a bender reads. */
  const mm = (v: number) => Math.round(v * 1000);

  /**
   * The diagram, fitted to a fixed box.
   *
   * The scale is per row and not shared across the table: the marks on one floor run from a
   * 150 mm stirrup leg to a 7 m bar, and one scale would draw the stirrup as a dot. A shape
   * column is read for the SHAPE and its written dimensions, which is why every bending
   * schedule ever printed does this.
   *
   * The box is sized by the WORST case, which is a square tie. A near-square shape is fitted by
   * its height, so the padding is subtracted twice from the smaller dimension: at 44 px high
   * with 13 px of padding a 302 × 302 tie came out 18 px across, and its two 8 px labels
   * collided with each other and with the steel. Taller box, tighter padding, smaller label.
   */
  const BOX = { w: 108, h: 66, pad: 11 };

  function fitted(r: RcShapeResult) {
    if (!r.ok) return null;
    const { min, max } = r.diagram.extent;
    const w = Math.max(max.x - min.x, 1e-9);
    const h = Math.max(max.y - min.y, 1e-9);
    const s = Math.min((BOX.w - 2 * BOX.pad) / w, (BOX.h - 2 * BOX.pad) / h);
    const ox = (BOX.w - w * s) / 2 - min.x * s;
    // SVG y runs down; the diagram's runs up.
    const oy = (BOX.h + h * s) / 2 + min.y * s;
    const at = (p: { x: number; y: number }) => ({ x: ox + p.x * s, y: oy - p.y * s });
    return {
      d: r.diagram.points.map((p, i) => {
        const q = at(p);
        return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
      }).join(' '),
      legs: labelled(r).map((l) => ({ ...l, pos: at(l.at) })),
    };
  }

  /**
   * Which legs get a dimension written on them.
   *
   * ── Why not all of them ────────────────────────────────────────────
   *
   * A closed tie has four legs and two dimensions. Labelling each leg put `302` on screen four
   * times inside a 96 × 44 box, and the four collided into an unreadable smudge on exactly the
   * shapes this column exists for. The three that carried no information were the ones making
   * the one that did unreadable.
   *
   * One label per distinct (length, orientation), which is what a hand-drawn schedule writes: a
   * 302 × 302 tie reads `302` across and `302` up, and a 452 × 202 one reads both of its
   * dimensions. Rounded to the millimetre first, because two legs of a tie differ in the last
   * float bit and would otherwise count as two dimensions.
   */
  function labelled(r: RcShapeResult) {
    if (!r.ok) return [];
    const seen = new Set<string>();
    return r.diagram.legs.filter((l) => {
      const key = `${mm(l.lengthM)}|${l.horizontal}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Whether any row on this schedule has folded hooks.
   *
   * One footnote under the table, not one sentence per row. Every closed tie in the model has
   * hooks turning into the core, so the per-row version printed the same three lines beside
   * every stirrup — and a note repeated on every row is a note nobody reads on any of them.
   */
  const anyFolded = $derived([...shapes.values()]
    .some((r) => r?.ok && r.diagram.hooksFolded));

  /**
   * The hooks, as one line: `2 × 135° · 100 mm`, or the two of them separately when they
   * differ. Empty when the bar has none, so the row renders nothing rather than a blank.
   */
  function hookText(r: RcShapeResult): string {
    if (!r.ok) return '';
    const { start, end } = r.diagram.hooks;
    const one = (h: NonNullable<typeof start>) =>
      tp('detailing.shape.hook', { angle: h.angleDeg, ext: mm(h.extensionM) });
    if (start && end
      && start.angleDeg === end.angleDeg && start.extensionM === end.extensionM) {
      return tp('detailing.shape.hookPair', { hook: one(start) });
    }
    return [start, end].filter(Boolean).map((h) => one(h!)).join(' · ');
  }

  /** What the drawing says, in words, for a reader who cannot see it. */
  function describe(r: RcShapeResult | null | undefined, shape: string): string {
    if (!r) return shape;
    if (!r.ok) {
      return tp(r.reason === 'nonPlanar'
        ? 'detailing.shape.nonPlanar' : 'detailing.shape.degenerate', { shape });
    }
    const legs = tp('detailing.shape.legs', {
      shape,
      legs: r.diagram.legs.map((l) => mm(l.lengthM)).join(' + '),
    });
    const hooks = hookText(r);
    return hooks ? `${legs} · ${hooks}` : legs;
  }
</script>

{#if schedule}
  <!-- A wide schedule scrolls itself rather than widening the panel around it. -->
  <div class="scroll-x">
    <table class="schedule" data-testid="schedule">
      <caption>{t('detailing.schedule')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('detailing.mark')}</th>
          <th scope="col">Ø</th>
          <th scope="col">{t('detailing.shape')}</th>
          <th scope="col">{t('detailing.schedule.purpose')}</th>
          <th scope="col">{t('detailing.qty')}</th>
          <th scope="col">{t('detailing.cutLength')}</th>
          <th scope="col">{t('detailing.mass')}</th>
        </tr>
      </thead>
      <tbody>
        {#each schedule.rows as r (r.mark)}
          {@const shape = shapes.get(r.mark) ?? null}
          {@const fit = shape ? fitted(shape) : null}
          <tr>
            <td>{r.mark}</td><td>{r.diameterMm}</td>
            <td class="shape-cell" data-testid={`shape-${r.mark}`}
                data-shape={shape === null ? 'unknown' : shape.ok ? 'drawn' : shape.reason}>
              {#if fit}
                <svg
                  class="shape"
                  data-testid={`shape-svg-${r.mark}`}
                  viewBox={`0 0 ${BOX.w} ${BOX.h}`}
                  width={BOX.w} height={BOX.h}
                  role="img"
                  aria-label={describe(shape, r.shape)}
                >
                  <path d={fit.d} fill="none" stroke="currentColor" stroke-width="1.4"
                        stroke-linejoin="round" stroke-linecap="round" />
                  <!--
                    The leg dimensions, on the legs. A horizontal leg takes its label above and
                    a vertical one takes it to the right, so a rectangle's four dimensions never
                    land on top of one another.
                  -->
                  {#each fit.legs as l, i (i)}
                    <text
                      x={l.pos.x + (l.horizontal ? 0 : 5)}
                      y={l.pos.y - (l.horizontal ? 4 : 0)}
                      text-anchor={l.horizontal ? 'middle' : 'start'}
                      dominant-baseline={l.horizontal ? 'auto' : 'middle'}
                      font-size="7"
                    >{mm(l.lengthM)}</text>
                  {/each}
                </svg>
                <!--
                  The steel in the bends, stated rather than folded into the legs.

                  A bender cuts to the cutting length and bends to the leg dimensions. Padding
                  the legs so the two add up would produce a bar that is right on the schedule
                  and long in the shop.
                -->
                {#if shape?.ok && shape.diagram.bendsM > 0.0005}
                  <span class="bends" data-testid={`shape-bends-${r.mark}`}>
                    {tp('detailing.shape.bends', { n: mm(shape.diagram.bendsM) })}
                  </span>
                {/if}
                <!--
                  The hooks, dimensioned rather than measured off the picture.

                  They are drawn FOLDED into the plane of the body, which is what every bending
                  schedule does with a 135° tie hook that turns into the core — and a folded
                  hook is foreshortened, so the drawing is not the place to read its length
                  from. The angle and the extension are what a bender sets the machine to.
                -->
                {#if shape?.ok && hookText(shape)}
                  <span class="hooks" data-testid={`shape-hooks-${r.mark}`}>{hookText(shape)}</span>
                {/if}
              {:else}
                <!--
                  No honest diagram. The shape code stays — it is what the mark was grouped on —
                  and the row says why there is no picture instead of drawing a flattened one.
                -->
                <span class="code">{r.shape}</span>
                <span class="nodiagram" data-testid={`shape-none-${r.mark}`}>
                  {describe(shape, r.shape)}
                </span>
              {/if}
            </td>
            <td data-testid="schedule-purpose">{r.role === 'longitudinal'
              ? t(`detailing.schedule.purpose.${r.purpose ?? 'resistant'}`) : '—'}</td>
            <td>{r.quantity}</td>
            <td>{r.cuttingLengthM.toFixed(2)}</td>
            <td>{r.massKg.toFixed(1)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="4">{t('detailing.total')}</th>
          <td>{schedule.totals.quantity}</td>
          <td>{schedule.totals.totalLengthM.toFixed(1)}</td>
          <td data-testid="schedule-mass">{schedule.totals.massKg.toFixed(1)}</td>
        </tr>
      </tfoot>
    </table>
    <!--
      One footnote, not one sentence per row. Every closed tie's hooks turn into the core, so
      the per-row version printed the same three lines beside every stirrup — and a note
      repeated on every row is a note nobody reads on any of them.
    -->
    {#if anyFolded}
      <p class="folded" data-testid="schedule-folded">{t('detailing.shape.hooksFolded')}</p>
    {/if}
  </div>
{/if}

<style>
  table.schedule { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  .scroll-x { overflow-x: auto; max-width: 100%; }
  caption { text-align: left; font-weight: 600; padding-bottom: 0.25rem; }
  th, td { border: 1px solid var(--st-hair-strong); padding: 0.2rem 0.4rem; text-align: right; }
  th[scope='col'], td:first-child, td.shape-cell { text-align: left; }

  .shape-cell {
    /* Wide enough for the box plus its labels, and no wider: every other column is a number. */
    min-width: 7rem;
    padding: 0.25rem 0.4rem;
  }
  /*
    `currentColor`, so the diagram is ink and follows the table.

    A hard-coded stroke would be the one line on this surface that does not change with the
    theme, and it is the line a bender fabricates from.
  */
  svg.shape { display: block; color: var(--st-text); }
  svg.shape text { fill: var(--st-text-2); font-family: var(--st-sans); }

  .bends { display: block; font-size: 0.64rem; color: var(--st-text-3); }
  .hooks { display: block; font-size: 0.64rem; color: var(--st-text-2); }
  /*
    That the hooks were folded is a statement about the DRAWING, so it sits under the table with
    the other things the table says about itself. Dim rather than amber: it is the ordinary
    case for a tie, not a gap.
  */
  .folded { margin: 0.15rem 0 0; font-size: 0.64rem; color: var(--st-text-3); line-height: 1.35; }
  .code { font-family: var(--st-mono); font-size: 0.7rem; }
  /* No picture is a statement, not a blank. Amber, because it is a gap the reader must act on. */
  .nodiagram { display: block; font-size: 0.64rem; color: var(--st-warn); line-height: 1.3; }
</style>
