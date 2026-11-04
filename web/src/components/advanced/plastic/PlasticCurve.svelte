<script lang="ts">
  /**
   * λ against a displacement or a rotation the reader picks: a node and a
   * component, or the plastic rotation of a hinge. One point per event, straight
   * between them, and the collapse plateau. Saved as CSV or PNG.
   */
  import { t, tp } from '../../../lib/i18n';
  import type { PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';
  import { curveSeries, defaultAxis, niceTicks, curveCsv, type CurveAxis } from '../../../lib/engine/plastic/curve';
  import { plasticCourse } from '../../../lib/store/plastic-course.svelte';
  import { toQ, unitQ, fmtQ } from '../../../lib/store/display-units.svelte';
  import { downloadText, downloadDataUrlPNG } from '../../../lib/store/file';
  import PlasticSection from './PlasticSection.svelte';

  let { r }: { r: PlasticCollapseResult } = $props();

  const W = 280, H = 168, PL = 40, PR = 12, PT = 10, PB = 34;
  let svg = $state<SVGSVGElement | null>(null);
  let hover = $state<number | null>(null);

  const axis = $derived<CurveAxis | null>(plasticCourse.axis ?? defaultAxis(r));
  const nodes = $derived([...new Set(r.steps[0]?.results.displacements.map((d) => d.nodeId) ?? [])].sort((a, b) => a - b));
  const bending = $derived(r.hinges.map((h, i) => ({ h, i })).filter(({ h }) => h.kind === 'bending'));
  const key = (a: CurveAxis | null) => (!a ? '' : a.kind === 'node' ? `n:${a.node}:${a.dof}` : `h:${a.hinge}`);
  const parse = (k: string): CurveAxis => {
    const [kind, a, b] = k.split(':');
    return kind === 'n' ? { kind: 'node', node: +a, dof: b as 'ux' | 'uz' | 'ry' } : { kind: 'hinge', hinge: +a };
  };
  const quantity = $derived(axis?.kind === 'node' && axis.dof !== 'ry' ? 'displacement' : 'rotation');
  const dofName = (d: string) => (d === 'ry' ? 'θ' : d);
  const label = $derived(!axis ? '' : axis.kind === 'node'
    ? tp('course.plastic.curve.nodeAxis', { dof: dofName(axis.dof), node: axis.node })
    : tp('course.plastic.curve.hingeAxis', { i: axis.hinge + 1 }));

  const pts = $derived(axis ? curveSeries(r, axis).map((p) => ({ ...p, x: toQ(p.x, quantity) })) : []);
  const geo = $derived.by(() => {
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p.x);
    const span = Math.max(...xs) - Math.min(...xs) || 1;
    const lastDx = xs[xs.length - 1] - xs[xs.length - 2];
    const plateau = r.isMechanism ? xs[xs.length - 1] + (lastDx < 0 ? -1 : 1) * 0.2 * span : null;
    const lo = Math.min(0, ...xs, plateau ?? 0), hi = Math.max(0, ...xs, plateau ?? 0);
    const xt = niceTicks(lo, hi), yt = niceTicks(0, Math.max(...pts.map((p) => p.lambda)) * 1.08);
    const x0 = Math.min(lo, xt[0]), x1 = Math.max(hi, xt[xt.length - 1]) || 1;
    const y1 = Math.max(yt[yt.length - 1], 1e-9);
    const sx = (v: number) => PL + ((v - x0) / (x1 - x0 || 1)) * (W - PL - PR);
    const sy = (v: number) => H - PB - (v / y1) * (H - PT - PB);
    return { sx, sy, xt, yt, plateau };
  });
  const shown = $derived(pts[hover ?? pts.length - 1]);
  const fmtX = (v: number) => (quantity === 'displacement' ? fmtQ(v / toQ(1, 'displacement'), 'displacement') : fmtQ(v / toQ(1, 'rotation'), 'rotation'));
  const tick = (v: number) => String(+v.toPrecision(3));

  function saveCsv() {
    if (!axis) return;
    downloadText(curveCsv(pts, `${label} [${unitQ(quantity)}]`), 'lambda-curve.csv', 'text/csv');
  }

  function savePng() {
    if (!svg || !geo) return;
    const css = getComputedStyle(svg);
    const c = document.createElement('canvas');
    const k = 3;
    c.width = W * k; c.height = H * k;
    const g = c.getContext('2d')!;
    g.scale(k, k);
    g.fillStyle = css.getPropertyValue('--st-surface').trim() || '#fff';
    g.fillRect(0, 0, W, H);
    const ink = css.getPropertyValue('--st-text-2').trim() || '#444';
    const accent = css.getPropertyValue('--st-accent').trim() || '#e5482a';
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1; g.font = '9px sans-serif';
    g.beginPath(); g.moveTo(PL, PT); g.lineTo(PL, H - PB); g.lineTo(W - PR, H - PB); g.stroke();
    g.textAlign = 'center';
    for (const v of geo.xt) g.fillText(tick(v), geo.sx(v), H - PB + 11);
    g.fillText(`${label} [${unitQ(quantity)}]`, (PL + W - PR) / 2, H - 6);
    g.textAlign = 'right';
    for (const v of geo.yt) g.fillText(tick(v), PL - 4, geo.sy(v) + 3);
    g.fillText('λ', PL - 4, PT + 4);
    g.strokeStyle = accent; g.fillStyle = accent; g.lineWidth = 2;
    g.beginPath();
    pts.forEach((p, i) => { if (i === 0) g.moveTo(geo.sx(p.x), geo.sy(p.lambda)); else g.lineTo(geo.sx(p.x), geo.sy(p.lambda)); });
    g.stroke();
    if (geo.plateau !== null) {
      const lp = pts[pts.length - 1];
      g.setLineDash([4, 3]); g.beginPath(); g.moveTo(geo.sx(lp.x), geo.sy(lp.lambda)); g.lineTo(geo.sx(geo.plateau), geo.sy(lp.lambda)); g.stroke(); g.setLineDash([]);
    }
    for (const p of pts) { g.beginPath(); g.arc(geo.sx(p.x), geo.sy(p.lambda), 3, 0, Math.PI * 2); g.fill(); }
    downloadDataUrlPNG(c.toDataURL('image/png'));
  }
