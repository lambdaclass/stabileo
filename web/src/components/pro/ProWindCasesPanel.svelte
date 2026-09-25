<script lang="ts">
  /**
   * The wind block's second half: which cases of Fig. 2.4-8 to generate, both senses, the
   * enclosure from the openings (§1.10), and qz against height for the inputs as typed.
   *
   * The profile is the one the plan integrates level by level (`load-plan.ts`), evaluated here
   * at the model's levels so the numbers can be read before anything is applied.
   */
  import { t, tp } from '../../lib/i18n';
  import {
    classifyEnclosure, velocityPressure, velocityPressureExposureCoefficient,
    type Enclosure, type Exposure,
  } from '../../lib/codes/cirsoc102/wind';
  import type { WindCaseSet } from '../../lib/engine/loads/wind-cases';

  interface Props {
    caseSet: WindCaseSet;
    bothSenses: boolean;
    enclosure: Enclosure;
    speed: number;
    exposure: Exposure;
    altitude: number;
    kzt: number;
    /** Level elevations above the ground, m. */
    elevations: number[];
  }
  let {
    caseSet = $bindable(), bothSenses = $bindable(), enclosure = $bindable(),
    speed, exposure, altitude, kzt, elevations,
  }: Props = $props();

  // ── Enclosure from the openings ──
  let a0 = $state(0), ag = $state(0), a0i = $state(0), agi = $state(0);
  const classified = $derived(ag > 0 ? classifyEnclosure({ a0, ag, a0i, agi }) : null);

  // ── qz profile ──
  const project = $derived({
    basicSpeed: speed, exposure, siteAltitudeM: altitude, kzt, kztSurveyed: true,
    structureKind: 'building' as const, enclosure, meanRoofHeight: 1, L: 1, B: 1, roofSlopeDeg: 0, rigid: true,
  });
  const rows = $derived.by(() => {
    const zs = [...new Set([...elevations.filter((z) => z > 0).map((z) => Math.round(z * 100) / 100)])].sort((a, b) => a - b);
    return zs.map((z) => ({
      z, kz: velocityPressureExposureCoefficient(z, exposure), qz: velocityPressure(z, project) / 1000,
    }));
  });

  // Plot: qz on x, z on y, one series.
  const W = 260, H = 150, PAD = { l: 34, r: 10, t: 8, b: 24 };
  const zMax = $derived(Math.max(...rows.map((r) => r.z), 1));
  const qMax = $derived(Math.max(...rows.map((r) => r.qz), 0.01));
  const px = (q: number) => PAD.l + (q / qMax) * (W - PAD.l - PAD.r);
  const py = (z: number) => H - PAD.b - (z / zMax) * (H - PAD.t - PAD.b);
  const path = $derived(rows.map((r, i) => `${i ? 'L' : 'M'}${px(r.qz).toFixed(1)},${py(r.z).toFixed(1)}`).join(' '));
  let hover = $state<number | null>(null);
</script>

