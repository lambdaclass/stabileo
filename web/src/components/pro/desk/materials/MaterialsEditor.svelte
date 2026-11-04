<!--
  The members of the other materials: the timber of the project (its materials' reference values
  and the service condition), the steel members made composite (filled or encased columns, beams
  under a slab), and every timber, aluminium, cold-formed and composite member with its result.
  Aluminium is read from its catalogued EN AW grade, cold-formed from its section; neither needs
  more than the model already has.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { designData, patchDesignData } from '../../../../lib/store/design-data';
  import { materialCheckState, runMaterialChecks, OTHER_FAMILIES } from '../../../../lib/store/material-check.svelte';
  import { deskUi } from '../../../../lib/store/design-desk-ui.svelte';
  import { materialFamilyOf } from '../../../../lib/engine/steel/material-family';
  import { catalogueGradeFamily } from '../../../../lib/engine/steel/grade-family';
  import type { TimberReference } from '../../../../lib/engine/design/materials/timber';
  import type { CompositeSpec } from '../../../../lib/engine/design/materials/composite';

  const settings = $derived(designData().timber ?? { wet: false });
  const materials = $derived([...modelStore.materials.values()]);
  const results = $derived([...materialCheckState.results.values()].sort((a, b) => a.elementId - b.elementId));
  const steelMembers = $derived([...modelStore.elements.values()].filter((e) => {
    const m = modelStore.materials.get(e.materialId);
    return m && materialFamilyOf(m as never, catalogueGradeFamily).family === 'steel';
  }));
  let note = $state('');

  // ── Timber reference values
  const FIELDS = ['fb', 'ft', 'fc', 'fv', 'e', 'emin'] as const;
  let editing = $state<number | null>(null);
  let draft = $state<Record<string, string>>({});
  let kind = $state<'sawn' | 'glulam'>('sawn');

  function openTimber(id: number) {
    const tr = (modelStore.materials.get(id) as { timber?: TimberReference } | undefined)?.timber;
    editing = id; kind = tr?.kind ?? 'sawn';
    draft = Object.fromEntries(FIELDS.map((f) => [f, tr?.[f] !== undefined ? String(tr[f]) : '']));
  }
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const complete = $derived(['fb', 'ft', 'fc', 'fv', 'e'].every((f) => num(draft[f] ?? '') !== undefined));
  function saveTimber() {
    if (editing === null || !complete) return;
    const ref: TimberReference = { fb: num(draft.fb!)!, ft: num(draft.ft!)!, fc: num(draft.fc!)!, fv: num(draft.fv!)!, e: num(draft.e!)!, kind, ...(num(draft.emin ?? '') ? { emin: num(draft.emin!)! } : {}) };
    modelStore.setMaterialDesign(editing, { timber: ref });
    editing = null;
  }
  function dropTimber(id: number) { modelStore.setMaterialDesign(id, { timber: undefined }); }

  // ── Composite members
  let member = $state<number | null>(null);
  let ckind = $state<'none' | CompositeSpec['kind']>('none');
  let cf = $state<Record<string, string>>({ fc: '25', b: '0.4', h: '0.4', as: '', fy: '420', bEff: '1.5', tc: '0.12', n: '', d: '19', fu: '450' });
  function pick(id: number) {
    member = id;
    const c = (modelStore.elements.get(id) as { composite?: CompositeSpec } | undefined)?.composite;
    ckind = c?.kind ?? 'none';
    if (c) cf = { ...cf, fc: String(c.fc), ...(c.kind === 'encased' ? { b: String(c.b), h: String(c.h), as: c.rebar ? String(c.rebar.as * 1e4) : '', fy: String(c.rebar?.fy ?? 420) } : {}), ...(c.kind === 'beam' ? { bEff: String(c.bEff), tc: String(c.tc), n: c.studs ? String(c.studs.count) : '', d: c.studs ? String(c.studs.d * 1000) : '19', fu: String(c.studs?.fu ?? 450) } : {}) };
  }
  function saveComposite() {
    if (member === null) return;
    const fc = num(cf.fc!) ?? 25;
    const spec: CompositeSpec | undefined = ckind === 'none' ? undefined
      : ckind === 'filled' ? { kind: 'filled', fc }
      : ckind === 'encased' ? { kind: 'encased', fc, b: num(cf.b!) ?? 0.4, h: num(cf.h!) ?? 0.4, ...(num(cf.as!) ? { rebar: { as: num(cf.as!)! / 1e4, fy: num(cf.fy!) ?? 420 } } : {}) }
      : { kind: 'beam', fc, bEff: num(cf.bEff!) ?? 1, tc: num(cf.tc!) ?? 0.1, ...(num(cf.n!) ? { studs: { count: Math.round(num(cf.n!)!), d: (num(cf.d!) ?? 19) / 1000, fu: num(cf.fu!) ?? 450 } } : {}) };
    modelStore.setElementDesign(member, { composite: spec });
    note = tp('mat.saved', { id: member });
  }

  function run() {
    const r = runMaterialChecks();
    note = 'checked' in r ? tp('mat.checked', { n: r.checked }) : t('mat.noResults');
  }
  const statusKey = (s: string) => (s === 'ok' ? 'mat.state.ok' : s === 'nearLimit' ? 'mat.state.near' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none');
</script>

<div class="me" data-testid="materials-editor">
  <p class="me-lead">{t('mat.lead')}</p>

  <details class="me-sec" open data-testid="mat-timber">
    <summary>{t('mat.timber.title')} <span class="muted">· {settings.wet ? t('mat.timber.wet') : t('mat.timber.dry')}</span></summary>
    <label class="me-row"><input type="checkbox" checked={settings.wet} onchange={(e) => patchDesignData({ timber: { ...settings, wet: e.currentTarget.checked } })} data-testid="mat-timber-wet" /> {t('mat.timber.wetLabel')}</label>
    <label class="me-row">{t('mat.timber.ct')} <input type="number" step="0.05" min="0.1" max="1" value={settings.ct ?? 1} onchange={(e) => patchDesignData({ timber: { ...settings, ct: Number(e.currentTarget.value) || 1 } })} /></label>
    <table class="me-t">
      <thead><tr><th>{t('mat.material')}</th><th>{t('mat.timber.values')}</th><th></th></tr></thead>
      <tbody>
        {#each materials as m (m.id)}
          {@const tr = (m as { timber?: TimberReference }).timber}
          <tr>
            <td>{m.name}</td>
            <td>{tr ? `Fb ${tr.fb} · Ft ${tr.ft} · Fc ${tr.fc} · Fv ${tr.fv} · E ${tr.e} MPa (${t(`mat.timber.${tr.kind}`)})` : '—'}</td>
            <td class="me-a">
              <button onclick={() => openTimber(m.id)} data-testid="mat-timber-edit-{m.id}">{tr ? t('mat.edit') : t('mat.timber.make')}</button>
              {#if tr}<button onclick={() => dropTimber(m.id)}>{t('mat.timber.drop')}</button>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if editing !== null}
      <div class="me-form" data-testid="mat-timber-form">
        <p class="muted">{t('mat.timber.hint')}</p>
        {#each FIELDS as f (f)}
          <label>{t(`mat.timber.f.${f}`)} <input inputmode="decimal" bind:value={draft[f]} data-testid="mat-timber-{f}" /></label>
        {/each}
        <label>{t('mat.timber.kind')} <select bind:value={kind}><option value="sawn">{t('mat.timber.sawn')}</option><option value="glulam">{t('mat.timber.glulam')}</option></select></label>
        <button disabled={!complete} onclick={saveTimber} data-testid="mat-timber-save">{t('mat.save')}</button>
        <button onclick={() => (editing = null)}>{t('mat.cancel')}</button>
      </div>
    {/if}
  </details>

  <details class="me-sec" data-testid="mat-composite">
    <summary>{t('mat.composite.title')} <span class="muted">· {tp('mat.composite.count', { n: steelMembers.filter((e) => (e as { composite?: unknown }).composite).length })}</span></summary>
    <p class="muted">{t('mat.composite.hint')}</p>
    <label class="me-row">{t('mat.member')}
      <select value={member ?? ''} onchange={(e) => pick(Number(e.currentTarget.value))} data-testid="mat-composite-member">
        <option value="" disabled>—</option>
        {#each steelMembers as e (e.id)}<option value={e.id}>{e.name || `${e.id}`} · {modelStore.sections.get(e.sectionId)?.name ?? ''}{(e as { composite?: unknown }).composite ? ' ◆' : ''}</option>{/each}
      </select>
    </label>
    {#if member !== null}
      <div class="me-form">
        <label>{t('mat.composite.kind')}
          <select bind:value={ckind} data-testid="mat-composite-kind">
            <option value="none">{t('mat.composite.none')}</option><option value="filled">{t('mat.composite.filled')}</option>
            <option value="encased">{t('mat.composite.encased')}</option><option value="beam">{t('mat.composite.beam')}</option>
          </select>
        </label>
        {#if ckind !== 'none'}<label>f'c (MPa) <input inputmode="decimal" bind:value={cf.fc} data-testid="mat-composite-fc" /></label>{/if}
        {#if ckind === 'encased'}
          <label>b (m) <input inputmode="decimal" bind:value={cf.b} /></label><label>h (m) <input inputmode="decimal" bind:value={cf.h} /></label>
          <label>{t('mat.composite.rebar')} <input inputmode="decimal" bind:value={cf.as} /></label><label>fy (MPa) <input inputmode="decimal" bind:value={cf.fy} /></label>
        {:else if ckind === 'beam'}
          <label>{t('mat.composite.bEff')} <input inputmode="decimal" bind:value={cf.bEff} data-testid="mat-composite-beff" /></label><label>{t('mat.composite.tc')} <input inputmode="decimal" bind:value={cf.tc} /></label>
          <label>{t('mat.composite.studs')} <input inputmode="numeric" bind:value={cf.n} /></label><label>Ø (mm) <input inputmode="decimal" bind:value={cf.d} /></label><label>Fu (MPa) <input inputmode="decimal" bind:value={cf.fu} /></label>
        {/if}
        <button onclick={saveComposite} data-testid="mat-composite-save">{t('mat.save')}</button>
      </div>
    {/if}
  </details>

  <section class="me-sec">
    <div class="me-head"><h5>{t('mat.results')}</h5><button onclick={run} data-testid="mat-run">{t('mat.run')}</button></div>
    {#if note}<p class="muted" data-testid="mat-note">{note}</p>{/if}
    {#if results.length === 0}
      <p class="muted">{t('mat.none')}</p>
    {:else}
      <table class="me-t" data-testid="mat-results">
        <thead><tr><th>{t('mat.member')}</th><th>{t('mat.family')}</th><th>{t('mat.code')}</th><th class="num">η</th><th>{t('mat.state')}</th></tr></thead>
        <tbody>
          {#each results as r (r.elementId)}
            <tr class:bad={r.status === 'fail'} onclick={() => (deskUi.selected = r.elementId)} data-testid="mat-row-{r.elementId}">
              <td>{modelStore.elements.get(r.elementId)?.name || r.elementId}</td><td>{t(`mat.fam.${r.family}`)}</td><td>{r.code}</td>
              <td class="num">{r.utilization !== null && Number.isFinite(r.utilization) ? r.utilization.toFixed(2) : '—'}</td><td>{t(statusKey(r.status))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <p class="muted">{tp('mat.families', { list: OTHER_FAMILIES.map((f) => t(`mat.fam.${f}`)).join(', ') })}</p>
  </section>
</div>

<style>
  .me { display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.72rem; padding: 0.5rem; overflow: auto; }
  .me-lead, .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .muted { display: inline; }
  .me-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .me-sec summary { cursor: pointer; font-weight: 600; }
  .me-row { display: flex; align-items: center; gap: 0.4rem; }
  .me-head { display: flex; align-items: center; justify-content: space-between; }
  .me-head h5 { margin: 0; font-size: 0.75rem; }
  .me-t { width: 100%; border-collapse: collapse; }
  .me-t th, .me-t td { text-align: left; padding: 2px 4px; border-top: 1px solid var(--st-hair); font-weight: 400; }
  .me-t .num { text-align: right; font-variant-numeric: tabular-nums; }
  .me-t tr.bad td { color: var(--st-danger); }
  .me-t tbody tr { cursor: pointer; }
  .me-a { white-space: nowrap; }
  .me-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; }
  .me-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  input, select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  .me-form input { width: 5.5rem; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
