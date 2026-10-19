<!--
  Coordination and versions: the models of the other disciplines linked to the project (shown as
  background drawings per storey), their updates compared object by object and applied by rules,
  the new structural objects brought into the model, and the project's versions published as
  numbered packages and compared with the model now.
-->
<script lang="ts">
  import { t, tp, i18n } from '../../../../lib/i18n';
  import { uiStore } from '../../../../lib/store';
  import {
    applyPendingUpdate, compareWithVersion, contributeAdded, discardPendingUpdate, downloadPackage, federation, federationState,
    linkIfc, prepareUpdate, publishVersion, removeLink, setLinkVisible, type Discipline, type UpdateRules,
  } from '../../../../lib/store/federation.svelte';
  import { FINGERPRINT_CLASSES } from '../../../../lib/engine/federation/versions';

  const fed = $derived(federation());
  const pending = $derived(federationState.pending);
  let note = $state('');
  let busy = $state(false);
  const DISCIPLINES: Discipline[] = ['architecture', 'structure', 'services', 'other'];
  const fmtDate = (iso: string) => new Date(iso).toLocaleString(i18n.locale);

  let file = $state<File | null>(null);
  let form = $state<Record<string, string>>({ name: '', discipline: 'architecture', version: '1' });
  async function link() {
    if (!file || !form.name!.trim()) { note = t('fed.ui.missing'); return; }
    busy = true;
    try {
      const l = await linkIfc(await file.arrayBuffer(), { name: form.name!.trim(), discipline: form.discipline as Discipline, fileName: file.name, version: form.version!.trim() || '1' });
      note = tp('fed.ui.linked', { n: l.entities.length });
    } catch (e) { note = (e as Error).message || t('ifc.parseError'); } finally { busy = false; }
  }

  let updFor = $state<string | null>(null);
  let updVersion = $state('');
  async function update(linkId: string, f: File | undefined) {
    if (!f) return;
    busy = true;
    try { await prepareUpdate(linkId, await f.arrayBuffer(), f.name, updVersion.trim() || f.name); } catch (e) { note = (e as Error).message || t('ifc.parseError'); } finally { busy = false; }
  }
  let rules = $state<UpdateRules>({ added: 'take', modified: 'take', removed: 'remove' });
  function apply() { applyPendingUpdate(rules); note = t('fed.ui.applied'); }
  function contribute() { const r = contributeAdded(); note = tp('fed.ui.contributed', { b: r.bars, s: r.shells }); }

  let pub = $state({ author: '', note: '' });
  function publish() {
    const r = publishVersion(pub.author.trim(), pub.note.trim(), tp as never, i18n.locale);
    downloadPackage(r.zip, r.version.number);
    uiStore.toast(tp('fed.ui.published', { n: r.version.number }), 'success');
    pub = { author: pub.author, note: '' };
  }
  let compared = $state<{ n: number; d: ReturnType<typeof compareWithVersion> } | null>(null);
</script>

