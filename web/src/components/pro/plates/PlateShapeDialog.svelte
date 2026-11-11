<script lang="ts">
  import Hint from '../Hint.svelte';
  /**
   * A plate's shape on its drawing (`store/plate-shape.ts`): cells of its mesh picked and taken
   * out, as a hole inside it or a notch along its outline; holes closed again; a side picked and
   * curved by its sagitta. The drawing is the plate's mesh when it has a current one, else the mesh
   * its settings would give.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import { plateEntry } from '../../../lib/store/physical-plates';
  import { closePlateHole, cutPlateCells, plateFigure, plateSideShapes, setPlateSideSagitta, type PlateShapeProblem } from '../../../lib/store/plate-shape';
  import { plateGeometry, plateLoops } from '../../../lib/model/physical/plate';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import { portal } from '../../../lib/utils/portal';
  import { meshSizeText } from './plate-state';

  let { id, onclose, start = 'holes' }: { id: number; onclose: () => void; start?: 'holes' | 'sides' } = $props();

  let mode = $state<'holes' | 'sides'>(start);
  let chosen = $state<Set<number>>(new Set());
  let side = $state<number | null>(null);
  let sagitta = $state(0);
  let message = $state<string | null>(null);

  const entry = $derived.by(() => { void modelStore.modelVersion; void modelStore.model.groups; return plateEntry(id); });
  const figure = $derived.by(() => { void entry; return plateFigure(id); });
  const sides = $derived.by(() => { void entry; return plateSideShapes(id); });
  const holes = $derived(entry ? plateLoops(entry.group).holes : []);

  const W = 640, H = 420, PAD = 28;
  type P2 = [number, number];
  const view = $derived.by(() => {
    const geo = entry ? plateGeometry(modelStore, entry.group) : null;
    if (!figure || !geo) return null;
    const f = figure.frame;
    const proj = (p: readonly number[]): P2 => { const d = [p[0]! - f.o[0], p[1]! - f.o[1], p[2]! - f.o[2]]; return [d[0]! * f.u[0] + d[1]! * f.u[1] + d[2]! * f.u[2], d[0]! * f.v[0] + d[1]! * f.v[1] + d[2]! * f.v[2]]; };
    const outline = geo.outer.map(proj), holeLoops = geo.holes.map((h) => h.map(proj)), pts = figure.points.map(proj);
    const all = [...outline, ...pts];
    const x0 = Math.min(...all.map((q) => q[0])), x1 = Math.max(...all.map((q) => q[0])), y0 = Math.min(...all.map((q) => q[1])), y1 = Math.max(...all.map((q) => q[1]));
    const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-9), (H - 2 * PAD) / Math.max(y1 - y0, 1e-9));
    const s = (q: P2): P2 => [PAD + (q[0] - x0) * k, H - PAD - (q[1] - y0) * k];
    const str = (l: P2[]) => l.map((q) => { const [x, y] = s(q); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
    const at = (n: number) => { const p = modelStore.nodes.get(n); return p ? proj([p.x, p.y, p.z ?? 0]) : null; };
    const sidePaths = sides.map((sd) => {
      const a = at(sd.from), b = at(sd.to), m = sd.mid !== null ? at(sd.mid) : null;
      const line = a && b ? (m ? arc(a, m, b) : [a, b]) : [];
      const mid = line[Math.floor(line.length / 2)] ?? (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as P2 : null);
      return { points: str(line), label: mid ? s(mid) : null };
    });
    const centres = figure.cells.map((c) => s([c.reduce((t, i) => t + pts[i]![0], 0) / c.length, c.reduce((t, i) => t + pts[i]![1], 0) / c.length]));
    return { cells: figure.cells.map((c) => str(c.map((i) => pts[i]!))), centres, outline: str(outline), holes: holeLoops.map(str), sides: sidePaths };
  });

  /** The points of the circular arc from a through m to b. */
  function arc(a: P2, m: P2, b: P2, n = 32): P2[] {
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    if (Math.abs(d) < 1e-12) return [a, b];
    const sq = (p: P2) => p[0] * p[0] + p[1] * p[1];
    const cx = (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d;
    const cy = (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d;
    const r = Math.hypot(a[0] - cx, a[1] - cy);
    const ang = (p: P2) => Math.atan2(p[1] - cy, p[0] - cx);
    const ta = ang(a), tm = ang(m), tb = ang(b);
    const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const ccw = norm(tm - ta) < norm(tb - ta);
    const sweep = ccw ? norm(tb - ta) : -norm(ta - tb);
    return Array.from({ length: n + 1 }, (_, i) => { const th = ta + (sweep * i) / n; return [cx + r * Math.cos(th), cy + r * Math.sin(th)] as P2; });
  }

  /** A press on a cell toggles it; a drag from it marks (or unmarks, from a marked one) every cell whose centre the box takes. */
  let svgEl = $state<SVGSVGElement | null>(null);
  let drag = $state<{ cell: number; adding: boolean; base: Set<number>; from: P2; to: P2; moved: boolean } | null>(null);
  const svgPoint = (e: PointerEvent): P2 => {
    const m = svgEl?.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  function pressCell(i: number, e: PointerEvent) {
    if (mode !== 'holes') return;
    e.preventDefault();
    const at = svgPoint(e);
    drag = { cell: i, adding: !chosen.has(i), base: new Set(chosen), from: at, to: at, moved: false };
  }
  function moveDrag(e: PointerEvent) {
    if (!drag || !view) return;
    const to = svgPoint(e);
    const moved = drag.moved || Math.hypot(to[0] - drag.from[0], to[1] - drag.from[1]) > 4;
    drag = { ...drag, to, moved };
    if (!moved) return;
    const [xa, xb] = [Math.min(drag.from[0], to[0]), Math.max(drag.from[0], to[0])], [ya, yb] = [Math.min(drag.from[1], to[1]), Math.max(drag.from[1], to[1])];
    const next = new Set(drag.base);
    view.centres.forEach(([x, y], i) => { if ((x >= xa && x <= xb && y >= ya && y <= yb) || i === drag!.cell) { if (drag!.adding) next.add(i); else next.delete(i); } });
    chosen = next;
  }
  function endDrag() {
    if (drag && !drag.moved) {
      const next = new Set(drag.base);
      if (drag.adding) next.add(drag.cell); else next.delete(drag.cell);
      chosen = next;
    }
    drag = null;
  }

  const say = (p: PlateShapeProblem | null, ok: string) => { message = p ? t(`plates.shapeProblem.${p}`) : ok; };
  function cut() {
    if (!figure) return;
    const n = chosen.size;
    const p = cutPlateCells(id, figure, chosen);
    say(p, tp('plates.shape.cut', { n }));
    if (!p) chosen = new Set();
  }
  function closeHole(k: number) { say(closePlateHole(id, k), t('plates.shape.holeClosed')); }
  function pickSide(k: number) { if (mode !== 'sides') return; side = k; sagitta = sides[k]?.sagitta ?? 0; message = null; }
  function curve(value: number) {
    if (side === null) return;
    say(setPlateSideSagitta(id, side, value), Math.abs(value) < 1e-9 ? t('plates.shape.straightened') : t('plates.shape.curved'));
    sagitta = sides[side]?.sagitta ?? value;
  }
  const picked = $derived(side !== null ? sides[side] ?? null : null);
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} onpointermove={moveDrag} onpointerup={endDrag} />

<div class="psd-host">
<div class="psd-overlay" use:portal onclick={onclose} role="presentation">
  <div class="psd" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('plates.shape.title')} data-testid="plate-shape-dialog" tabindex="-1">
    <h3>{tp('plates.shape.titleOf', { name: entry?.name ?? '' })}</h3>
    <div class="psd-seg" role="group" aria-label={t('plates.shape.title')}>
      <button class:on={mode === 'holes'} aria-pressed={mode === 'holes'} onclick={() => { mode = 'holes'; side = null; message = null; }} data-testid="plate-shape-holes">{t('plates.holes')}</button>
      <button class:on={mode === 'sides'} aria-pressed={mode === 'sides'} onclick={() => { mode = 'sides'; chosen = new Set(); message = null; }} data-testid="plate-shape-sides">{t('plates.sides')}</button>
    </div>
    <Hint text={t(mode === 'holes' ? 'plates.shape.holesHint' : 'plates.shape.sidesHint')} />
    {#if figure?.source === 'plan' && entry}<p class="psd-note" data-testid="plate-shape-planned">{tp('plates.shape.planned', { size: meshSizeText(entry.surface.mesh.size) })}</p>{/if}

    {#if view}
      <svg class="psd-svg" class:holes={mode === 'holes'} viewBox="0 0 {W} {H}" role="img" aria-label={t('plates.drawingLabel')} data-testid="plate-shape-drawing" bind:this={svgEl}>
        <polygon class="psd-outline" points={view.outline} />
        {#each view.cells as pts, i (i)}
          <polygon class="psd-cell" class:on={chosen.has(i)} points={pts} data-testid="plate-shape-cell-{i}" onpointerdown={(e) => pressCell(i, e)} />
        {/each}
        {#each view.holes as pts, k (k)}<polygon class="psd-hole" points={pts} data-testid="plate-shape-hole-{k}" />{/each}
        {#if drag?.moved}
          <rect class="psd-box" x={Math.min(drag.from[0], drag.to[0])} y={Math.min(drag.from[1], drag.to[1])} width={Math.abs(drag.to[0] - drag.from[0])} height={Math.abs(drag.to[1] - drag.from[1])} />
        {/if}
        {#each view.sides as sd, k (k)}
          <polyline class="psd-side" class:sel={side === k} class:curved={sides[k]?.mid !== null} points={sd.points} />
          {#if mode === 'sides'}
            <polyline class="psd-side-hit" points={sd.points} onclick={() => pickSide(k)} data-testid="plate-shape-side-{k}" role="button" tabindex="0" aria-label={tp('plates.shape.sideN', { n: k + 1 })}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickSide(k); }} />
            {#if sd.label}<text class="psd-label" x={sd.label[0]} y={sd.label[1]} text-anchor="middle" dominant-baseline="middle">{k + 1}</text>{/if}
          {/if}
        {/each}
      </svg>
    {:else}
      <p class="psd-note">{t('plates.shape.noDrawing')}</p>
    {/if}

    {#if mode === 'holes'}
      <div class="psd-row">
        <button class="psd-btn primary" disabled={!chosen.size} onclick={cut} data-testid="plate-shape-cut">{tp('plates.shape.cutN', { n: chosen.size })}</button>
        <button class="psd-btn" disabled={!chosen.size} onclick={() => (chosen = new Set())} data-testid="plate-shape-clear">{t('plates.shape.clearPick')}</button>
      </div>
      {#each holes as h, k (k)}
        <div class="psd-row" data-testid="plate-shape-hole-row-{k}">
          <span>{tp('plates.shape.holeN', { n: k + 1, corners: h.length })}</span>
          <button class="psd-btn" onclick={() => closeHole(k)} data-testid="plate-shape-close-{k}">{t('plates.shape.closeHole')}</button>
        </div>
      {/each}
    {:else if picked && side !== null}
      <div class="psd-row" data-testid="plate-shape-side-edit">
        <strong>{tp('plates.shape.sideN', { n: side + 1 })}</strong>
        <span class="psd-dim">{fmtQ(picked.length, 'length')} {unitQ('length')}</span>
        {#if picked.followsMember}
          <span>{t('plates.shape.followsMember')}</span>
        {:else}
          <label>{t('plates.shape.sagitta')}
            <QuantityInput value={sagitta} quantity="length" cls="psd-num" testid="plate-shape-sagitta" onchange={(v) => (sagitta = v)} />
          </label>
          <button class="psd-btn primary" disabled={Math.abs(sagitta) < 1e-9} onclick={() => curve(sagitta)} data-testid="plate-shape-curve">{t('plates.sideCurve')}</button>
          <button class="psd-btn" disabled={picked.mid === null} onclick={() => curve(0)} data-testid="plate-shape-straight">{t('plates.sideStraighten')}</button>
        {/if}
      </div>
      {#if !picked.followsMember}<Hint text={tp('plates.shape.sagittaHint', { max: fmtQ(picked.length / 2, 'length'), unit: unitQ('length') })} />{/if}
    {/if}

    {#if message}<p class="psd-msg" data-testid="plate-shape-message">{message}</p>{/if}
    <div class="psd-actions"><button class="psd-btn" onclick={onclose} data-testid="plate-shape-close">{t('plates.close')}</button></div>
  </div>
</div>
</div>

<style>
  .psd-host { display: contents; }
  .psd-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
  .psd { width: min(720px, 100%); max-height: 92vh; overflow: auto; background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); padding: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 0.76rem; }
  h3 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  .psd-seg { display: inline-flex; align-self: flex-start; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .psd-seg button { padding: 3px 10px; background: none; border: none; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .psd-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .psd-seg button.on { background: var(--st-accent); color: #fff; }
  .psd-note, .psd-dim { margin: 0; color: var(--st-text-3); }
  .psd-svg { width: 100%; height: auto; background: var(--st-ink); border: 1px solid var(--st-hair); border-radius: var(--st-radius); touch-action: none; user-select: none; }
  .psd-outline { fill: none; stroke: none; }
  .psd-cell { fill: rgba(78, 205, 196, 0.1); stroke: rgba(78, 205, 196, 0.55); stroke-width: 0.7; }
  .psd-svg.holes .psd-cell { cursor: pointer; }
  .psd-svg.holes .psd-cell:hover { fill: rgba(78, 205, 196, 0.28); }
  .psd-cell.on, .psd-svg.holes .psd-cell.on:hover { fill: var(--st-danger, #e06c6c); fill-opacity: 0.55; stroke: var(--st-danger, #e06c6c); }
  .psd-box { fill: none; stroke: var(--st-text); stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; }
  .psd-hole { fill: var(--st-ink); stroke: var(--st-warn, #d9a441); stroke-width: 1.5; stroke-dasharray: 4 3; }
  .psd-side { fill: none; stroke: var(--st-text); stroke-width: 2; }
  .psd-side.curved { stroke: var(--st-warn, #d9a441); }
  .psd-side.sel { stroke: var(--st-accent); stroke-width: 4; }
  .psd-side-hit { fill: none; stroke: transparent; stroke-width: 16; cursor: pointer; }
  .psd-side-hit:focus-visible { outline: none; stroke: var(--st-focus, #6aa9ff); stroke-opacity: 0.4; }
  .psd-label { fill: var(--st-text); font-size: 12px; font-weight: 600; paint-order: stroke; stroke: var(--st-ink); stroke-width: 3px; pointer-events: none; }
  .psd-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .psd-row label { display: inline-flex; gap: 5px; align-items: center; }
  .psd :global(input.psd-num) { width: 72px; padding: 2px 5px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font-family: var(--st-font-mono, monospace); }
  .psd-msg { margin: 0; color: var(--st-text); }
  .psd-actions { display: flex; justify-content: flex-end; }
  .psd-btn { padding: 4px 12px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .psd-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .psd-btn:disabled { opacity: 0.5; cursor: default; }
</style>
