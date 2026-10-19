<!--
  Fire resistance: the rating the project needs and how each material meets it. Steel by the
  temperature it reaches at R, bare or under the protection the maker states; concrete against the
  minimum widths and axis distances of the fire table the project follows; timber by its residual
  section after charring. Every value that comes from a product or a fire code is stated here.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import { fireChecks, fireSettings, patchFire } from '../../../../lib/store/fire';
  import type { ConcreteFireKind } from '../../../../lib/engine/design/fire/fire';
  import SteelMemberSheet from '../steel/SteelMemberSheet.svelte';

  const fs = $derived(fireSettings());
  const checks = $derived(fireChecks());
  let selected = $state<string | null>(null);
  const current = $derived(checks.find((c) => c.id === selected) ?? null);
  let note = $state('');

  const num = (s: string | number | undefined) => { const v = Number(String(s ?? '').replace(',', '.')); return String(s ?? '').trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined; };
  const stateKey = (s: string) => (s === 'ok' ? 'mat.state.ok' : s === 'nearLimit' ? 'mat.state.near' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none');
  const RATINGS = [30, 60, 90, 120, 180, 240];
  const KINDS: ConcreteFireKind[] = ['beam', 'column', 'slab', 'wall'];

  // Protection (λp W/m·K, dp mm, cp J/kg·K, ρp kg/m³), from the maker.
  let prot = $state<Record<string, string>>({ name: fs.steel?.protection?.name ?? '', lambdaP: String(fs.steel?.protection?.lambdaP ?? ''), dp: fs.steel?.protection ? String(fs.steel.protection.dp * 1000) : '', cp: String(fs.steel?.protection?.cp ?? ''), rhoP: String(fs.steel?.protection?.rhoP ?? '') });
  function saveProtection() {
    const l = num(prot.lambdaP), d = num(prot.dp), c = num(prot.cp), r = num(prot.rhoP);
    if (!l || !d || !c || !r) { note = t('fire.ui.missing'); return; }
    patchFire({ steel: { ...(fs.steel ?? {}), protection: { name: prot.name.trim(), lambdaP: l, dp: d / 1000, cp: c, rhoP: r } } });
    note = '';
  }
  function dropProtection() { const { protection: _p, ...rest } = fs.steel ?? {}; patchFire({ steel: rest }); }

  let row = $state<Record<string, string>>({ kind: 'beam', r: '60', bMin: '', aMin: '' });
  function addRow() {
    const b = num(row.bMin), a = num(row.aMin), r = num(row.r);
    if (!b || !a || !r) { note = t('fire.ui.missing'); return; }
    const kind = row.kind as ConcreteFireKind;
    patchFire({ concreteTable: [...(fs.concreteTable ?? []).filter((x) => !(x.kind === kind && x.r === r)), { kind, r, bMin: b / 1000, aMin: a / 1000 }].sort((p, q) => p.kind.localeCompare(q.kind) || p.r - q.r) });
    note = '';
  }

  let timber = $state<Record<string, string>>({ betaN: String(fs.timber?.betaN ?? ''), d0: String(fs.timber?.d0 ?? ''), kfi: String(fs.timber?.kfi ?? '') });
  function saveTimber() {
    const b = num(timber.betaN), d = num(timber.d0), k = num(timber.kfi);
    if (!b || d === undefined || !k) { note = t('fire.ui.missing'); return; }
    patchFire({ timber: { betaN: b, d0: d, kfi: k } });
    note = '';
  }
</script>

<div class="sf" data-testid="fire-editor">
  <p class="muted">{t('fire.ui.lead')}</p>
  <div class="sf-form">
    <label>{t('fire.ui.rating')}
      <select value={String(fs.rMinutes ?? '')} onchange={(e) => patchFire({ rMinutes: num(e.currentTarget.value) })} data-testid="fire-rating">
        <option value="">—</option>{#each RATINGS as r (r)}<option value={String(r)}>R{r}</option>{/each}
      </select>
    </label>
    <label>{t('fire.ui.psi')} <input inputmode="decimal" value={String(fs.psi ?? 0.5)} onchange={(e) => patchFire({ psi: num(e.currentTarget.value) ?? 0.5 })} data-testid="fire-psi" /></label>
  </div>

  <details class="sf-sec" data-testid="fire-steel">
    <summary>{t('fire.ui.steel')} <span class="muted">· {fs.steel?.protection ? tp('fire.ui.protected', { name: fs.steel.protection.name || '—', d: Math.round(fs.steel.protection.dp * 1000) }) : t('fire.ui.bare')}</span></summary>
    <div class="sf-form">
      <label>{t('fire.ui.exposure')} <select value={String(fs.steel?.exposure ?? 4)} onchange={(e) => patchFire({ steel: { ...(fs.steel ?? {}), exposure: e.currentTarget.value === '3' ? 3 : 4 } })}><option value="4">{t('fire.ui.four')}</option><option value="3">{t('fire.ui.three')}</option></select></label>
      <label>{t('fire.ui.method')} <select value={fs.steel?.method ?? 'contour'} onchange={(e) => patchFire({ steel: { ...(fs.steel ?? {}), method: e.currentTarget.value === 'box' ? 'box' : 'contour' } })}><option value="contour">{t('fire.ui.contour')}</option><option value="box">{t('fire.ui.box')}</option></select></label>
    </div>
    <div class="sf-form">
      {#each [['name', 'fire.prot.name'], ['lambdaP', 'fire.prot.lambda'], ['dp', 'fire.prot.dp'], ['cp', 'fire.prot.cp'], ['rhoP', 'fire.prot.rho']] as [k, label] (k)}
        <label>{t(label)} <input bind:value={prot[k]} data-testid="fire-prot-{k}" /></label>
      {/each}
      <button onclick={saveProtection} data-testid="fire-prot-save">{t('mat.save')}</button>
      {#if fs.steel?.protection}<button class="link" onclick={dropProtection}>{t('mat.timber.drop')}</button>{/if}
    </div>
    <p class="muted">{t('fire.ui.steelNote')}</p>
  </details>

  <details class="sf-sec" data-testid="fire-concrete">
    <summary>{t('fire.ui.concrete')} <span class="muted">· {tp('sfl.count', { n: fs.concreteTable?.length ?? 0 })}</span></summary>
    <table class="sf-t">
      <tbody>
        {#each fs.concreteTable ?? [] as e (e.kind + e.r)}
          <tr><td>{t(`fire.kind.${e.kind}`)}</td><td>R{e.r}</td><td>b ≥ {Math.round(e.bMin * 1000)} mm</td><td>a ≥ {Math.round(e.aMin * 1000)} mm</td>
            <td><button class="link" onclick={() => patchFire({ concreteTable: (fs.concreteTable ?? []).filter((x) => x !== e) })}>{t('mat.timber.drop')}</button></td></tr>
        {/each}
      </tbody>
    </table>
    <div class="sf-form">
      <label>{t('fire.ui.kind')} <select bind:value={row.kind}>{#each KINDS as k (k)}<option value={k}>{t(`fire.kind.${k}`)}</option>{/each}</select></label>
      <label>R <select bind:value={row.r}>{#each RATINGS as r (r)}<option value={String(r)}>{r}</option>{/each}</select></label>
      <label>{t('fire.ui.bMin')} <input inputmode="decimal" bind:value={row.bMin} data-testid="fire-bmin" /></label>
      <label>{t('fire.ui.aMin')} <input inputmode="decimal" bind:value={row.aMin} data-testid="fire-amin" /></label>
      <button onclick={addRow} data-testid="fire-row-add">{t('sfl.add')}</button>
    </div>
    <p class="muted">{t('fire.ui.concreteNote')}</p>
  </details>

  <details class="sf-sec" data-testid="fire-timber">
    <summary>{t('fire.ui.timber')} <span class="muted">· {fs.timber ? `βn ${fs.timber.betaN} mm/min` : t('fire.ui.none')}</span></summary>
    <div class="sf-form">
      <label>{t('fire.tim.betaN')} <input inputmode="decimal" bind:value={timber.betaN} /></label>
      <label>{t('fire.tim.d0')} <input inputmode="decimal" bind:value={timber.d0} /></label>
      <label>{t('fire.tim.kfi')} <input inputmode="decimal" bind:value={timber.kfi} /></label>
      <button onclick={saveTimber}>{t('mat.save')}</button>
    </div>
  </details>
  {#if note}<p class="muted" data-testid="fire-note">{note}</p>{/if}

  {#if !fs.rMinutes}<p class="muted">{t('fire.ui.noRating')}</p>
  {:else}
    <table class="sf-t" data-testid="fire-results">
      <tbody>
        {#each checks as c (c.id)}
          <tr class:on={selected === c.id} onclick={() => (selected = c.id)} data-testid="fire-row-{c.id}">
            <td>{c.name}</td><td>{t(`fire.family.${c.family}`)}</td><td>{c.data.map(([k, v]) => `${k} ${v}`).join(' · ')}</td><td>{t(stateKey(c.status))}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if checks.length === 0}<p class="muted">{t('fire.ui.nothing')}</p>{/if}
    {#if current}<SteelMemberSheet rows={current.rows} note={t(`fire.note.${current.family}`)} />{/if}
  {/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td { padding: 2px 4px; border-top: 1px solid var(--st-hair); cursor: pointer; }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  input, select { font-size: 0.72rem; width: 5.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  select { width: auto; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button.link { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
