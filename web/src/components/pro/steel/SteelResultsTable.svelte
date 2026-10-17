<script lang="ts">
  /**
   * CIRSOC 301 results, per steel member: every limit state the engine ran — tension D.2,
   * compression E, flexure F about both axes, shear G, interaction H.1 — with its demand, design
   * strength, ratio and status, the governing check, and the calculation clause by clause.
   *
   * Each row is `checkSteelMember`, the same call the optimiser and the tension table make, so
   * every number on this screen comes from the engine and has been through its gate: a pass
   * stands only when the engine's interval-arithmetic check proves the utilization below 1, which
   * is what the «proven bound» badge shows with its enclosure. A check that could not be evaluated
   * says why, by clause. Members the checker cannot read are listed with what they lack.
   *
   * Experimental like every CIRSOC 301 number in the app: no passing colour, no tick.
   */
  import { t, tp } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { membersFor } from '../../../lib/store/steel-optimise.svelte';
  import { checkSteelMember, steelInputCompleteness, steelInputGapKey } from '../../../lib/engine/verification-service';
  import type { EngineMessage } from '../../../lib/codes/message';

  let { steelIds }: { steelIds: ReadonlySet<number> } = $props();

  const hasDemands = $derived(resultsStore.results3D !== null);

  type Status = 'pass' | 'fail' | 'notEvaluated';
  interface CheckRow {
    key: 'tension' | 'compression' | 'flexureStrong' | 'flexureWeak' | 'shear' | 'interaction';
    clause: string; demand: string; capacity: string; ratio: number; status: Status;
    reason?: EngineMessage; messages: EngineMessage[];
  }
  interface Row {
    id: number; section: string; ratio: number; governing: string; status: Status;
    proven: boolean; lower?: number; upper?: number; checks: CheckRow[];
  }

  function statusOf(c: { status: string; notEvaluatedMessage?: EngineMessage; ratio: number }): Status {
    if (c.notEvaluatedMessage && c.ratio > 0) return 'notEvaluated';
    return c.status === 'fail' ? 'fail' : 'pass';
  }

  const rows = $derived.by((): Row[] => {
    void modelStore.modelVersion;
    if (!resultsStore.results3D) return [];
    const { members, materialOf } = membersFor([...steelIds]);
    const out: Row[] = [];
    for (const m of members) {
      const e = modelStore.elements.get(m.elementId);
      const sec = e && modelStore.sections.get(e.sectionId);
      const mat = materialOf.get(m.elementId);
      if (!sec || !mat) continue;
      const v = checkSteelMember(m.elementId, m.demand, sec as never, mat, m.lengths, m.segment);
      if (!v) continue;
      const kN = (x: number) => `${x.toFixed(1)} kN`;
      const kNm = (x: number) => `${x.toFixed(2)} kN·m`;
      const checks: CheckRow[] = [];
      const add = (key: CheckRow['key'], c: { ratio: number; status: string; clauseRef?: string; notEvaluatedMessage?: EngineMessage; messages: EngineMessage[] } | undefined, demand: string, capacity: string) => {
        if (!c) return;
        checks.push({ key, clause: c.clauseRef ?? '', demand, capacity, ratio: c.ratio, status: statusOf(c), reason: c.notEvaluatedMessage, messages: c.messages });
      };
      add('tension', v.tension, v.tension ? kN(v.tension.Pu) : '', v.tension ? kN(v.tension.phiPn) : '');
      add('compression', v.compression, v.compression ? kN(v.compression.Pu) : '', v.compression ? kN(v.compression.phiPn) : '');
      add('flexureStrong', v.flexureZ, kNm(v.flexureZ.Mu), kNm(v.flexureZ.phiMn));
      add('flexureWeak', v.flexureY, v.flexureY ? kNm(v.flexureY.Mu) : '', v.flexureY ? kNm(v.flexureY.phiMn) : '');
      add('shear', v.shear, kN(v.shear.Vu), kN(v.shear.phiVn));
      add('interaction', v.interaction, v.interaction ? v.interaction.value.toFixed(3) : '', '1.000');
      const gov = checks.reduce((a, b) => (b.ratio > a.ratio ? b : a), checks[0]!);
      const status: Status = checks.some((c) => c.status === 'notEvaluated') ? 'notEvaluated' : v.overallStatus === 'fail' ? 'fail' : 'pass';
      const rc = v.engineRecheck;
      out.push({
        id: m.elementId, section: sec.name, ratio: gov.ratio, governing: gov.key, status,
        proven: rc.certifiedOk,
        ...(rc.certified ? { lower: rc.utilizationLower, upper: rc.utilizationUpper } : {}),
        checks,
      });
    }
    return out.sort((a, b) => a.id - b.id);
  });

  const skipped = $derived.by(() => {
    void modelStore.modelVersion;
    return steelInputCompleteness({
      elements: modelStore.model.elements, nodes: modelStore.model.nodes, sections: modelStore.model.sections,
      materials: modelStore.model.materials, supports: modelStore.model.supports,
    } as never).filter((s) => steelIds.has(s.elementId));
  });

  let open = $state<number | null>(null);
  const pct = (r: number) => (Number.isFinite(r) ? `${(r * 100).toFixed(0)} %` : '—');
