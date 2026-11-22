<svelte:options namespace="svg" />

<script lang="ts">
  import { t } from '../../../lib/i18n';
  import type { Fmt } from '../../../lib/rc-sheets/format';
  import type { LineLayout } from '../../../lib/rc-sheets/beam-line';
  import { ENV_GAP, ENV_M, ENV_S, ENV_V, LEGEND, capacityPath, chartReach, filled, finite, leastPositive, steelChart, type ChartKind } from '../../../lib/rc-sheets/line-charts';

  let { line, X, top, left, right, kind, fmt }: { line: LineLayout; X: (x: number) => number; top: number; left: number; right: number; kind: ChartKind; fmt: Fmt } = $props();

  const muTop = $derived(Math.max(1e-6, ...line.envelope.flatMap((e) => [e.pos, e.neg])));
  const vuTop = $derived(Math.max(1e-6, ...line.shear.flatMap((e) => [e.vPos, e.vNeg])));
  const phiMTop = $derived(Math.max(0, ...line.envelope.flatMap((e) => [finite(e.phiPos), finite(e.phiNeg)])));
  const phiVTop = $derived(Math.max(0, ...line.shear.map((e) => finite(e.phiVn))));
  const mMax = $derived(chartReach(muTop, phiMTop, leastPositive(line.envelope.flatMap((e) => [e.phiPos, e.phiNeg]))));
  const vMax = $derived(chartReach(vuTop, phiVTop, leastPositive(line.shear.filter((e) => e.checked !== false).map((e) => e.phiVn))));
  const yM = $derived(top + ENV_M / 2);
  const yV = $derived(top + ENV_M + ENV_GAP + ENV_V / 2);
  const mY = (m: number) => yM + (m / mMax) * (ENV_M / 2 - 4);
  const vY = (v: number) => yV - (v / vMax) * (ENV_V / 2 - 4);
  const ex = $derived(line.envelope.map((e) => X(e.x)));
  const sx = $derived(line.shear.map((e) => X(e.x)));
  const muPos = $derived(filled(ex, line.envelope.map((e) => mY(e.pos)), yM));
  const muNeg = $derived(filled(ex, line.envelope.map((e) => mY(-e.neg)), yM));
  const phiPos = $derived(capacityPath(line.envelope.map((e) => ({ x: e.x, v: finite(e.phiPos) })), mMax, X, mY));
  const phiNeg = $derived(capacityPath(line.envelope.map((e) => ({ x: e.x, v: -finite(e.phiNeg) })), mMax, X, mY));
  const vuPos = $derived(filled(sx, line.shear.map((e) => vY(e.vPos)), yV));
  const vuNeg = $derived(filled(sx, line.shear.map((e) => vY(-e.vNeg)), yV));
  const phiVPos = $derived(capacityPath(line.shear.map((e) => ({ x: e.x, v: finite(e.phiVn) })), vMax, X, vY));
  const phiVNeg = $derived(capacityPath(line.shear.map((e) => ({ x: e.x, v: -finite(e.phiVn) })), vMax, X, vY));

  const yS = $derived(top + LEGEND + ENV_S);
  const legend = $derived.by(() => {
    let x = left;
    return (['provided', 'required', 'strength'] as const).map((k) => { const text = t(`rcSheets.line.steel.${k}`), at = x; x += 30 + text.length * 5.7 + 18; return { k, text, x: at }; });
  });
  const steel = $derived(kind === 'steel' ? steelChart(line, X, yS, ENV_S) : null);
</script>

