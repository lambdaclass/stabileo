<script lang="ts">
  /**
   * The wind's dynamics (CIRSOC 102-2025 §1.9): where each direction's fundamental frequency comes
   * from, the damping, a rigid structure's G, and what came out per direction once previewed.
   *
   * The reading follows the code's own sequence: n₁, then rigid (n₁ ≥ 1 Hz) or flexible (art. 1.2),
   * then G or G_f with its clause. The steps open in the order of the commentary's worked example.
   */
  import { t, tp } from '../../lib/i18n';
  import QuantityInput from './loads/QuantityInput.svelte';
  import type { WindDynamics } from '../../lib/engine/loads/wind-dynamics';
  import type { GustResult } from '../../lib/codes/cirsoc102/gust';
  import { betaText, readBeta, readN1 } from './wind-dynamics-fields';

  interface Props {
    dynamics: WindDynamics;
    /** The plan's gust per axis, after a preview. */
    gust?: Partial<Record<'x' | 'y', GustResult>>;
    /** The modal frequencies found for the preview, with the mode and its mass. */
    modal?: { x?: { n1: number; mode: number; mass: number }; y?: { n1: number; mode: number; mass: number } } | null;
    lowRise: boolean;
    /** A building or a free roof: the approximate frequency of §1.9.3 is for buildings alone (§1.9.2.1). */
    building?: boolean;
  }
  let { dynamics = $bindable(), gust, modal = null, lowRise, building = true }: Props = $props();

  /*
   * β shows the value the plan uses. It was a text held from the mount: the dialog sets the
   * dynamics it restores after this block is built, so the field could read 5 % while the plan
   * used 2 %. Only what is being typed is held, and a β that does not read stays on screen,
   * marked, over the one still in use (`readBeta`).
   */
  let betaDraft = $state<string | null>(null);
  const betaShown = $derived(betaDraft ?? betaText(dynamics.beta));
  const betaInvalid = $derived(betaDraft !== null && readBeta(betaDraft) === null);
  function setBeta(s: string) {
    const v = readBeta(s);
    if (v === null) return;
    dynamics = { ...dynamics, beta: v };
    betaDraft = null;
  }
  const n1Of = (axis: 'x' | 'y') => dynamics.n1?.[axis] ?? '';
  // A value that does not read keeps the one there was, and the field shows it again.
  function setN1(axis: 'x' | 'y', el: HTMLInputElement) {
    const v = readN1(el.value, dynamics.n1?.[axis]);
    dynamics = { ...dynamics, n1: { ...(dynamics.n1 ?? {}), [axis]: v } };
    el.value = String(v ?? '');
  }
  /** SI; an empty field is no eccentricity. */
  function setER(axis: 'x' | 'y', v: number | null) {
    dynamics = { ...dynamics, eR: { ...(dynamics.eR ?? {}), [axis]: v ?? 0 } };
  }
  const anyFlexible = $derived(Object.values(gust ?? {}).some((g) => g?.kind === 'flexible'));
  const r3 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(3));
</script>

