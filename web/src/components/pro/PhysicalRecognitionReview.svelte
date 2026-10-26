<script lang="ts">
  /**
   * The review of a recognition before it is applied.
   *
   * Accepted by kind, with exceptions one by one: a person who agrees with the beams but not with
   * one of them unticks that one. A row selects its bars and shells in the model, so the proposal
   * can be looked at before it is accepted. What is not accepted stays as it was. Elements the
   * proposal would retire are listed with what points at them and where those references go.
   */
  import { uiStore } from '../../lib/store';
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import type { PhysicalKind } from '../../lib/model/physical';
  import { applyRecognition, type RecognitionOutcome, type RecognitionPlan, type RecognitionProposal } from '../../lib/store/physical-recognition';

  let { plan, onDone }: { plan: RecognitionPlan; onDone: (o: RecognitionOutcome | null) => void } = $props();

  const pending = $derived(plan.proposals.filter((p) => p.status !== 'same'));
  const kinds = $derived([...new Set(pending.map((p) => p.kind))] as PhysicalKind[]);
  let kindOff = $state<Set<string>>(new Set());
  /** A proposal with a conflict starts out excluded: accepting it is a decision, never a default. */
  const conflicted = (k: string) => pending.filter((p) => p.kind === k && p.conflicts.length > 0).map((p) => p.key);
  let flipped = $state<Set<string>>(new Set(plan.proposals.filter((p) => p.status !== 'same' && p.conflicts.length > 0).map((p) => p.key)));
  const accepted = (p: RecognitionProposal) => !kindOff.has(p.kind) !== flipped.has(p.key);
  const count = $derived(pending.filter((p) => accepted(p)).length);
  const rows = $derived([...pending].sort((a, b) => b.flags.length - a.flags.length || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, undefined, { numeric: true })));
  const byKey = $derived(new Map(plan.proposals.map((p) => [p.key, p])));
  const same = $derived(plan.proposals.length - pending.length);

  function toggleKind(k: string) {
    const next = new Set(kindOff);
    if (next.has(k)) next.delete(k); else next.add(k);
    kindOff = next;
    // A kind switched as a whole drops the exceptions made inside it; its conflicts stay out.
    flipped = new Set([...[...flipped].filter((key) => byKey.get(key)?.kind !== k), ...(next.has(k) ? [] : conflicted(k))]);
  }
  function toggle(p: RecognitionProposal) {
    const next = new Set(flipped);
    if (next.has(p.key)) next.delete(p.key); else next.add(p.key);
    flipped = next;
  }
  function show(p: RecognitionProposal) {
    uiStore.setSelection(new Set(), new Set(p.draft.elements), true,
      new Set([...p.draft.quads.map((id) => `q${id}`), ...p.draft.plates.map((id) => `p${id}`)]));
  }
  function showOld(id: number) {
    const g = modelStore.model.groups.get(id);
    if (!g) return;
    uiStore.setSelection(new Set(), new Set(g.members.elements ?? []), true,
      new Set([...(g.members.quads ?? []).map((x) => `q${x}`), ...(g.members.plates ?? []).map((x) => `p${x}`)]));
  }
  function apply() { onDone(applyRecognition(plan, accepted)); }
  const succName = (key?: string, id?: number) => key ? byKey.get(key)?.name ?? '—' : id !== undefined ? modelStore.model.groups.get(id)?.name ?? '—' : null;
</script>

