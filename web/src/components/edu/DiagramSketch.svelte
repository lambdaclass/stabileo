<script lang="ts">
  import { readAnswer } from './exercise-marking';
  /**
   * The student draws a diagram.
   *
   * A strip the length of the member, with the zero axis through it. The
   * student drags ordinates up and down — that is the drawing — and says what
   * the curve does between them: nothing, constant, linear, quadratic, cubic.
   * Curved spans also ask which end is flat, because a parabola between two
   * ordinates is two different diagrams depending on where its slope is zero,
   * and finding that end IS reading the shear diagram.
   *
   * Values are typed as well as dragged. Dragging is how you say "it peaks
   * about here and comes back to zero"; typing is how you say "−37.5". The
   * marking wants both, so the panel offers both rather than making the
   * student fight a mouse for two significant figures.
   */
  import { t as tr } from '../../lib/i18n';
  import {
    SKETCH_POWERS, emptySketch, sketchValueAt,
    type Sketch, type SketchPower, type SketchVertex,
  } from './diagram-sketch';

  interface Props {
    sketch: Sketch;
    /** The author's preview and a marked answer are both read-only. */
    readonly?: boolean;
    unit?: string;
    /** Drawn behind the student's line, once they have been marked. */
    reference?: number[] | null;
    /**
     * Plot positive DOWNWARD, which is how this application draws a moment:
     * a sagging moment goes on the tension side, under the member. Shear and
     * axial keep positive up. Getting this wrong would teach a convention the
     * rest of the app contradicts.
     */
    positiveDown?: boolean;
    onchange?: (s: Sketch) => void;
  }
  let {
    sketch = $bindable(emptySketch()), readonly = false, unit = '',
    reference = null, positiveDown = false, onchange,
  }: Props = $props();

  const W = 320, H = 116, PAD = 10;
  const MID = H / 2;

  /** Half-height of the plot in value units. Grows to fit what is drawn so a
   *  dragged peak never leaves the strip, and never shrinks below something
   *  workable on an empty sketch. */
  const scale = $derived(Math.max(
    ...sketch.points.map(p => Math.abs(p.value)),
    ...(reference ?? []).map(Math.abs),
    1,
  ) * 1.25);

  const xOf = (t: number) => PAD + t * (W - 2 * PAD);
  const sign = $derived(positiveDown ? -1 : 1);
  const yOf = (v: number) => MID - (sign * v / scale) * (MID - PAD);

  /** The drawn curve as an SVG path, sampled densely enough for a cubic. */
  const path = $derived.by(() => {
    const n = 80;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      d += `${i === 0 ? 'M' : 'L'}${xOf(t).toFixed(1)},${yOf(sketchValueAt(sketch, t)).toFixed(1)} `;
    }
    return d.trim();
  });

  const refPath = $derived.by(() => {
    if (!reference || reference.length < 2) return '';
    return reference
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i / (reference!.length - 1)).toFixed(1)},${yOf(v).toFixed(1)}`)
      .join(' ');
  });

  // ── Dragging ────────────────────────────────────────────────
  let svgEl = $state<SVGSVGElement | null>(null);
  let dragging = $state<number | null>(null);

  function commit(next: Sketch) {
    sketch = next;
    onchange?.(next);
  }

  function pointerDown(i: number, e: PointerEvent) {
    if (readonly) return;
    dragging = i;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function pointerMove(e: PointerEvent) {
    if (dragging === null || !svgEl) return;
    const r = svgEl.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;

    const pts = sketch.points.map(p => ({ ...p }));
    const i = dragging;
    pts[i].value = (((MID - py) / (MID - PAD)) * scale) / sign;
    // The ends belong to the member's ends; only interior ordinates slide.
    if (i > 0 && i < pts.length - 1) {
      const t = (px - PAD) / (W - 2 * PAD);
      pts[i].t = Math.min(pts[i + 1].t - 0.02, Math.max(pts[i - 1].t + 0.02, t));
    }
    commit({ ...sketch, points: pts });
  }

  function pointerUp() { dragging = null; }

  // ── Ordinates and spans ─────────────────────────────────────
  function addPoint() {
    // Split the widest span, which is where a student who needs another
    // ordinate almost always needs it.
    let at = 0, widest = -1;
    for (let i = 0; i < sketch.points.length - 1; i++) {
      const w = sketch.points[i + 1].t - sketch.points[i].t;
      if (w > widest) { widest = w; at = i; }
    }
    const a = sketch.points[at], b = sketch.points[at + 1];
    const mid = { t: (a.t + b.t) / 2, value: (a.value + b.value) / 2 };
    const points = [...sketch.points.slice(0, at + 1), mid, ...sketch.points.slice(at + 1)];
    const powers = [...sketch.powers.slice(0, at), sketch.powers[at], sketch.powers[at], ...sketch.powers.slice(at + 1)];
    const vs = sketch.vertices ?? sketch.powers.map(() => 'start' as SketchVertex);
    const vertices = [...vs.slice(0, at), vs[at], vs[at], ...vs.slice(at + 1)];
    commit({ points, powers, vertices });
  }

  function removePoint(i: number) {
    if (sketch.points.length <= 2 || i === 0 || i === sketch.points.length - 1) return;
    const points = sketch.points.filter((_, k) => k !== i);
    const powers = sketch.powers.filter((_, k) => k !== i);
    const vs = sketch.vertices ?? sketch.powers.map(() => 'start' as SketchVertex);
    commit({ points, powers, vertices: vs.filter((_, k) => k !== i) });
  }

  function setPower(i: number, p: SketchPower) {
    const powers = sketch.powers.map((v, k) => (k === i ? p : v));
    commit({ ...sketch, powers });
  }

  function setVertex(i: number, v: SketchVertex) {
    const vs = (sketch.vertices ?? sketch.powers.map(() => 'start' as SketchVertex)).map((x, k) => (k === i ? v : x));
    commit({ ...sketch, vertices: vs });
  }

  function setValue(i: number, raw: string) {
    const n = readAnswer(raw);
    if (n === null) return;
    const points = sketch.points.map((p, k) => (k === i ? { ...p, value: n } : p));
    commit({ ...sketch, points });
  }

  const POWER_LABEL: Record<SketchPower, string> = {
    zero: '0', constant: 'cte', linear: 'lin', quadratic: 'x²', cubic: 'x³',
  };
</script>

<div class="ds">
  <svg
    bind:this={svgEl}
    class="ds-plot"
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label={tr('edu.sketch.aria')}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointerleave={pointerUp}
  >
    <!-- The member, and the zero axis it is measured from. -->
    <line class="ds-axis" x1={PAD} y1={MID} x2={W - PAD} y2={MID} />

    <!--
      Which way is positive.
      ──────────────────────
      Without this the student has to guess the sign convention before they
      can start, and a diagram drawn perfectly upside down fails for a reason
      that has nothing to do with what the exercise is asking.
    -->
    <text class="ds-sign" x={2} y={PAD + 4}>{positiveDown ? '−' : '+'}</text>
    <text class="ds-sign" x={2} y={H - 3}>{positiveDown ? '+' : '−'}</text>

    {#if refPath}
      <!-- The real diagram, shown only once the answer has been marked. -->
      <path class="ds-ref" d={refPath} />
    {/if}

    <path class="ds-curve" d={path} />

    {#each sketch.points as p, i (i)}
      <circle
        class="ds-pt"
        class:fixed={i === 0 || i === sketch.points.length - 1}
        cx={xOf(p.t)}
        cy={yOf(p.value)}
        r={readonly ? 3 : 5}
        onpointerdown={(e) => pointerDown(i, e)}
        role="slider"
        tabindex={readonly ? -1 : 0}
        aria-label="{tr('edu.sketch.ordinate')} {i + 1}"
        aria-valuenow={p.value}
        onkeydown={(e) => {
          if (readonly) return;
          const step = scale / 20;
          if (e.key === 'ArrowUp') { setValue(i, String(p.value + step)); e.preventDefault(); }
          if (e.key === 'ArrowDown') { setValue(i, String(p.value - step)); e.preventDefault(); }
        }}
      />
    {/each}
  </svg>

  {#if !readonly}
    <div class="ds-rows">
      {#each sketch.points as p, i (i)}
        <div class="ds-row">
          <span class="ds-tag">x/L {p.t.toFixed(2)}</span>
          <input
            class="ds-val"
            type="number"
            value={Number(p.value.toFixed(3))}
            oninput={(e) => setValue(i, (e.target as HTMLInputElement).value)}
          />
          <span class="ds-unit">{unit}</span>
          {#if i > 0 && i < sketch.points.length - 1}
            <button class="ds-del" onclick={() => removePoint(i)} title={tr('edu.sketch.removePoint')}>✕</button>
          {/if}
        </div>

        {#if i < sketch.points.length - 1}
          <div class="ds-span">
            <span class="ds-span-tag">{tr('edu.sketch.span')} {i + 1}</span>
            <span class="ds-powers">
              {#each SKETCH_POWERS as pw}
                <button
                  class="ds-pw"
                  class:on={sketch.powers[i] === pw}
                  onclick={() => setPower(i, pw)}
                  title={tr('edu.sketch.power.' + pw)}
                >{POWER_LABEL[pw]}</button>
              {/each}
            </span>
            {#if sketch.powers[i] === 'quadratic' || sketch.powers[i] === 'cubic'}
              <!-- Which end has zero slope. Only a curve has one. -->
              <span class="ds-vertex">
                <button
                  class="ds-pw"
                  class:on={(sketch.vertices?.[i] ?? 'start') === 'start'}
                  onclick={() => setVertex(i, 'start')}
                  title={tr('edu.sketch.flatStart')}
                >⌐</button>
                <button
                  class="ds-pw"
                  class:on={(sketch.vertices?.[i] ?? 'start') === 'end'}
                  onclick={() => setVertex(i, 'end')}
                  title={tr('edu.sketch.flatEnd')}
                >¬</button>
              </span>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    <button class="ds-add" onclick={addPoint}>{tr('edu.sketch.addPoint')}</button>
  {/if}
</div>

<style>
  .ds { display: flex; flex-direction: column; gap: 6px; }

  .ds-plot {
    width: 100%;
    height: auto;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    touch-action: none;
  }

  .ds-axis { stroke: var(--st-hair-strong); stroke-width: 1; }

  .ds-sign {
    fill: var(--st-text-3);
    font-family: var(--st-mono);
    font-size: 9px;
  }

  .ds-curve {
    fill: none;
    stroke: var(--st-accent);
    stroke-width: 2;
    stroke-linejoin: round;
  }

  /* The real diagram, once marking has revealed it: present but clearly not
     the student's line. */
  .ds-ref {
    fill: none;
    stroke: var(--st-ok);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
    opacity: 0.85;
  }

  .ds-pt {
    fill: var(--st-accent);
    stroke: var(--st-bg);
    stroke-width: 1.5;
    cursor: grab;
  }

  .ds-pt.fixed { fill: var(--st-text-2); }
  .ds-pt:active { cursor: grabbing; }

  .ds-rows { display: flex; flex-direction: column; gap: 3px; }

  .ds-row, .ds-span {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
  }

  .ds-span { padding-left: 10px; border-left: 2px solid var(--st-hair); margin: 1px 0 3px; }

  .ds-tag, .ds-span-tag {
    font-family: var(--st-mono);
    font-size: 0.6rem;
    color: var(--st-text-3);
    min-width: 62px;
  }

  .ds-val {
    width: 74px;
    padding: 2px 5px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: var(--st-mono);
    font-size: 0.68rem;
    text-align: right;
  }

  .ds-val:focus { outline: none; border-color: var(--st-focus); }
  .ds-unit { color: var(--st-text-3); font-size: 0.62rem; }

  .ds-del {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.62rem;
  }

  .ds-del:hover { color: var(--st-danger); }

  .ds-powers, .ds-vertex { display: inline-flex; gap: 2px; }

  .ds-pw {
    min-width: 24px;
    padding: 1px 5px;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-mono);
    font-size: 0.62rem;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .ds-pw:hover { border-color: var(--st-hair-strong); color: var(--st-text); }

  .ds-pw.on {
    background: var(--st-accent);
    border-color: var(--st-accent);
    color: var(--st-text-on-accent);
  }

  .ds-add {
    align-self: flex-start;
    background: none;
    border: 1px dashed var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-3);
    font-family: var(--st-sans);
    font-size: 0.66rem;
    padding: 2px 8px;
    cursor: pointer;
  }

  .ds-add:hover { color: var(--st-text); border-color: var(--st-text-3); }
</style>