<div class="wc" data-testid="al-wind-cases">
  <div class="wc-row">
    <label for="al-wind-caseset">{t('autoLoad.windCaseSet')}</label>
    <select id="al-wind-caseset" class="al-select-sm" bind:value={caseSet} data-testid="al-wind-caseset">
      {#each ['all', 'cases13', 'case1'] as const as k (k)}
        <option value={k}>{t(`autoLoad.windCaseSet.${k}`)}</option>
      {/each}
    </select>
  </div>
  <label class="wc-check"><input type="checkbox" bind:checked={bothSenses} data-testid="al-wind-both-senses" /> {t('autoLoad.windBothSenses')}</label>

  <details class="wc-details" data-testid="al-wind-openings">
    <summary>{t('autoLoad.windOpenings')}</summary>
    <p class="wc-hint">{t('autoLoad.windOpeningsHint')}</p>
    <div class="wc-grid">
      <label>A₀ (m²)<input type="number" min="0" step="0.5" bind:value={a0} data-testid="al-wind-a0" /></label>
      <label>A_g (m²)<input type="number" min="0" step="1" bind:value={ag} data-testid="al-wind-ag" /></label>
      <label>A₀i (m²)<input type="number" min="0" step="0.5" bind:value={a0i} data-testid="al-wind-a0i" /></label>
      <label>A_gi (m²)<input type="number" min="0" step="1" bind:value={agi} data-testid="al-wind-agi" /></label>
    </div>
    {#if classified}
      <div class="wc-row">
        <span data-testid="al-wind-classified">{tp('autoLoad.windOpeningsResult', { e: t(`loads.cirsoc102.enclosure.${classified}`) })}</span>
        <button class="al-link" disabled={classified === enclosure} onclick={() => { enclosure = classified!; }} data-testid="al-wind-use-classified">{t('autoLoad.windOpeningsUse')}</button>
      </div>
    {/if}
  </details>

  {#if rows.length > 0}
    <details class="wc-details" data-testid="al-wind-profile">
      <summary>{t('autoLoad.windProfile')}</summary>
      <svg viewBox="0 0 {W} {H}" class="wc-plot" role="img" aria-label={t('autoLoad.windProfile')}>
        <line class="wc-axis" x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} />
        <line class="wc-axis" x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} />
        <text class="wc-tick" x={PAD.l} y={H - 8}>0</text>
        <text class="wc-tick" x={W - PAD.r} y={H - 8} text-anchor="end">{qMax.toFixed(2)} kN/m²</text>
        <text class="wc-tick" x={PAD.l - 4} y={py(zMax) + 3} text-anchor="end">{zMax.toFixed(1)} m</text>
        <path class="wc-line" d={path} />
        {#each rows as r, i (r.z)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle class="wc-hit" cx={px(r.qz)} cy={py(r.z)} r="9"
            onmouseenter={() => (hover = i)} onmouseleave={() => (hover = null)} />
          <circle class="wc-dot" class:on={hover === i} cx={px(r.qz)} cy={py(r.z)} r="4" />
        {/each}
        {#if hover !== null}
          {@const r = rows[hover]}
          <text class="wc-tip" x={Math.min(px(r.qz) + 8, W - 90)} y={py(r.z) - 6}>z {r.z} m · {r.qz.toFixed(3)} kN/m²</text>
        {/if}
      </svg>
      <table class="wc-table">
        <thead><tr><th>z (m)</th><th>K_z</th><th>q_z (kN/m²)</th></tr></thead>
        <tbody>
          {#each rows as r (r.z)}
            <tr><td>{r.z.toFixed(2)}</td><td>{r.kz.toFixed(3)}</td><td>{r.qz.toFixed(3)}</td></tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</div>

<style>
  .wc { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; font-size: 0.68rem; color: var(--st-text-2); }
  .wc-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .wc-check { display: flex; gap: 6px; align-items: center; }
  .wc-details summary { cursor: pointer; }
  .wc-hint { margin: 4px 0; font-size: 0.62rem; color: var(--st-text-3); }
  .wc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; }
  .wc-grid label { display: flex; flex-direction: column; gap: 2px; }
  .wc-grid input { width: 100%; }
  .wc-plot { width: 100%; max-width: 320px; display: block; margin: 6px 0; }
  .wc-axis { stroke: var(--st-hair); stroke-width: 1; }
  .wc-tick, .wc-tip { font-size: 8px; fill: var(--st-text-3); }
  .wc-tip { fill: var(--st-text); }
  .wc-line { fill: none; stroke: var(--st-accent); stroke-width: 2; }
  .wc-dot { fill: var(--st-accent); stroke: var(--st-surface); stroke-width: 2; }
  .wc-dot.on { r: 5; }
  .wc-hit { fill: transparent; }
  .wc-table { border-collapse: collapse; font-size: 0.62rem; }
  .wc-table th, .wc-table td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); text-align: right; }
</style>
