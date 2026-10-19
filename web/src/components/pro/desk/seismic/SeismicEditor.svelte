<script lang="ts">
  /**
   * The seismic design of the concrete frame: the members' roles in plan, the inertia factors by
   * category written onto the members, capacity design's overstrength and strong-column ratio, the
   * storeys' stiffness with the soft ones and the amplification of their forces, and the checks of
   * the last pass (capacity shear, hoops and confinement, strong column and joints), with the hoops
   * and ties they ask for written in one step.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import {
    applyInertiaFactors, applySeismicDetailing, isSeismicProject, modelStoreyStiffness, patchSeismic,
    runSeismicChecks, seismicSettings, seismicState,
  } from '../../../../lib/store/seismic-design.svelte';
  import { SEISMIC_CATEGORIES, type SoftKind } from '../../../../lib/model/seismic-design';
  import SeismicRolesPlan from './SeismicRolesPlan.svelte';

  const s = $derived.by(() => { void modelStore.designData; return seismicSettings(); });
  const seismic = $derived.by(() => { void modelStore.model.loadCases; return isSeismicProject(); });
  const storeys = $derived.by(() => { void modelStore.model.loads; return modelStoreyStiffness(); });
  const rep = $derived(seismicState.report);
  const failing = $derived(rep ? rep.members.filter((m) => !m.ok) : []);
  const badJoints = $derived(rep ? rep.joints.filter((j) => !j.ok) : []);
  let note = $state<string | null>(null);
  const KINDS: SoftKind[] = ['column', 'beam', 'wall'];
  const fmt = (u: number) => (Number.isFinite(u) ? u.toFixed(2) : '∞');
  function toggleSoft(level: number, on: boolean) {
    const lv = s.softStoreys.levels.filter((l) => Math.abs(l - level) > 1e-3);
    patchSeismic({ softStoreys: { ...s.softStoreys, levels: on ? [...lv, level] : lv } });
  }
  function setSoft(which: 'shear' | 'moment', k: SoftKind, v: number) {
    if (!(v > 0)) return;
    patchSeismic({ softStoreys: { ...s.softStoreys, [which]: { ...s.softStoreys[which], [k]: v } } });
  }
</script>

<div class="se" data-testid="seismic-editor">
  {#if !seismic}<p class="se-warn" data-testid="seismic-none">{t('seisDes.none')}</p>{/if}

  <section class="se-card">
    <h5>{t('seisDes.roles')}</h5>
    <p class="se-hint">{t('lateral.rolesHint')}</p>
    <SeismicRolesPlan />
  </section>

  <section class="se-card">
    <h5>{t('seisDes.inertia')}</h5>
    <table class="se-t" data-testid="seismic-inertia">
      <tbody>{#each SEISMIC_CATEGORIES as c (c)}<tr><td>{t(`seisDes.cat.${c}`)}</td><td><input type="number" min="0.01" max="1" step="0.05" value={s.inertia[c]} aria-label={t(`seisDes.cat.${c}`)}
        onchange={(e) => { const v = +e.currentTarget.value; if (v > 0 && v <= 1) patchSeismic({ inertia: { ...s.inertia, [c]: v } }); }} /></td></tr>{/each}</tbody>
    </table>
    <div class="se-row"><button onclick={() => { note = tp('seisDes.inertiaApplied', { n: applyInertiaFactors() }); }} data-testid="seismic-apply-inertia">{t('seisDes.applyInertia')}</button>
      <span class="se-hint">{t('seisDes.inertiaHint')}</span></div>
  </section>

  <section class="se-card">
    <h5>{t('seisDes.capacity')}</h5>
    <div class="se-row">
      <label>{t('seisDes.overstrength')} <input type="number" min="1" max="2" step="0.05" value={s.overstrength} onchange={(e) => patchSeismic({ overstrength: +e.currentTarget.value })} data-testid="seismic-overstrength" /></label>
      <label>{t('seisDes.strongColumn')} <input type="number" min="1" max="2" step="0.05" value={s.strongColumn} onchange={(e) => patchSeismic({ strongColumn: +e.currentTarget.value })} /></label>
      <label><input type="checkbox" checked={s.slabFlange} onchange={(e) => patchSeismic({ slabFlange: e.currentTarget.checked })} /> {t('seisDes.slabFlange')}</label>
    </div>
  </section>

  <section class="se-card">
    <h5>{t('seisDes.softStoreys')}</h5>
    {#if storeys.length === 0}<p class="se-hint">{t('seisDes.noStoreys')}</p>{:else}
      <table class="se-t" data-testid="seismic-storeys">
        <thead><tr><th>{t('seisDes.storey')}</th><th>kX</th><th>kY</th><th>{t('seisDes.ratio')}</th><th>{t('seisDes.amplify')}</th></tr></thead>
        <tbody>{#each storeys as st (st.level)}
          <tr class:soft={st.soft}><td>{st.levelName ?? `${st.level.toFixed(2)} m`}{#if st.soft} <span class="se-flag">{t('seisDes.soft')}</span>{/if}</td>
            <td class="num">{st.kX ? st.kX.toFixed(0) : '—'}</td><td class="num">{st.kY ? st.kY.toFixed(0) : '—'}</td><td class="num">{st.ratio !== null ? st.ratio.toFixed(2) : '—'}</td>
            <td><input type="checkbox" checked={s.softStoreys.levels.some((l) => Math.abs(l - st.level) < 1e-3)} onchange={(e) => toggleSoft(st.level, e.currentTarget.checked)} aria-label={t('seisDes.amplify')} /></td></tr>
        {/each}</tbody>
      </table>
    {/if}
    <table class="se-t se-factors">
      <thead><tr><th></th>{#each KINDS as k}<th>{t(`seisDes.kind.${k}`)}</th>{/each}</tr></thead>
      <tbody>{#each (['shear', 'moment'] as const) as w}<tr><td>{t(`seisDes.factor.${w}`)}</td>{#each KINDS as k}<td><input type="number" min="1" max="5" step="0.1" value={s.softStoreys[w][k]} onchange={(e) => setSoft(w, k, +e.currentTarget.value)} aria-label={`${t(`seisDes.factor.${w}`)} ${t(`seisDes.kind.${k}`)}`} /></td>{/each}</tr>{/each}</tbody>
    </table>
    <p class="se-hint">{t('seisDes.softHint')}</p>
  </section>

  <section class="se-card">
    <h5>{t('seisDes.checks')}</h5>
    <div class="se-row">
      <button onclick={() => runSeismicChecks()} data-testid="seismic-run">{t('seisDes.run')}</button>
      <button disabled={!rep || failing.length === 0} onclick={() => { const r = applySeismicDetailing(); note = tp('seisDes.detailed', { beams: r.beams, columns: r.columns }); }} data-testid="seismic-apply">{t('seisDes.apply')}</button>
    </div>
    {#if note}<p class="se-hint" role="status" data-testid="seismic-note">{note}</p>{/if}
    {#if rep}
      <p class="se-hint" data-testid="seismic-substitute">{t('seisDes.substitute')}</p>
      <p class="se-sum" data-testid="seismic-summary">{tp('seisDes.summary', { members: rep.members.filter((m) => m.role === 'primary').length, failing: failing.length, joints: rep.joints.length, badJoints: badJoints.length })}</p>
      {#if failing.length}<table class="se-t" data-testid="seismic-failing"><thead><tr><th></th><th>Ve / φVn</th><th>{t('seisDes.what')}</th></tr></thead><tbody>
        {#each failing as m (m.id)}<tr><td>{t(`seisDes.kind.${m.kind}`)} {m.id}</td><td class="num">{m.shear ? `${m.shear.ve.toFixed(0)} / ${m.shear.phiVn.toFixed(0)}` : '—'}</td><td>{m.issues.map((k) => t(k)).join(' · ')}</td></tr>{/each}
      </tbody></table>{/if}
      {#if badJoints.length}<table class="se-t" data-testid="seismic-joints"><thead><tr><th>{t('seisDes.joint')}</th><th>ΣMc / 1,2ΣMb</th><th>Vj / φVn</th></tr></thead><tbody>
        {#each badJoints as j (`${j.nodeId}-${j.direction}`)}<tr><td>N{j.nodeId} {j.direction}</td><td class="num" class:bad={!j.strongColumn.ok}>{j.strongColumn.roof ? t('seisDes.roof') : `${j.strongColumn.sumColumns.toFixed(0)} / ${j.strongColumn.required.toFixed(0)}`}</td><td class="num" class:bad={j.shear.utilization > 1}>{j.shear.vj.toFixed(0)} / {j.shear.phiVn.toFixed(0)} ({fmt(j.shear.utilization)})</td></tr>{/each}
      </tbody></table><p class="se-hint">{t('seisDes.jointsHint')}</p>{/if}
    {/if}
  </section>
</div>

<style>
  .se { display: flex; flex-direction: column; gap: 8px; font-size: 0.74rem; padding: 2px; }
  .se-card { background: var(--st-surface-2); border: 1px solid var(--st-surface-3); border-radius: 4px; padding: 6px 8px; }
  h5 { margin: 0 0 4px; font-size: 0.74rem; color: var(--st-info); }
  .se-hint { color: var(--st-text-2); font-size: 0.68rem; margin: 2px 0; }
  .se-warn { color: var(--st-warn); margin: 0; }
  .se-sum { margin: 4px 0; }
  .se-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
  .se-t { border-collapse: collapse; font-variant-numeric: tabular-nums; margin-top: 4px; }
  .se-t td, .se-t th { padding: 1px 6px; border-bottom: 1px solid var(--st-surface-3); text-align: left; font-weight: 400; }
  .se-t .num { text-align: right; }
  .se-t .bad, tr.soft td:first-child { color: var(--st-danger); }
  .se-flag { font-size: 0.62rem; border: 1px solid var(--st-danger); border-radius: 3px; padding: 0 3px; }
  .se-t input { width: 4rem; }
  input, button { font: inherit; font-size: 0.7rem; padding: 1px 4px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text); }
  input[type='checkbox'] { width: auto; }
  button { background: var(--st-surface-3); cursor: pointer; padding: 1px 8px; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
</style>
