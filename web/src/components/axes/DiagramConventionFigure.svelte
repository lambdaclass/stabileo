<script lang="ts">
  import { t } from '../../lib/i18n';

  let { towardLocal, leftLocal }: { towardLocal: boolean; leftLocal: boolean } = $props();

  const X0 = 40, X1 = 260, XM = 150;
  const BEAM_Y = 52, V_Y = 112, M_Y = 176;
  const V_H = 16, M_H = 30;

  const down = $derived(towardLocal ? -1 : 1);
  const vLeft = $derived(V_Y + down * V_H);
  const vRight = $derived(V_Y - down * V_H);
  const mPeak = $derived(M_Y + down * M_H);
  const signY = (base: number, off: number) => base + off * 0.55 + 4;
</script>

<svg class="dc-fig" viewBox="0 0 300 222" role="img" aria-label={t('axes.diagAria')}>
  <defs>
    <marker id="dc-head" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker>
    <marker id="dc-x" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ff4444" /></marker>
    <marker id="dc-z" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#4488ff" /></marker>
  </defs>

  {#each [X0, XM, X1] as x}
    <line class="guide" x1={x} y1={BEAM_Y} x2={x} y2={M_Y + M_H + 6} />
  {/each}

  <line class="beam" x1={X0} y1={BEAM_Y} x2={X1} y2={BEAM_Y} />
  <path class="support" d="M{X0},{BEAM_Y} l-8,13 h16 z" />
  <path class="support" d="M{X1},{BEAM_Y} l-8,11 h16 z" />
  <circle class="support" cx={X1 - 4} cy={BEAM_Y + 15} r="2.5" /><circle class="support" cx={X1 + 4} cy={BEAM_Y + 15} r="2.5" />
  <line class="load" x1={XM} y1={BEAM_Y - 34} x2={XM} y2={BEAM_Y - 3} marker-end="url(#dc-head)" />
  <text class="lbl" x={XM + 6} y={BEAM_Y - 24}>P</text>

  <g transform="translate(250 12)">
    <line x1="0" y1="18" x2="20" y2="18" stroke="#ff4444" stroke-width="1.8" marker-end="url(#dc-x)" />
    <text class="ax" x="23" y="22" fill="#ff4444">x</text>
    <line x1="0" y1="18" x2="0" y2="0" stroke="#4488ff" stroke-width="1.8" marker-end="url(#dc-z)" />
    <text class="ax" x="-4" y="-2" fill="#4488ff">z</text>
    <circle cx="0" cy="18" r="4.5" class="ycirc" />
    {#if leftLocal}<circle cx="0" cy="18" r="1.6" fill="#44cc44" />{:else}<path d="M-3,15 L3,21 M3,15 L-3,21" stroke="#44cc44" stroke-width="1.3" />{/if}
    <text class="ax" x="-14" y="30" fill="#44cc44">y</text>
  </g>

  <line class="base" x1={X0} y1={V_Y} x2={X1} y2={V_Y} />
  <path class="fill shear" d="M{X0},{V_Y} V{vLeft} H{XM} V{V_Y} z" />
  <path class="fill shear" d="M{XM},{V_Y} V{vRight} H{X1} V{V_Y} z" />
  <text class="lbl strong" x="6" y={V_Y + 4}>Vz</text>
  <text class="sign" x={(X0 + XM) / 2} y={signY(V_Y, vLeft - V_Y)}>+</text>
  <text class="sign" x={(XM + X1) / 2} y={signY(V_Y, vRight - V_Y)}>−</text>
  <text class="val" x={X0 + 6} y={vLeft + (down > 0 ? 11 : -4)}>P/2</text>

  <line class="base" x1={X0} y1={M_Y} x2={X1} y2={M_Y} />
  <path class="fill moment" d="M{X0},{M_Y} L{XM},{mPeak} L{X1},{M_Y} z" />
  <text class="lbl strong" x="6" y={M_Y + 4}>My</text>
  <text class="sign" x={XM} y={signY(M_Y, (mPeak - M_Y) * 0.6)}>+</text>
  <text class="val" x={XM + 6} y={mPeak + (down > 0 ? 11 : -4)}>PL/4</text>
</svg>

<style>
  .dc-fig { width: 100%; height: auto; display: block; color: var(--st-text-2); }
  .guide { stroke: var(--st-border); stroke-dasharray: 3 3; stroke-width: 1; }
  .beam { stroke: var(--st-text); stroke-width: 3; stroke-linecap: round; }
  .support { fill: none; stroke: var(--st-text-2); stroke-width: 1.3; }
  .load { stroke: var(--st-accent, #e5482a); stroke-width: 2; color: var(--st-accent, #e5482a); }
  .base { stroke: var(--st-text-3); stroke-width: 1; }
  .fill { stroke-width: 1.4; }
  .shear { fill: color-mix(in srgb, #3c8dff 28%, transparent); stroke: #3c8dff; }
  .moment { fill: color-mix(in srgb, #e5482a 26%, transparent); stroke: #e5482a; }
  .lbl { font-size: 11px; fill: var(--st-text-2); }
  .lbl.strong { font-weight: 700; fill: var(--st-text); }
  .sign { font-size: 13px; font-weight: 700; fill: var(--st-text); text-anchor: middle; }
  .val { font-size: 10px; fill: var(--st-text-2); }
  .ax { font-size: 11px; font-weight: 700; }
  .ycirc { fill: none; stroke: #44cc44; stroke-width: 1.3; }
</style>
