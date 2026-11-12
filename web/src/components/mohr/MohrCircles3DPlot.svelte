<script lang="ts">
  import { equalFrame, ticks, mergeCoincident, labelRows } from '../../lib/mohr/plot';
  import type { Unit } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import type { Focus3D } from './focus';

  let { values, sigmaN, tauN, unit, focus = $bindable(null), onprincipal, onmaxshear }: {
    values: [number, number, number]; sigmaN: number; tauN: number; unit: Unit; focus?: Focus3D;
    onprincipal: (i: 0 | 1 | 2) => void; onmaxshear: () => void;
  } = $props();

  let cw = $state(0);
  const W = $derived(Math.max(260, Math.round(cw) || 420));
  const H = $derived(Math.round(Math.min(380, Math.max(240, W * 0.66))));
  const box = $derived({ left: 44, top: 28, width: W - 44 - 12, height: H - 28 - 44 });
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
      yr = [-m * 0.3, m];
    } else {
      xr = Math.abs(C) < 2.5 * R ? [Math.min(s3, 0), Math.max(s1, 0)] : [s3, s1];
      yr = [-0.22 * R, R];
    }
    const pad = 0.12 * Math.max(xr[1] - xr[0], yr[1] - yr[0]);
    return equalFrame(box, [xr[0] - pad, xr[1] + pad], [yr[0] - pad * 0.4, yr[1] + pad]);
  });
  const xTicks = $derived(ticks(frame.xMin, frame.xMax, Math.max(3, Math.round(box.width / 80))));
  const yTicks = $derived(ticks(Math.max(0, frame.yMin), frame.yMax, Math.max(2, Math.round(box.height / 70))));
  const tickLabel = $derived.by(() => { const step = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1; return formatter(step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))); });
  const y0 = $derived(frame.y(0));

  const half = (cx: number, r: number) => `M${cx - r} ${y0}A${r} ${r} 0 0 1 ${cx + r} ${y0}`;
  const circles = $derived([[s1, s3], [s1, s2], [s2, s3]].map(([a, b]) => ({ cx: frame.x((a + b) / 2), r: ((a - b) / 2) * frame.scale })));
  const region = $derived.by(() => {
    const [big, a, b] = circles;
    if (big.r < 0.01) return '';
    const inner = (k: { cx: number; r: number }) => (k.r < 0.01 ? '' : `A${k.r} ${k.r} 0 0 0 ${k.cx - k.r} ${y0}`);
    return `M${big.cx - big.r} ${y0}A${big.r} ${big.r} 0 0 1 ${big.cx + big.r} ${y0}${inner(a)}${inner(b)}Z`;
  });

  const SUB = ['₁', '₂', '₃'];
  const labels = $derived.by(() => {
    const groups = mergeCoincident([{ key: '0', value: s1 }, { key: '1', value: s2 }, { key: '2', value: s3 }], 1e-9 * scaleRef);
    const items = groups.map((g) => ({ x: frame.x(g.value), first: Number(g.keys[0]) as 0 | 1 | 2, keys: g.keys.map(Number), text: `${g.keys.map((k) => `σ${SUB[Number(k)]}`).join(' = ')} = ${fmt(g.value)}` }));
    const rows = labelRows(items.map((i) => i.x), 104);
    return items.map((it, i) => {
      const w = it.text.length * 7.3;
      return { ...it, lx: Math.min(W - 4 - w / 2, Math.max(4 + w / 2, it.x)), y: y0 + 18 + rows[i] * 15 };
    });
  });
  const P = $derived({ x: frame.x(sigmaN), y: frame.y(tauN) });
  const pointLabel = $derived.by(() => {
    const text = `n (${fmt(sigmaN)}; ${fmt(tauN)})`;
    const w = text.length * 7.3;
    const right = P.x + 12 + w <= W - 4;
    if (!right && P.x - 12 - w < box.left + 2) {
      const cx = Math.min(W - 4 - w / 2, Math.max(box.left + 2 + w / 2, P.x));
      return { text, x: cx, anchor: 'middle', y: P.y - 16 > box.top + 12 ? P.y - 16 : P.y + 24 };
    }
    const x0 = right ? P.x + 12 : P.x - 12 - w;
    const tx = frame.x(C), ty = frame.y(R) - 10, tw = 90;
    const above = Math.max(box.top + 12, P.y - 10);
    const clash = !point && x0 < tx + tw / 2 && x0 + w > tx - tw / 2 && Math.abs(above - ty) < 16;
    return { text, x: right ? P.x + 12 : P.x - 12, anchor: right ? 'start' : 'end', y: clash ? Math.min(y0 - 6, P.y + 20) : above };
  });
  const keyFor = (i: number) => (['s1', 's2', 's3'] as const)[i];
  const act = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