<div class="wd" data-testid="wind-dynamics">
  <div class="wd-title">{t('autoLoad.windDyn.title')}</div>
  {#if lowRise}
    <p class="wd-hint" data-testid="wind-low-rise">{t('autoLoad.windDyn.lowRise')}</p>
  {:else}
    <fieldset class="wd-src">
      <legend>{t('autoLoad.windDyn.n1')}</legend>
      {#each ['modal', 'typed', ...(building ? ['approximate'] : []), 'declaredRigid'] as s (s)}
        <label class="wd-opt"><input type="radio" name="wd-src" value={s} checked={dynamics.n1Source === s}
          onchange={() => (dynamics = { ...dynamics, n1Source: s as WindDynamics['n1Source'] })} data-testid="wind-n1-{s}" /> {t(`autoLoad.windDyn.src.${s}`)}</label>
      {/each}
    </fieldset>
    {#if dynamics.n1Source === 'typed'}
      <div class="wd-row">
        {#each ['x', 'y'] as a (a)}
          <label>n₁ {a.toUpperCase()} <input type="text" class="wd-num" value={n1Of(a as 'x')} onchange={(e) => setN1(a as 'x', e.currentTarget)} data-testid="wind-n1-{a}" /> Hz</label>
        {/each}
      </div>
    {:else if dynamics.n1Source === 'approximate'}
      <label class="wd-row">{t('autoLoad.windDyn.system')}
        <select value={dynamics.system ?? 'otherSteelOrConcrete'} onchange={(e) => (dynamics = { ...dynamics, system: e.currentTarget.value as WindDynamics['system'] })} data-testid="wind-system">
          {#each ['steelMomentFrame', 'concreteMomentFrame', 'otherSteelOrConcrete'] as s (s)}<option value={s}>{t(`autoLoad.windDyn.system.${s}`)}</option>{/each}
        </select>
      </label>
    {/if}
    {#if dynamics.n1Source !== 'declaredRigid'}
      <label class="wd-row">{t('autoLoad.windDyn.beta')}
        <input type="text" class="wd-num" class:wd-invalid={betaInvalid} aria-invalid={betaInvalid} value={betaShown}
          oninput={(e) => (betaDraft = e.currentTarget.value)} onchange={(e) => setBeta(e.currentTarget.value)} data-testid="wind-beta" /> %</label>
      <p class="wd-hint">{t('autoLoad.windDyn.betaHint')}</p>
    {/if}
  {/if}
  <label class="wd-row">{t('autoLoad.windDyn.rigidG')}
    <select value={dynamics.rigidG} onchange={(e) => (dynamics = { ...dynamics, rigidG: e.currentTarget.value as WindDynamics['rigidG'] })} data-testid="wind-rigid-g">
      <option value="default">{t('autoLoad.windDyn.rigidG.default')}</option>
      <option value="calculated">{t('autoLoad.windDyn.rigidG.calculated')}</option>
    </select>
  </label>
  {#if anyFlexible}
    <div class="wd-row">
      <span>{t('autoLoad.windDyn.eR')}</span>
      {#each ['x', 'y'] as a (a)}<label>{a.toUpperCase()} <QuantityInput value={dynamics.eR?.[a as 'x'] ?? 0} nullable quantity="length" cls="wd-num" onchange={(v) => setER(a as 'x', v)} testid="wind-er-{a}" /></label>{/each}
    </div>
  {/if}

  {#if gust && (gust.x || gust.y)}
    <ul class="wd-read" data-testid="wind-gust-read">
      {#each ['x', 'y'] as a (a)}
        {@const g = gust[a as 'x']}
        {#if g}
          {@const m = modal?.[a as 'x']}
          <li data-testid="wind-gust-{a}">
            {tp(`autoLoad.windDyn.read.${g.kind}`, {
              dir: a.toUpperCase(), n1: g.n1 !== undefined ? g.n1.toFixed(3) : '—', g: g.value.value.toFixed(3),
              mode: m ? tp('autoLoad.windDyn.read.mode', { mode: m.mode, mass: Math.round(m.mass * 100) }) : '',
            })}
            <details>
              <summary>{t('autoLoad.windDyn.steps')}</summary>
              <table class="wd-steps">
                <tbody>
                  <tr><td>z̄</td><td>{r3(g.steps.zBar)} m</td></tr>
                  <tr><td>I<sub>z̄</sub> (1.9-7)</td><td>{r3(g.steps.iz)}</td></tr>
                  <tr><td>L<sub>z̄</sub> (1.9-9)</td><td>{r3(g.steps.lz)} m</td></tr>
                  <tr><td>Q (1.9-8)</td><td>{r3(g.steps.q)}</td></tr>
                  <tr><td>G (1.9-6)</td><td>{r3(g.steps.gCalculated)}</td></tr>
                  {#if g.steps.resonant}
                    {@const x = g.steps.resonant}
                    <tr><td>V̄<sub>z̄</sub> (1.9-16)</td><td>{r3(x.vBar)} m/s</td></tr>
                    <tr><td>N₁ (1.9-14)</td><td>{r3(x.n1Reduced)}</td></tr>
                    <tr><td>R<sub>n</sub> (1.9-13)</td><td>{r3(x.rn)}</td></tr>
                    <tr><td>η<sub>h</sub>, η<sub>B</sub>, η<sub>L</sub></td><td>{r3(x.etaH)}, {r3(x.etaB)}, {r3(x.etaL)}</td></tr>
                    <tr><td>R<sub>h</sub>, R<sub>B</sub>, R<sub>L</sub> (1.9-15)</td><td>{r3(x.rh)}, {r3(x.rb)}, {r3(x.rl)}</td></tr>
                    <tr><td>R (1.9-12)</td><td>{r3(x.r)}</td></tr>
                    <tr><td>g<sub>R</sub> (1.9-11)</td><td>{r3(x.gR)}</td></tr>
                    <tr><td>G<sub>f</sub> (1.9-10)</td><td>{r3(g.value.value)}</td></tr>
                  {/if}
                </tbody>
              </table>
            </details>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
  <p class="wd-hint" data-testid="wind-along-only">{t('autoLoad.windDyn.alongOnly')}</p>
</div>

<style>
  .wd { display: flex; flex-direction: column; gap: 5px; padding: 6px 0; border-top: 1px solid var(--st-hair); }
  .wd-title { font-size: 0.7rem; font-weight: 600; color: var(--st-text); }
  .wd-src { border: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.7rem; color: var(--st-text-2); }
  .wd-src legend { font-size: 0.66rem; color: var(--st-text-3); padding: 0; margin-bottom: 2px; }
  .wd-opt { display: inline-flex; align-items: center; gap: 4px; }
  .wd-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 0.7rem; color: var(--st-text-2); }
  .wd-row label { display: inline-flex; align-items: center; gap: 4px; }
  .wd :global(.wd-num) { width: 58px; font-family: var(--st-mono); }
  .wd-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); line-height: 1.35; }
  .wd-read { margin: 2px 0; padding-left: 16px; font-size: 0.68rem; color: var(--st-text); }
  .wd-read li { margin-bottom: 3px; }
  .wd-steps { font-size: 0.64rem; font-family: var(--st-mono); color: var(--st-text-2); }
  .wd-steps td { padding: 0 10px 0 0; }
</style>
