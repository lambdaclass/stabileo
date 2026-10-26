<!--
  Foreign codes: the code the project also designs to, by material, what each covers article by
  article, and the design under it, member by member. CIRSOC stays the project's design; this one
  runs alongside it on the same analysis.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import { FOREIGN_MATRIX, foreignCodes, foreignRun, loadMismatch, setForeignCodes, type ForeignRun } from '../../../../lib/store/foreign-design';
  import { steelOptimise } from '../../../../lib/store/steel-optimise.svelte';
  import type { ForeignCodeId } from '../../../../lib/engine/design/foreign/matrix';
  import SteelMemberSheet from '../steel/SteelMemberSheet.svelte';

  const fc = $derived(foreignCodes());
  const CONCRETE = ['cirsoc', 'aci318', 'ec2', 'ec2-uk'] as const;
  const STEEL = ['cirsoc', 'aisc360', 'ec3', 'ec3-uk'] as const;
  const chosen = $derived([fc.concrete, fc.steel].filter((c): c is ForeignCodeId => !!c && c !== 'cirsoc'));
  let runs = $state<Partial<Record<ForeignCodeId, ForeignRun>>>({});
  let selected = $state<string | null>(null);
  let busy = $state(false);
  const stateKey = (s: string) => (s === 'ok' ? 'mat.state.ok' : s === 'nearLimit' ? 'mat.state.near' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none');

  async function design(code: ForeignCodeId) {
    busy = true;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try { runs = { ...runs, [code]: foreignRun(code) }; } finally { busy = false; }
  }
  const current = $derived.by(() => {
    if (!selected) return null;
    const [code, id] = selected.split(':');
    return runs[code as ForeignCodeId]?.members.find((m) => String(m.elementId) === id) ?? null;
  });
</script>

<div class="sf" data-testid="foreign-codes">
  <p class="muted">{t('fx.ui.lead')}</p>
  <div class="sf-form">
    <label>{t('fx.ui.concrete')}
      <select value={fc.concrete ?? 'cirsoc'} onchange={(e) => setForeignCodes({ concrete: e.currentTarget.value as never })} data-testid="fx-concrete">
        {#each CONCRETE as c (c)}<option value={c}>{t(`fx.code.${c}`)}</option>{/each}
      </select>
    </label>
    <label>{t('fx.ui.steel')}
      <select value={fc.steel ?? 'cirsoc'} onchange={(e) => setForeignCodes({ steel: e.currentTarget.value as never })} data-testid="fx-steel">
        {#each STEEL as c (c)}<option value={c}>{t(`fx.code.${c}`)}</option>{/each}
      </select>
    </label>
  </div>
  {#if chosen.length === 0}<p class="muted">{t('fx.ui.none')}</p>{/if}

  {#each chosen as code (code)}
    {@const mx = FOREIGN_MATRIX[code]}
    {@const run = runs[code]}
    <details class="sf-sec" open data-testid="fx-code-{code}">
      <summary>{mx.name} ({mx.edition})</summary>
      {#if loadMismatch(code)}<p class="warn" data-testid="fx-mismatch-{code}">{t('fx.ui.loadMismatch')}</p>{/if}
      <details>
        <summary class="muted">{t('fx.ui.matrix')}</summary>
        <table class="sf-t" data-testid="fx-matrix-{code}">
          <thead><tr><th>{t('fx.ui.feature')}</th><th>{t('fx.ui.clauses')}</th><th>{t('fx.ui.status')}</th><th></th></tr></thead>
          <tbody>
            {#each mx.rows as r (r.feature)}<tr><td>{t(r.feature)}</td><td>{r.clauses}</td><td class="st-{r.status}">{t(`fx.status.${r.status}`)}</td><td class="muted">{r.note ? t(r.note) : ''}</td></tr>{/each}
          </tbody>
        </table>
      </details>
      <div class="sf-form">
        <button onclick={() => design(code)} disabled={busy} data-testid="fx-run-{code}">{t('fx.ui.design')}</button>
        {#if code === 'aisc360'}<button class="link" onclick={() => steelOptimise.run('member')}>{t('fx.ui.proposeProfiles')}</button>{/if}
      </div>
      {#if run}
        <p class="muted" data-testid="fx-summary-{code}">{tp('fx.ui.summary', { n: run.members.length, s: run.skipped.length })}</p>
        <p class="muted" data-testid="fx-scope-{code}">{t('verdict.otherCodes.scope')}</p>
        <table class="sf-t" data-testid="fx-members-{code}">
          <tbody>
            {#each run.members as m (m.elementId)}
              <tr class:on={selected === `${code}:${m.elementId}`} onclick={() => (selected = `${code}:${m.elementId}`)}>
                <td>{m.elementId}</td><td>{t(`memo.kind.${m.kind === 'member' ? 'beam' : m.kind}`)}</td><td>{m.data.map(([k, v]) => `${k} ${v}`).join(' · ')}</td><td>{m.proposal ? tp('fx.ui.proposal', { p: m.proposal }) : m.candidate ? tp('fx.ui.candidate', { p: m.candidate.profile, list: m.candidate.unevaluated.map((k) => t(k)).join('; ') }) : ''}</td><td>{t(stateKey(m.status))}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if run.members.length === 0}<p class="muted">{t('fx.ui.nothing')}</p>{/if}
        {#if run.skipped.length}
          <details data-testid="fx-skipped-{code}">
            <summary class="muted">{t('fx.ui.skipped')} ({run.skipped.length})</summary>
            <table class="sf-t"><tbody>
              {#each run.skipped as k (k.elementId)}<tr><td>{k.elementId}</td><td>{t(k.reasonKey)}</td><td>{t('mat.state.none')}</td></tr>{/each}
            </tbody></table>
          </details>
        {/if}
      {/if}
    </details>
  {/each}
  {#if current}<SteelMemberSheet rows={current.rows} note={t('fx.ui.sheetNote')} />{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .warn { margin: 0; color: var(--st-warn); font-size: 0.68rem; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec > summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td, .sf-t th { padding: 2px 4px; border-top: 1px solid var(--st-hair); text-align: left; }
  .sf-t tbody tr { cursor: pointer; }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .st-excluded { color: var(--st-text-2); }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button.link { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