</script>

<div class="sr" data-testid="steel-results">
  <h5 class="sr-title">{t('steel.results.title')}</h5>
  <p class="line">{t('steel.results.hint')}</p>
  <p class="line warn">{t('steel.tc.results.experimental')}</p>
  {#if !hasDemands}
    <p class="line" data-testid="steel-results-solve">{t('steel.tc.results.solveFirst')}</p>
  {:else if rows.length === 0 && skipped.length === 0}
    <p class="line" data-testid="steel-results-none">{t('steel.results.none')}</p>
  {:else}
    <table class="rows">
      <thead><tr>
        <th>{t('steel.tc.col.member')}</th><th>{t('steel.results.col.section')}</th><th>{t('steel.results.col.governing')}</th>
        <th>{t('steel.tc.col.ratio')}</th><th>{t('steel.tc.col.status')}</th><th>{t('steel.results.col.bound')}</th><th></th>
      </tr></thead>
      <tbody>
        {#each rows as r (r.id)}
          <tr data-testid="steel-result-{r.id}" data-status={r.status}>
            <td>#{r.id}</td>
            <td>{r.section}</td>
            <td>{t(`steel.results.check.${r.governing}`)}</td>
            <td class="num" data-testid="steel-result-ratio-{r.id}">{pct(r.ratio)}</td>
            <td><span class="st st-{r.status}" data-testid="steel-result-status-{r.id}">{t(`steel.results.status.${r.status}`)}</span></td>
            <td>
              {#if r.proven}
                <span class="badge" data-testid="steel-result-proven-{r.id}" title={t('steel.results.provenHint')}>
                  {t('steel.results.proven')} [{r.lower?.toFixed(3)}, {r.upper?.toFixed(3)}]
                </span>
              {:else}
                <span class="dim" data-testid="steel-result-unproven-{r.id}">{t('steel.results.unproven')}</span>
              {/if}
            </td>
            <td><button class="link" onclick={() => { open = open === r.id ? null : r.id; }} data-testid="steel-result-open-{r.id}">{t('steel.tc.results.steps')}</button></td>
          </tr>
          {#if open === r.id}
            <tr class="detail"><td colspan="7">
              <table class="checks" data-testid="steel-result-checks-{r.id}">
                <thead><tr>
                  <th>{t('steel.results.col.check')}</th><th>{t('steel.results.col.clause')}</th><th>{t('steel.results.col.demand')}</th>
                  <th>{t('steel.results.col.capacity')}</th><th>{t('steel.tc.col.ratio')}</th><th>{t('steel.tc.col.status')}</th>
                </tr></thead>
                <tbody>
                  {#each r.checks as c (c.key)}
                    <tr data-testid="steel-check-{r.id}-{c.key}" data-status={c.status}>
                      <td>{t(`steel.results.check.${c.key}`)}</td>
                      <td>{c.clause}</td>
                      <td class="num">{c.demand}</td>
                      <td class="num">{c.status === 'notEvaluated' ? '—' : c.capacity}</td>
                      <td class="num">{pct(c.ratio)}</td>
                      <td>
                        <span class="st st-{c.status}">{t(`steel.results.status.${c.status}`)}</span>
                        {#if c.reason}<span class="why" data-testid="steel-check-why-{r.id}-{c.key}"> — {te(c.reason)}</span>{/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <pre data-testid="steel-result-pre-{r.id}">{r.checks.flatMap((c) => c.messages.map((m) => te(m))).join('\n')}</pre>
            </td></tr>
          {/if}
        {/each}
        {#each skipped as s (s.elementId)}
          <tr data-testid="steel-result-skipped-{s.elementId}" data-status="notEvaluated">
            <td>#{s.elementId}</td>
            <td colspan="6" class="ne"><strong>{t('steel.results.status.notEvaluated')}</strong> —
              {tp('steel.results.missingInputs', { what: s.gaps.map((g) => t(steelInputGapKey(g))).join(', ') })}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .sr { margin-top: 8px; }
  .sr :global(td), .sr :global(th) { padding: 2px 6px; }
  .sr-title { margin: 0 0 2px; font-size: 0.72rem; }
  .num { font-family: var(--st-mono); text-align: right; white-space: nowrap; }
  .ne, .st-notEvaluated, .why { color: var(--st-warn); }
  .st-fail { color: var(--st-danger, var(--st-warn)); font-weight: 600; }
  .st-pass { color: var(--st-text-2); }
  .badge { font-family: var(--st-mono); font-size: 0.6rem; border: 1px solid var(--st-border); border-radius: 3px; padding: 0 4px; color: var(--st-text-2); }
  .dim { color: var(--st-text-3); font-size: 0.6rem; }
  .link { background: none; border: none; color: var(--st-accent); cursor: pointer; font-size: 0.62rem; padding: 0; text-decoration: underline; }
  .checks { margin: 4px 0; }
  pre { margin: 4px 0 0; white-space: pre-wrap; font-size: 0.6rem; font-family: var(--st-mono); }
</style>
