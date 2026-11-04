<script lang="ts">
  /**
   * The catalogue of construction details: by family, each with its code, a preview drawn with the
   * project's values, its technical note, whether the set carries it and on which sheet. The
   * previews are drawn when their family is opened.
   */
  import { t, tp } from '../../../lib/i18n';
  import { DETAIL_FAMILIES, DETAILS, familyDetails, detailPreviewSvg, type DetailChoice } from '../../../lib/sheets/details/catalog';
  import type { DetailFamily } from '../../../lib/sheets/details/values';
  import { chosenDetails, projectDetailValues, setChosenDetails, setDetailTarget, toggleDetail } from '../../../lib/store/detail-catalog';
  import { sheetEntries, sheetLanguage, unplacedDetails } from '../../../lib/store/sheet-set';
  import { PLAN_KINDS, planContext } from '../../../lib/store/work-drawings';
  import type { DocumentModel } from '../../../lib/engine/detailing/document-model';

  let { doc, onChange }: { doc: DocumentModel | null; onChange: () => void } = $props();

  const chosen = $derived(new Map(chosenDetails().map((c) => [c.id, c.target])));
  const kindsInSet = $derived(new Set(sheetEntries().map((e) => e.kind)));
  const unplaced = $derived(unplacedDetails());
  const values = $derived(projectDetailValues(doc));
  const ctx = $derived(planContext(sheetLanguage(), 'A1'));
  let open = $state<Set<DetailFamily>>(new Set());
  const TARGETS = PLAN_KINDS.filter((k) => k !== 'detailing');

  function toggleFamily(f: DetailFamily, on: boolean) { const n = new Set(open); if (on) n.add(f); else n.delete(f); open = n; }
  function pickFamily(f: DetailFamily, on: boolean) {
    const ids = new Set(familyDetails(f).map((d) => d.id));
    const rest: DetailChoice[] = chosenDetails().filter((c) => !ids.has(c.id));
    setChosenDetails(on ? [...rest, ...familyDetails(f).map((d) => ({ id: d.id, target: chosen.get(d.id) ?? d.target }))] : rest);
    onChange();
  }
  const pick = (id: string, on: boolean) => { toggleDetail(id, on); onChange(); };
  const retarget = (id: string, target: string) => { setDetailTarget(id, target); onChange(); };
  const reset = () => { setChosenDetails(undefined); onChange(); };
  /** A detail on screen: its preview and note, drawn once its family is open. */
  function shown(id: string) {
    const d = DETAILS.find((x) => x.id === id)!;
    try { const r = d.render(values, ctx.tr, ctx.fmt); return { svg: detailPreviewSvg(r.drawing), note: r.note }; } catch { return { svg: '', note: ctx.tr(`plan.det.${id}.n`) }; }
  }
</script>

<details class="dc" data-testid="sheets-details-catalog">
  <summary>{t('sheet.ui.det.title')} <span class="muted">· {tp('sheet.ui.det.summary', { n: chosen.size, m: DETAILS.length })}</span></summary>
  <p class="lead">{t('sheet.ui.det.lead')}</p>
  {#if values.typical.length}
    <p class="note" data-testid="det-typical">{tp('sheet.ui.det.typical', { list: values.typical.map((k) => t(`plan.det.kind.${k}`)).join(', ') })}</p>
  {/if}
  {#if unplaced.length}
    <p class="warn" role="status" data-testid="det-unplaced">{tp('sheet.ui.det.unplaced', { list: unplaced.map((c) => DETAILS.find((d) => d.id === c.id)?.code ?? c.id).join(', ') })}</p>
  {/if}
  {#each DETAIL_FAMILIES as f (f)}
    {@const list = familyDetails(f)}
    {@const n = list.filter((d) => chosen.has(d.id)).length}
    <details class="fam" data-testid="det-fam-{f}" ontoggle={(e) => toggleFamily(f, (e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{t(`plan.det.fam.${f}`)} <span class="muted">· {n}/{list.length}</span></summary>
      <div class="fam-actions">
        <button onclick={() => pickFamily(f, true)} data-testid="det-fam-all-{f}">{t('sheet.ui.det.all')}</button>
        <button onclick={() => pickFamily(f, false)} disabled={n === 0}>{t('sheet.ui.det.none')}</button>
      </div>
      {#if open.has(f)}
        <ul>
          {#each list as d (d.id)}
            {@const s = shown(d.id)}
            {@const target = chosen.get(d.id) ?? d.target}
            <li class:on={chosen.has(d.id)} data-testid="det-{d.id}">
              <div class="preview" data-testid="det-preview-{d.id}">{@html s.svg}</div>
              <div class="body">
                <div class="head">
                  <span class="code">{d.code}</span>
                  <span class="name">{ctx.tr(`plan.det.${d.id}.t`)}</span>
                  {#if d.seismic}<span class="badge">{t('sheet.ui.det.seismic')}</span>{/if}
                </div>
                <p class="tech">{s.note}</p>
                <div class="ctl">
                  <label class="chk"><input type="checkbox" checked={chosen.has(d.id)} onchange={(e) => pick(d.id, e.currentTarget.checked)} data-testid="det-pick-{d.id}" /> {t('sheet.ui.det.include')}</label>
                  <label>{t('sheet.ui.det.sheet')}
                    <select value={target} disabled={!chosen.has(d.id)} onchange={(e) => retarget(d.id, e.currentTarget.value)} data-testid="det-target-{d.id}">
                      {#each TARGETS as k (k)}<option value={k}>{t(`sheet.kind.${k}`)}</option>{/each}
                    </select>
                  </label>
                </div>
                {#if chosen.has(d.id) && !kindsInSet.has(target) && kindsInSet.has('details')}<p class="hint">{t('sheet.ui.det.notInSet')}</p>{/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </details>
  {/each}
  <div class="fam-actions"><button onclick={reset} data-testid="det-reset">{t('sheet.ui.det.reset')}</button></div>
</details>

<style>
  .dc summary { font-size: 0.68rem; cursor: pointer; color: var(--st-text); }
  .muted { display: inline; font-size: 0.66rem; color: var(--st-text-2); }
  .lead, .note, .hint { margin: 0.2rem 0; font-size: 0.64rem; color: var(--st-text-2); }
  .warn { margin: 0.2rem 0; font-size: 0.64rem; color: var(--st-warn); }
  .fam { margin: 0.15rem 0 0.15rem 0.5rem; }
  .fam-actions { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0.2rem 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  li { display: grid; grid-template-columns: minmax(0, 9.5rem) minmax(0, 1fr); gap: 0.4rem; padding: 0.3rem; border: 1px solid var(--st-hair); border-radius: 4px; }
  li.on { border-color: var(--st-accent); }
  .preview { border-radius: 3px; overflow: hidden; display: flex; align-items: center; justify-content: center; min-height: 4rem; }
  .preview :global(svg) { width: 100%; height: auto; max-height: 9rem; }
  .body { min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem; font-size: 0.68rem; color: var(--st-text); }
  .code { font-variant-numeric: tabular-nums; font-weight: 600; }
  .badge { font-size: 0.58rem; padding: 0 0.3rem; border-radius: 3px; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); }
  .tech { margin: 0; font-size: 0.62rem; line-height: 1.35; color: var(--st-text-2); }
  .ctl { display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.6rem; font-size: 0.64rem; color: var(--st-text-2); }
  .ctl label { display: flex; align-items: center; gap: 0.25rem; }
  button, select { font-size: 0.66rem; padding: 0.05rem 0.3rem; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  button { cursor: pointer; }
  button:disabled, select:disabled { opacity: 0.45; cursor: default; }
</style>