<section class="pk-card rr" data-testid="recognition-review">
  <h4 class="pk-heading">{t('physical.review.title')}</h4>
  {#if !plan.changes}
    <p class="pk-hint" data-testid="recognition-nothing">{tp('physical.review.nothing', { n: plan.proposals.length })}</p>
    <div class="pk-row"><button class="pk-btn" onclick={() => onDone(null)} data-testid="recognition-close">{t('physical.review.close')}</button></div>
  {:else}
    <p class="pk-hint" data-testid="recognition-summary">{tp('physical.review.summary', {
      created: pending.filter((p) => p.status === 'new').length,
      changed: pending.filter((p) => p.status === 'changed').length,
      same, removed: plan.removals.length, declared: plan.declared,
    })}</p>
    <div class="rr-kinds" role="group" aria-label={t('physical.review.byKind')}>
      <span class="pk-hint">{t('physical.review.byKind')}</span>
      {#each kinds as k (k)}
        <label class="rr-kind"><input type="checkbox" checked={!kindOff.has(k)} onchange={() => toggleKind(k)} data-testid="recognition-kind-{k}" />
          {t(`physical.kind.${k}`)} ({pending.filter((p) => p.kind === k).length})</label>
      {/each}
    </div>
    <table class="ph-table rr-table" data-testid="recognition-table">
      <thead><tr><th scope="col"></th><th scope="col">{t('physical.name')}</th><th scope="col">{t('physical.kindCol')}</th><th scope="col">{t('physical.review.change')}</th><th scope="col">{t('physical.review.check')}</th></tr></thead>
      <tbody>
        {#each rows as p (p.key)}
          <tr class:off={!accepted(p)} data-testid="recognition-row-{p.key}">
            <td><input type="checkbox" checked={accepted(p)} onchange={() => toggle(p)} aria-label={tp('physical.review.accept', { name: p.name })} data-testid="recognition-accept-{p.key}" /></td>
            <td><button class="ph-name" onclick={() => show(p)} title={t('physical.selectMembers')}>{p.name}</button></td>
            <td>{t(`physical.kind.${p.kind}`)}</td>
            <td>{t(`physical.review.status.${p.status}`)}</td>
            <td class="rr-flags">{#each p.flags as f (f)}<span class="rr-flag" class:rr-conflict={f === 'conflict'} title={t(`physical.review.flagHint.${f}`)}>{t(`physical.review.flag.${f}`)}</span>{/each}</td>
          </tr>
          {#each p.conflicts as c, i (i)}
            <tr class="rr-conflict-row" data-testid="recognition-conflict-{p.key}"><td></td><td colspan="4">{tp(`physical.review.conflict.${c.kind}`, { place: t(`physical.review.place.${c.place}`), from: c.fromName, to: p.name })}</td></tr>
          {/each}
        {/each}
      </tbody>
    </table>
    {#if plan.freezes.length > 0}
      <h5 class="rr-sub">{t('physical.review.freezes')}</h5>
      <ul class="rr-removals" data-testid="recognition-freezes">
        {#each plan.freezes as f (f.fromId)}<li>{tp('physical.review.freeze', { name: f.fromName, places: f.places.map((x) => t(`physical.review.place.${x}`)).join(', ') })}</li>{/each}
      </ul>
    {/if}
    {#if plan.removals.length > 0}
      <h5 class="rr-sub">{t('physical.review.removals')}</h5>
      <ul class="rr-removals" data-testid="recognition-removals">
        {#each plan.removals as r (r.id)}
          {@const to = succName(r.successorKey, r.successorId)}
          <li>
            <button class="ph-name" onclick={() => showOld(r.id)}>{r.name}</button>
            {#if to}{tp('physical.review.goesTo', { name: to })}{:else if r.references.length > 0}{t('physical.review.staysReferenced')}{:else}{t('physical.review.goes')}{/if}
            {#if r.references.length > 0}
              <span class="pk-hint">· {tp('physical.review.refs', { n: r.references.length, places: [...new Set(r.references.map((x) => t(`physical.review.place.${x.place}`)))].join(', ') })}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="pk-hint">{t('physical.review.undo')}</p>
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" disabled={count === 0 && plan.removals.length === 0} onclick={apply} data-testid="recognition-apply">{tp('physical.review.apply', { n: count })}</button>
      <button class="pk-btn" onclick={() => onDone(null)} data-testid="recognition-cancel">{t('physical.review.cancel')}</button>
    </div>
  {/if}
</section>

<style>
  .rr-kinds { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; margin: 6px 0; }
  .rr-kind { display: inline-flex; gap: 4px; align-items: center; font-size: 12px; }
  .rr-table tr.off td { opacity: 0.5; }
  .rr-flags { display: flex; flex-wrap: wrap; gap: 3px; }
  .rr-flag { font-size: 10px; padding: 1px 5px; border-radius: 8px; background: var(--st-warn-bg, rgba(240, 180, 40, 0.15)); color: var(--st-warn, #d9a520); white-space: nowrap; }
  .rr-flag.rr-conflict { background: var(--st-danger-bg, rgba(220, 60, 60, 0.15)); color: var(--st-danger); }
  .rr-conflict-row td { font-size: 11px; color: var(--st-danger); padding-top: 0; }
  .rr-sub { margin: 10px 0 4px; font-size: 12px; }
  .rr-removals { margin: 0; padding-left: 16px; font-size: 12px; }
</style>