</script>

<div class="mh-plot-box" bind:clientWidth={cw}>
<svg class="mh-plot" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={tm('mohr.circles3dLabel')} data-testid="mohr3d-circles">
  <title>{tm('mohr.circles3dLabel')}</title>
  {#each xTicks as v (v)}
    <line class="mh-grid" x1={frame.x(v)} x2={frame.x(v)} y1={box.top} y2={box.top + box.height} />
    <text class="mh-tick" x={frame.x(v)} y={box.top + box.height + 16} text-anchor="middle">{tickLabel(v)}</text>
  {/each}
  {#each yTicks as v (v)}
    <line class="mh-grid" y1={frame.y(v)} y2={frame.y(v)} x1={box.left} x2={box.left + box.width} />
    <text class="mh-tick" x={box.left - 6} y={frame.y(v) + 4} text-anchor="end">{tickLabel(v)}</text>
  {/each}
  <line class="mh-axis" x1={box.left} x2={box.left + box.width} y1={y0} y2={y0} />
  {#if frame.xMin < 0 && frame.xMax > 0}<line class="mh-axis" x1={frame.x(0)} x2={frame.x(0)} y1={box.top} y2={box.top + box.height} />{/if}
  <text class="mh-axis-title" x={box.left + box.width} y={box.top + box.height + 34} text-anchor="end">σn [{unit}]</text>
  <text class="mh-axis-title" x={box.left + 4} y={box.top - 10}>τn [{unit}]</text>

  {#if !point}
    <path class="mh-region" d={region} />
    {#each circles as c, i (i)}{#if c.r > 0.01}<path class="mh-circle mh-circle-open" d={half(c.cx, c.r)} />{/if}{/each}
    <g class="mh-hit" class:mh-on={focus === 'tmax'} role="button" tabindex="0" aria-label={tm('mohr.goShear3d')} data-testid="mohr3d-go-tmax"
      onpointerenter={() => (focus = 'tmax')} onpointerleave={() => (focus = null)} onfocus={() => (focus = 'tmax')} onblur={() => (focus = null)}
      onclick={onmaxshear} onkeydown={act(onmaxshear)}>
      <circle class="mh-hit-area" cx={frame.x(C)} cy={frame.y(R)} r="16" />
      <circle class="mh-shear-pt" cx={frame.x(C)} cy={frame.y(R)} r="4.5" />
    </g>
    <text class="mh-shear-text mh-value" x={frame.x(C)} y={frame.y(R) - 10} text-anchor="middle">τ<tspan class="mh-sub" dy="3">max</tspan><tspan dy="-3"> {fmt(R)}</tspan></text>
    <line class="mh-drop" x1={P.x} y1={P.y} x2={P.x} y2={y0} />
  {/if}
  {#each labels as l (l.text)}
    <g class="mh-hit" class:mh-on={l.keys.some((k) => focus === keyFor(k))} role="button" tabindex="0" aria-label={`${tm('mohr.goPrincipal3d')}: ${l.text}`} data-testid={`mohr3d-go-s${l.first + 1}`}
      onpointerenter={() => (focus = keyFor(l.first))} onpointerleave={() => (focus = null)} onfocus={() => (focus = keyFor(l.first))} onblur={() => (focus = null)}
      onclick={() => onprincipal(l.first)} onkeydown={act(() => onprincipal(l.first))}>
      <circle class="mh-hit-area" cx={l.x} cy={y0} r="16" />
      <circle class="mh-principal-pt" cx={l.x} cy={y0} r="5" />
    </g>
    <text class="mh-principal-label" class:mh-on={l.keys.some((k) => focus === keyFor(k))} x={l.lx} y={l.y} text-anchor="middle" data-testid="mohr3d-principal-label">{l.text}</text>
  {/each}
  <circle class="mh-rot-halo" cx={P.x} cy={P.y} r="11" />
  <circle class="mh-rot-pt" cx={P.x} cy={P.y} r="6" data-testid="mohr3d-point" />
  <text class="mh-rot-label mh-value" x={pointLabel.x} y={pointLabel.y} text-anchor={pointLabel.anchor}>{pointLabel.text}</text>
</svg>
</div>