</script>

<PlasticSection testid="plastic-curve" title={t('course.plastic.curve.title')} summary={label} help={t('course.plastic.curve.help')}>
  <label class="cv-pick">
    <span>{t('course.plastic.curve.abscissa')}</span>
    <select value={key(axis)} onchange={(e) => (plasticCourse.axis = parse((e.currentTarget as HTMLSelectElement).value))} data-testid="plastic-curve-axis">
      <optgroup label={t('course.plastic.curve.nodes')}>
        {#each nodes as n (n)}
          {#each ['ux', 'uz', 'ry'] as d (d)}
            <option value={`n:${n}:${d}`}>{tp('course.plastic.curve.nodeAxis', { dof: dofName(d), node: n })}</option>
          {/each}
        {/each}
      </optgroup>
      {#if bending.length}
        <optgroup label={t('course.plastic.curve.hinges')}>
          {#each bending as b (b.i)}
            <option value={`h:${b.i}`}>{tp('course.plastic.curve.hingeAxis', { i: b.i + 1 })}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
  </label>
  {#if geo}
    <svg bind:this={svg} viewBox={`0 0 ${W} ${H}`} class="cv" role="img" aria-label={`λ – ${label}`} data-testid="plastic-curve-chart">
      <line class="ax" x1={PL} y1={PT} x2={PL} y2={H - PB} />
      <line class="ax" x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} />
      {#each geo.yt as v (v)}
        <line class="grid" x1={PL} x2={W - PR} y1={geo.sy(v)} y2={geo.sy(v)} />
        <text class="tk" x={PL - 4} y={geo.sy(v) + 3} text-anchor="end">{tick(v)}</text>
      {/each}
      {#each geo.xt as v (v)}
        <text class="tk" x={geo.sx(v)} y={H - PB + 11} text-anchor="middle">{tick(v)}</text>
      {/each}
      <text class="lab" x={PL - 4} y={PT + 2} text-anchor="end">λ</text>
      <text class="lab" x={(PL + W - PR) / 2} y={H - 6} text-anchor="middle">{label} [{unitQ(quantity)}]</text>
      <polyline class="ln" points={pts.map((p) => `${geo.sx(p.x)},${geo.sy(p.lambda)}`).join(' ')} />
      {#if geo.plateau !== null}
        {@const lp = pts[pts.length - 1]}
        <line class="ln plateau" x1={geo.sx(lp.x)} y1={geo.sy(lp.lambda)} x2={geo.sx(geo.plateau)} y2={geo.sy(lp.lambda)} />
        <text class="tk" x={geo.sx(geo.plateau)} y={geo.sy(lp.lambda) - 5} text-anchor={geo.plateau < lp.x ? 'start' : 'end'}>{t('course.plastic.curve.plateau')}</text>
      {/if}
      {#each pts as p, i (i)}
        <circle class="pt" class:on={hover === i} cx={geo.sx(p.x)} cy={geo.sy(p.lambda)} r={hover === i ? 5 : 4} />
        <circle class="hit" cx={geo.sx(p.x)} cy={geo.sy(p.lambda)} r="11" role="presentation"
          onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} onclick={() => (hover = i)} />
      {/each}
    </svg>
    <div class="cv-read" data-testid="plastic-curve-read">
      {#if shown}{tp('course.plastic.curve.read', { k: shown.step, lambda: shown.lambda.toFixed(3), x: fmtX(shown.x), unit: unitQ(quantity) })}{/if}
    </div>
    <div class="cv-actions">
      <button class="small-btn" onclick={saveCsv} data-testid="plastic-curve-csv">CSV</button>
      <button class="small-btn" onclick={savePng} data-testid="plastic-curve-png">PNG</button>
    </div>
  {/if}
</PlasticSection>

<style>
  .cv-pick { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; }
  .cv-pick span { font-size: 0.64rem; color: var(--st-text-3); }
  .cv-pick select {
    width: 100%; padding: 0.25rem 0.3rem; border: 1px solid var(--st-hair-strong); border-radius: 4px;
    background: var(--st-surface-2); color: var(--st-value); font-size: 0.7rem;
  }
  .cv { width: 100%; height: auto; display: block; }
  .ax { stroke: var(--st-text-3); stroke-width: 1; }
  .grid { stroke: var(--st-hair); stroke-width: 0.5; }
  .tk { fill: var(--st-text-3); font-size: 8.5px; font-variant-numeric: tabular-nums; }
  .lab { fill: var(--st-text-2); font-size: 9px; }
  .ln { fill: none; stroke: var(--st-accent); stroke-width: 2; stroke-linejoin: round; }
  .plateau { stroke-dasharray: 4 3; }
  .pt { fill: var(--st-accent); stroke: var(--st-surface); stroke-width: 1.5; }
  .pt.on { stroke: var(--st-text); }
  .hit { fill: transparent; cursor: pointer; }
  .cv-read { min-height: 1.3em; font-family: var(--st-mono); font-size: 0.64rem; color: var(--st-value); }
  .cv-actions { display: flex; gap: 4px; justify-content: flex-end; }
</style>