{#if kind === 'moment'}
  <g data-testid="rc-line-envelope">
    <line x1={X(0)} y1={yM} x2={X(line.length)} y2={yM} class="envaxis" />
    <path d={muPos} class="mu pos" />
    <path d={muNeg} class="mu neg" />
    <path d={phiPos.inside} class="phim" data-testid="rc-env-phimn-pos" />
    <path d={phiNeg.inside} class="phim" />
    <path d={phiPos.outside} class="phim off" />
    <path d={phiNeg.outside} class="phim off" />
    <text x={left - 6} y={yM - ENV_M / 2 + 10} class="small end">Mu⁻</text>
    <text x={left - 6} y={yM + ENV_M / 2 - 2} class="small end">Mu⁺</text>
    <text x={right + 4} y={yM - ENV_M / 2 + 10} class="small start">φMn</text>
    <line x1={X(0)} y1={yV} x2={X(line.length)} y2={yV} class="envaxis" />
    <path d={vuPos} class="vu" />
    <path d={vuNeg} class="vu" />
    <path d={phiVPos.inside + ' ' + phiVNeg.inside} class="phiv" data-testid="rc-env-phivn" />
    <path d={phiVPos.outside + ' ' + phiVNeg.outside} class="phiv off" />
    <text x={left - 6} y={yV - ENV_V / 2 + 10} class="small end">Vu</text>
    <text x={right + 4} y={yV - ENV_V / 2 + 10} class="small start">±φVn</text>
    <text x={right + 4} y={yM + 4} class="small start" data-testid="rc-env-mu-scale">{fmt(muTop, 0)} kN·m</text>
    <text x={right + 4} y={yV - 2} class="small start" data-testid="rc-env-vu-scale">{fmt(vuTop, 0)} kN</text>
    {#if phiMTop > mMax}<text x={right + 4} y={yM + ENV_M / 2 - 2} class="small start" data-testid="rc-env-phimn-off">↧ {fmt(phiMTop, 0)} kN·m</text>{/if}
    {#if phiVTop > vMax}<text x={right + 4} y={yV - ENV_V / 2 + 22} class="small start" data-testid="rc-env-phivn-off">↥ {fmt(phiVTop, 0)} kN</text>{/if}
  </g>
{:else if steel}
  <g data-testid="rc-line-steel">
    {#each steel.short as s, i (i)}
      <rect x={s.x0 - 1} y={s.face === 'top' ? yS - ENV_S : yS} width={Math.max(2, s.x1 - s.x0 + 2)} height={ENV_S} class="short" data-testid="rc-steel-short" />
    {/each}
    <line x1={X(0)} y1={yS} x2={X(line.length)} y2={yS} class="envaxis" />
    <path d={steel.strength.top} class="req strength" />
    <path d={steel.strength.bottom} class="req strength" />
    <path d={steel.withMin.top} class="req" data-testid="rc-steel-required" />
    <path d={steel.withMin.bottom} class="req" />
    <path d={steel.provided.top} class="prov" data-testid="rc-steel-provided" />
    <path d={steel.provided.bottom} class="prov" />
    <text x={left - 6} y={yS - ENV_S + 10} class="small end">As↑</text>
    <text x={left - 6} y={yS + ENV_S - 2} class="small end">As↓</text>
    {#each legend as g (g.k)}
      <line x1={g.x} y1={top + 7} x2={g.x + 22} y2={top + 7} class={g.k === 'provided' ? 'prov' : g.k === 'required' ? 'req' : 'req strength'} />
      <text x={g.x + 27} y={top + 10.5} class="small start">{g.text}</text>
    {/each}
    <text x={right + 4} y={yS + 4} class="small start" data-testid="rc-steel-scale">{fmt(steel.scale, 1)} cm²</text>
    {#if steel.short.length}<text x={legend[2]!.x + 160} y={top + 10.5} class="small start req-t" data-testid="rc-steel-short-note">{t('rcSheets.line.steel.short')}</text>{/if}
  </g>
{/if}

<style>
  .small { font-size: 9.5px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .small.start { text-anchor: start; }
  .small.end { text-anchor: end; }
  .envaxis { stroke: var(--st-text-3); stroke-width: 0.7; }
  .mu { stroke: none; }
  .mu.pos { fill: rgba(78, 205, 196, 0.22); }
  .mu.neg { fill: rgba(232, 93, 74, 0.22); }
  .phim, .phiv { fill: none; stroke: var(--st-text); stroke-width: 1.3; stroke-dasharray: 5 3; }
  .vu { fill: rgba(224, 160, 60, 0.25); stroke: none; }
  .phim.off, .phiv.off { opacity: 0.35; stroke-dasharray: 1 4; }
  .prov { fill: none; stroke: var(--st-ok); stroke-width: 1.6; }
  .req { fill: none; stroke: var(--st-danger); stroke-width: 1.4; }
  .req.strength { stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.8; }
  .req-t { fill: var(--st-danger); }
  .short { fill: color-mix(in srgb, var(--st-danger) 22%, transparent); stroke: none; }
</style>