<div class="sf" data-testid="collab-editor">
  <p class="muted">{t('fed.ui.lead')}</p>

  <details class="sf-sec" open data-testid="fed-links">
    <summary>{t('fed.ui.links')} <span class="muted">· {tp('sfl.count', { n: fed.links.length })}</span></summary>
    <table class="sf-t">
      <tbody>
        {#each fed.links as l (l.id)}
          <tr data-testid="fed-link-{l.id}">
            <td><input type="checkbox" checked={l.visible} onchange={(e) => setLinkVisible(l.id, e.currentTarget.checked)} title={t('fed.ui.visible')} /></td>
            <td>{l.name}</td><td>{t(`fed.disc.${l.discipline}`)}</td><td>{l.fileName} · v{l.version}</td><td>{tp('fed.ui.objects', { n: l.entities.length })}</td><td class="muted">{fmtDate(l.date)}</td>
            <td><button class="link" onclick={() => (updFor = updFor === l.id ? null : l.id)}>{t('fed.ui.update')}</button><button class="link" onclick={() => removeLink(l.id)}>{t('mat.timber.drop')}</button></td>
          </tr>
          {#if updFor === l.id}
            <tr><td colspan="7">
              <div class="sf-form">
                <label>{t('fed.ui.versionLabel')} <input bind:value={updVersion} /></label>
                <input type="file" accept=".ifc" onchange={(e) => update(l.id, e.currentTarget.files?.[0])} data-testid="fed-update-file" />
              </div>
            </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <div class="sf-form">
      <input type="file" accept=".ifc" onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)} data-testid="fed-link-file" />
      <label>{t('fed.ui.name')} <input bind:value={form.name} data-testid="fed-link-name" /></label>
      <label>{t('fed.ui.discipline')} <select bind:value={form.discipline}>{#each DISCIPLINES as d (d)}<option value={d}>{t(`fed.disc.${d}`)}</option>{/each}</select></label>
      <label>{t('fed.ui.versionLabel')} <input bind:value={form.version} /></label>
      <button onclick={link} disabled={busy} data-testid="fed-link-add">{t('fed.ui.link')}</button>
    </div>
  </details>

  {#if pending}
    <details class="sf-sec" open data-testid="fed-pending">
      <summary>{t('fed.ui.pending')} <span class="muted">· {tp('fed.ui.diffSummary', { a: pending.diff.added.length, m: pending.diff.modified.length, r: pending.diff.removed.length, u: pending.diff.unchanged })}</span></summary>
      {#each [['added', pending.diff.added], ['modified', pending.diff.modified.map((x) => x.after)], ['removed', pending.diff.removed]] as [kind, list] (kind)}
        {#if (list as unknown[]).length}
          <p class="muted"><strong>{t(`fed.diff.${kind}`)}</strong>: {(list as Array<{ ifcClass: string; name: string }>).slice(0, 30).map((e) => `${e.ifcClass} ${e.name}`).join(' · ')}{(list as unknown[]).length > 30 ? ' …' : ''}</p>
        {/if}
      {/each}
      <div class="sf-form">
        <label>{t('fed.diff.added')} <select bind:value={rules.added}><option value="take">{t('fed.rule.take')}</option><option value="skip">{t('fed.rule.skip')}</option></select></label>
        <label>{t('fed.diff.modified')} <select bind:value={rules.modified}><option value="take">{t('fed.rule.take')}</option><option value="skip">{t('fed.rule.skip')}</option></select></label>
        <label>{t('fed.diff.removed')} <select bind:value={rules.removed}><option value="remove">{t('fed.rule.remove')}</option><option value="keep">{t('fed.rule.keep')}</option></select></label>
        <button onclick={apply} data-testid="fed-apply">{t('fed.ui.apply')}</button>
        <button onclick={contribute} disabled={!pending.diff.added.length} data-testid="fed-contribute">{t('fed.ui.contribute')}</button>
        <button class="link" onclick={discardPendingUpdate}>{t('fed.ui.discard')}</button>
      </div>
    </details>
  {/if}

  <details class="sf-sec" open data-testid="fed-versions">
    <summary>{t('fed.ui.versions')} <span class="muted">· {tp('sfl.count', { n: fed.versions.length })}</span></summary>
    <div class="sf-form">
      <label>{t('fed.ui.author')} <input bind:value={pub.author} data-testid="fed-author" /></label>
      <label class="wide">{t('fed.ui.note')} <input bind:value={pub.note} data-testid="fed-note" /></label>
      <button onclick={publish} data-testid="fed-publish">{t('fed.ui.publish')}</button>
    </div>
    <table class="sf-t">
      <tbody>
        {#each [...fed.versions].reverse() as v (v.number)}
          <tr data-testid="fed-version-{v.number}">
            <td>v{v.number}</td><td class="muted">{fmtDate(v.date)}</td><td>{v.author}</td><td>{v.note}</td><td class="muted">{tp('fed.ui.counts', { e: v.counts.elements, n: v.counts.nodes, l: v.counts.loads })}</td>
            <td><button class="link" onclick={() => (compared = { n: v.number, d: compareWithVersion(v.number) })} data-testid="fed-compare-{v.number}">{t('fed.ui.compare')}</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if compared?.d}
      <table class="sf-t" data-testid="fed-comparison">
        <thead><tr><th>{tp('fed.ui.comparedWith', { n: compared.n })}</th><th>{t('fed.diff.added')}</th><th>{t('fed.diff.modified')}</th><th>{t('fed.diff.removed')}</th></tr></thead>
        <tbody>{#each FINGERPRINT_CLASSES as c (c)}{@const d = compared.d[c]}<tr><td>{t(`fed.class.${c}`)}</td><td>{d.added.length}</td><td>{d.modified.length}</td><td>{d.removed.length}</td></tr>{/each}</tbody>
      </table>
    {/if}
  </details>
  {#if note}<p class="muted" data-testid="fed-msg">{note}</p>{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td, .sf-t th { padding: 2px 4px; border-top: 1px solid var(--st-hair); text-align: left; }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .sf-form label.wide { flex: 1 1 16rem; }
  input, select { font-size: 0.72rem; width: 7rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  .wide input { width: 100%; }
  input[type='file'], input[type='checkbox'] { width: auto; }
  select { width: auto; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button.link { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
