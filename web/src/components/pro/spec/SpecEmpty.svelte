<script lang="ts">
  /**
   * What a Specifications part shows before anything is selected: what can be edited there, and
   * the two ways to choose what to edit, picking it in the model or typing its ids.
   *
   * It used to be one sentence ("Select members to see and change their specifications"), which
   * said neither what the part held nor how to start.
   */
  import { t } from '../../../lib/i18n';
  import { modelStore, uiStore } from '../../../lib/store';
  import { parseIdList } from '../../../lib/model/select-ops';

  interface Props {
    kind: 'elements' | 'supports' | 'shells';
    /** The groups of properties the part edits, as i18n keys of their titles and one-line hints. */
    items: ReadonlyArray<{ title: string; hint: string }>;
  }
  let { kind, items }: Props = $props();

  const KIND: Record<Props['kind'], { what: string; placeholder: string }> = {
    elements: { what: 'spec.empty.members', placeholder: '3, 7-10' },
    supports: { what: 'spec.empty.supports', placeholder: '1, 4' },
    shells: { what: 'spec.empty.shells', placeholder: 'q1, q2-q6, p3' },
  };

  let typed = $state('');
  let error = $state<string | null>(null);

  function pickInModel() {
    uiStore.currentTool = 'select';
    uiStore.selectMode = kind;
  }

  /** Shells are typed with their kind (q1, p3); a bare number is read as a quad. */
  function shellKeys(text: string): { keys: string[]; bad: boolean } {
    const keys: string[] = [];
    for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
      const m = /^([pq]?)(\d+)(?:-[pq]?(\d+))?$/i.exec(raw);
      if (!m) return { keys, bad: true };
      const k = (m[1] || 'q').toLowerCase();
      const a = Number(m[2]), b = m[3] ? Number(m[3]) : a;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) keys.push(`${k}${i}`);
    }
    return { keys, bad: false };
  }

  function selectTyped(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    if (kind === 'shells') {
      const { keys, bad } = shellKeys(typed);
      const found = keys.filter((k) => (k[0] === 'p' ? modelStore.plates : modelStore.quads).has(Number(k.slice(1))));
      if (bad || found.length === 0) { error = t('spec.empty.noneFound'); return; }
      uiStore.selectMode = 'shells';
      uiStore.setSelection(new Set(), new Set(), true, new Set(found));
      return;
    }
    const { ids, bad } = parseIdList(typed);
    const pool = kind === 'elements' ? modelStore.elements : modelStore.supports;
    const found = ids.filter((id) => pool.has(id));
    if (bad.length > 0 || found.length === 0) { error = t('spec.empty.noneFound'); return; }
    uiStore.selectMode = kind;
    if (kind === 'elements') uiStore.setSelection(new Set(), new Set(found), true);
    else { uiStore.clearSelection(); uiStore.selectedSupports = new Set(found); }
  }
</script>

<div class="pk" data-testid="spec-empty-{kind}">
  <section class="pk-card">
    <p class="se-lead">{t(KIND[kind].what)}</p>
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={pickInModel} data-testid="spec-pick-{kind}">{t('spec.empty.pick')}</button>
      <form class="pk-row pk-grow" onsubmit={selectTyped}>
        <input class="pk-grow" type="text" bind:value={typed} placeholder={KIND[kind].placeholder} aria-label={t('spec.empty.type')} data-testid="spec-type-{kind}" />
        <button class="pk-btn" type="submit" disabled={typed.trim() === ''}>{t('spec.empty.select')}</button>
      </form>
    </div>
    {#if error}<p class="pk-warn" role="alert">{error}</p>{/if}
  </section>
  <section class="pk-card">
    <h4 class="pk-heading">{t('spec.empty.edits')}</h4>
    <ul class="se-list">
      {#each items as it (it.title)}
        <li><span class="se-name">{t(it.title)}</span><span class="pk-hint">{t(it.hint)}</span></li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .se-lead { margin: 0; color: var(--st-text); }
  .se-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .se-list li { display: flex; flex-direction: column; gap: 1px; }
  .se-name { color: var(--st-text); font-weight: 600; }
</style>
