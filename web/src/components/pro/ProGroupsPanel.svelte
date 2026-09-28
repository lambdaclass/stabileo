<script lang="ts">
  /**
   * Named groups: create from the selection, select, rename, grow, shrink, delete.
   *
   * The schema is `ModelGroup` (`store/model.svelte.ts`): a kind, members by family, and data
   * carried verbatim. This panel edits the kinds it knows — a plain selection and a floor — and
   * shows any other kind read-only, untouched. That is deliberate: a kind this build does not know
   * is a rule some other part of the application owns (the physical model's members, panels and
   * pieces arrive this way), and a panel that let a user reshape it would break the rule without
   * knowing it was there.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import type { ModelGroup, GroupMembers } from '../../lib/store/model.svelte';

  const EDITABLE = new Set(['selection', 'floor']);

  let name = $state('');
  let kind = $state<'selection' | 'floor'>('selection');
  let renaming = $state<number | null>(null);
  let renameText = $state('');

  const groups = $derived([...modelStore.model.groups.values()].sort((a, b) => a.id - b.id));

  /** The selection, by family, read against the model. */
  const selection = $derived.by((): GroupMembers => {
    const nodes = [...uiStore.selectedNodes].filter((id) => modelStore.nodes.has(id));
    const elements = [...uiStore.selectedElements].filter((id) => modelStore.elements.has(id));
    const quads: number[] = [], plates: number[] = [];
    for (const key of uiStore.selectedShells) {
      const id = Number(key.slice(1));
      if (key[0] === 'q' && modelStore.quads.has(id)) quads.push(id);
      if (key[0] === 'p' && modelStore.plates.has(id)) plates.push(id);
    }
    return { ...(nodes.length ? { nodes } : {}), ...(elements.length ? { elements } : {}), ...(quads.length ? { quads } : {}), ...(plates.length ? { plates } : {}) };
  });
  const selectionSize = $derived(Object.values(selection).reduce((s, l) => s + (l?.length ?? 0), 0));

  const count = (g: ModelGroup) => (g.members.nodes?.length ?? 0) + (g.members.elements?.length ?? 0)
    + (g.members.quads?.length ?? 0) + (g.members.plates?.length ?? 0);

  function create() {
    const n = name.trim() || tp('groups.defaultName', { n: groups.length + 1 });
    modelStore.addGroup(n, kind, selection);
    name = '';
  }

  function select(g: ModelGroup) {
    uiStore.setSelection(
      new Set(g.members.nodes ?? []), new Set(g.members.elements ?? []), true,
      new Set([...(g.members.quads ?? []).map((id) => `q${id}`), ...(g.members.plates ?? []).map((id) => `p${id}`)]),
    );
  }

  function combine(g: ModelGroup, op: 'add' | 'remove') {
    const out: GroupMembers = {};
    for (const fam of ['nodes', 'elements', 'quads', 'plates'] as const) {
      const cur = new Set(g.members[fam] ?? []);
      for (const id of selection[fam] ?? []) { if (op === 'add') cur.add(id); else cur.delete(id); }
      if (cur.size > 0 || g.members[fam]) out[fam] = [...cur].sort((a, b) => a - b);
    }
    modelStore.setGroupMembers(g.id, out);
  }

  function commitRename(g: ModelGroup) {
    const n = renameText.trim();
    if (n && n !== g.name) modelStore.renameGroup(g.id, n);
    renaming = null;
  }
</script>

<div class="pk gp" data-testid="groups-panel">
  <section class="pk-card">
  <h4 class="pk-heading">{t('groups.newTitle')}</h4>
  <p class="pk-hint">{t('groups.explain')}</p>
  <div class="pk-row">
    <input class="gp-name" placeholder={t('groups.namePlaceholder')} bind:value={name} data-testid="gp-name" />
    <select bind:value={kind} data-testid="gp-kind">
      <option value="selection">{t('groups.kind.selection')}</option>
      <option value="floor">{t('groups.kind.floor')}</option>
    </select>
    <button class="pk-btn pk-btn-primary" onclick={create} disabled={selectionSize === 0} data-testid="gp-create">{t('groups.createFromSelection')}</button>
  </div>
  <p class="pk-hint">{selectionSize === 0 ? t('groups.selectFirst') : tp('groups.selectionSize', { n: selectionSize })}</p>
  </section>

  <section class="pk-card">
  <h4 class="pk-heading">{tp('groups.listTitle', { n: groups.length })}</h4>

  {#if groups.length === 0}
    <p class="pk-hint">{t('groups.none')}</p>
  {:else}
    <ul class="gp-list">
      {#each groups as g (g.id)}
        {@const editable = EDITABLE.has(g.kind)}
        <li class="gp-item" data-testid="gp-group-{g.id}">
          <div class="gp-head">
            {#if renaming === g.id}
              <input class="gp-name" bind:value={renameText} onkeydown={(e) => e.key === 'Enter' && commitRename(g)} onblur={() => commitRename(g)} />
            {:else}
              <button class="gp-title" onclick={() => select(g)} title={t('groups.selectMembers')}>{g.name}</button>
            {/if}
            <span class="gp-kind">{editable ? t(`groups.kind.${g.kind}`) : g.kind}</span>
            <span class="gp-count">{tp('groups.members', { n: count(g) })}</span>
          </div>
          {#if editable}
            <div class="gp-actions">
              <button class="pk-btn" onclick={() => { renaming = g.id; renameText = g.name; }}>{t('groups.rename')}</button>
              <button class="pk-btn" onclick={() => combine(g, 'add')} disabled={selectionSize === 0}>{t('groups.addSelection')}</button>
              <button class="pk-btn" onclick={() => combine(g, 'remove')} disabled={selectionSize === 0}>{t('groups.removeSelection')}</button>
              <button class="pk-btn gp-del" onclick={() => modelStore.removeGroup(g.id)}>{t('groups.delete')}</button>
            </div>
          {:else}
            <p class="pk-hint">{t('groups.readOnly')}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  </section>
</div>

<style>
  .gp-name { flex: 1; min-width: 120px; }
  .gp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .gp-item { padding: 6px 8px; background: var(--st-surface-3); border: 1px solid var(--st-hair); border-radius: var(--st-radius); display: flex; flex-direction: column; gap: 5px; }
  .gp-head { display: flex; align-items: center; gap: 8px; }
  .gp-title { background: transparent; border: none; padding: 0; color: var(--st-interactive); font-weight: 600; text-align: left; cursor: pointer; font-size: 0.72rem; }
  .gp-kind { color: var(--st-text-3); font-size: 0.62rem; font-family: var(--st-mono); }
  .gp-count { margin-left: auto; color: var(--st-text-3); font-size: 0.62rem; }
  .gp-actions { display: flex; gap: 4px; flex-wrap: wrap; }
  .gp-actions :global(.pk-btn) { min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.64rem; }
  .gp-actions :global(.gp-del) { border-color: var(--st-danger); }
</style>
