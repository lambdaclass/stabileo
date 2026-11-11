<script lang="ts">
  import { equalFrame, ticks, mergeCoincident, labelRows } from '../../lib/mohr/plot';
  import type { Unit } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';

  let { values, sigmaN, tauN, unit }: { values: [number, number, number]; sigmaN: number; tauN: number; unit: Unit } = $props();

  const W = 420, H = 400;
  const box = { left: 52, top: 34, width: W - 52 - 18, height: H - 34 - 60 };
  const fmt = $derived(formatter(2));
  const [s1, s2, s3] = $derived(values);
  const scaleRef = $derived(Math.max(Math.abs(s1), Math.abs(s3), 1e-12));
  const R = $derived((s1 - s3) / 2), C = $derived((s1 + s3) / 2);
  const point = $derived(R <= 1e-9 * scaleRef);

  const frame = $derived.by(() => {
    let xr: [number, number], yr: [number, number];
    if (point) {
      const m = Math.max(Math.abs(C) * 0.5, 1);
      xr = [Math.min(C - m, 0), Math.max(C + m, 0)];
      yr = [-m, m];
    } else {
      xr = Math.abs(C) < 2.5 * R ? [Math.min(s3, 0), Math.max(s1, 0)] : [s3, s1];
      yr = [-R, R];
    }
    const pad = 0.18 * Math.max(xr[1] - xr[0], yr[1] - yr[0]);
    return equalFrame(box, [xr[0] - pad, xr[1] + pad], [yr[0] - pad, yr[1] + pad]);
  });
  const xTicks = $derived(ticks(frame.xMin, frame.xMax, 5));
  const yTicks = $derived(ticks(frame.yMin, frame.yMax, 5));
  const tickLabel = $derived.by(() => { const step = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1; return formatter(step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))); });
  const y0 = $derived(frame.y(0));

  const circles = $derived([[s1, s3], [s1, s2], [s2, s3]].map(([a, b]) => ({ cx: frame.x((a + b) / 2), r: ((a - b) / 2) * frame.scale })));
  const region = $derived.by(() => {
    const c = (cx: number, r: number) => r < 0.01 ? '' : `M${cx - r} ${y0}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    return circles.map((k) => c(k.cx, k.r)).join('');
  });

  const SUB = ['₁', '₂', '₃'];
  const labels = $derived.by(() => {
    const groups = mergeCoincident([{ key: '0', value: s1 }, { key: '1', value: s2 }, { key: '2', value: s3 }], 1e-9 * scaleRef);
    const items = groups.map((g) => ({ x: frame.x(g.value), text: `${g.keys.map((k) => `σ${SUB[Number(k)]}`).join(' = ')} = ${fmt(g.value)}` }));
    const rows = labelRows(items.map((i) => i.x), 92);
    return items.map((it, i) => {
      const w = it.text.length * 6.4;
      return { ...it, lx: Math.min(W - 4 - w / 2, Math.max(4 + w / 2, it.x)), y: y0 + 17 + rows[i] * 14 };
    });
  });
  const P = $derived({ x: frame.x(sigmaN), y: frame.y(tauN) });
  const pointLabel = $derived.by(() => {
    const text = `n (${fmt(sigmaN)}, ${fmt(tauN)})`;
    const w = text.length * 6.4;
    const right = P.x + 10 + w <= W - 4;
    return { text, x: right ? P.x + 10 : P.x - 10, anchor: right ? 'start' : 'end', y: Math.max(box.top + 12, P.y - 8) };
  });
</script>

<svg class="mh-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tm('mohr.circles3dLabel')} data-testid="mohr3d-circles">
  <title>{tm('mohr.circles3dLabel')}</title>
  <rect class="mh-frame" x={box.left} y={box.top} width={box.width} height={box.height} />
  {#each xTicks as v (v)}
    <line class="mh-grid" x1={frame.x(v)} x2={frame.x(v)} y1={box.top} y2={box.top + box.height} />
    <text class="mh-tick" x={frame.x(v)} y={box.top + box.height + 15} text-anchor="middle">{tickLabel(v)}</text>
  {/each}
  {#each yTicks as v (v)}
    <line class="mh-grid" y1={frame.y(v)} y2={frame.y(v)} x1={box.left} x2={box.left + box.width} />
    <text class="mh-tick" x={box.left - 6} y={frame.y(v) + 4} text-anchor="end">{tickLabel(v)}</text>
  {/each}
  <line class="mh-axis" x1={box.left} x2={box.left + box.width} y1={y0} y2={y0} />
  {#if frame.xMin < 0 && frame.xMax > 0}<line class="mh-axis" x1={frame.x(0)} x2={frame.x(0)} y1={box.top} y2={box.top + box.height} />{/if}
  <text class="mh-axis-title" x={box.left + box.width / 2} y={H - 12} text-anchor="middle">σn [{unit}]</text>
  <text class="mh-axis-title" x={box.left} y={box.top - 12}>τn [{unit}]</text>

  {#if !point}
    <path class="mh-region" d={region} fill-rule="evenodd" />
    {#each circles as c, i (i)}{#if c.r > 0.01}<circle class="mh-circle" cx={c.cx} cy={y0} r={c.r} />{/if}{/each}
    <circle class="mh-tau-pt" cx={frame.x(C)} cy={frame.y(R)} r="4" />
    <text class="mh-tau-label" x={frame.x(C)} y={frame.y(R) - 9} text-anchor="middle">τ<tspan class="mh-sub" dy="3">max</tspan><tspan dy="-3"> = {fmt(R)}</tspan></text>
    <line class="mh-drop" x1={P.x} y1={P.y} x2={P.x} y2={y0} />
  {/if}
  {#each labels as l (l.text)}
    <circle class="mh-principal-pt" cx={l.x} cy={y0} r="4.5" />
    <text class="mh-principal-label" x={l.lx} y={l.y} text-anchor="middle" data-testid="mohr3d-principal-label">{l.text}</text>
  {/each}
  <circle class="mh-rot-pt" cx={P.x} cy={P.y} r="6" data-testid="mohr3d-point" />
  <text class="mh-rot-label" x={pointLabel.x} y={pointLabel.y} text-anchor={pointLabel.anchor}>{pointLabel.text}</text>
</svg>
