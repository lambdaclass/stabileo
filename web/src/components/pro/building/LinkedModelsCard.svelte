<script lang="ts">
  import Hint from '../Hint.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { applyPendingUpdate, federation, linkIfc, prepareUpdate, relinkReference, referenceAvailable, removeLink, setLinkVisible, type Discipline, type LinkedModel } from '../../../lib/store/federation.svelte';

  const DISCIPLINES: Discipline[] = ['architecture', 'structure', 'services', 'other'];
  const links = $derived(federation().links);
  let discipline = $state<Discipline>('architecture');
  let busy = $state(false);
  let note = $state<string | null>(null);
  let available = $state<Record<string, boolean>>({});

  $effect(() => {
    const list = links;
    let stale = false;
    void Promise.all(list.map(async (l) => [l.id, await referenceAvailable(l)] as const)).then((r) => { if (!stale) available = Object.fromEntries(r); });
    return () => { stale = true; };
  });

  async function link(f: File | undefined) {
    if (!f) return;
    busy = true; note = null;
    try {
      const l = await linkIfc(await f.arrayBuffer(), { name: f.name.replace(/\.ifc$/i, ''), discipline, fileName: f.name, version: '1' });
      note = summary(l);
    } catch (e) { note = (e as Error).message || t('ifc.parseError'); } finally { busy = false; }
  }

  async function relink(l: LinkedModel, f: File | undefined) {
    if (!f) return;
    busy = true; note = null;
    try {
      note = (await relinkReference(l.id, await f.arrayBuffer())) === 'ok' ? t('linked.relinked') : t('linked.otherFile');
      available = { ...available, [l.id]: await referenceAvailable(federation().links.find((x) => x.id === l.id) ?? l) };
    } catch (e) { note = (e as Error).message || t('ifc.parseError'); } finally { busy = false; }
  }

  /** A new version of the file: everything it has taken, as the update's defaults do. */
  async function update(l: LinkedModel, f: File | undefined) {
    if (!f) return;
    busy = true; note = null;
    try {
      const d = await prepareUpdate(l.id, await f.arrayBuffer(), f.name, f.name);
      if (d) {
        applyPendingUpdate({ added: 'take', modified: 'take', removed: 'remove' });
        note = tp('fed.ui.diffSummary', { a: d.added.length, m: d.modified.length, r: d.removed.length, u: d.unchanged });
      }
    } catch (e) { note = (e as Error).message || t('ifc.parseError'); } finally { busy = false; }
  }

  function summary(l: LinkedModel): string {
    const c = l.reference?.counts;
    if (!c) return tp('fed.ui.objects', { n: l.entities.length });
    const missing = Object.entries(c.byType).filter(([, v]) => v.symbols + v.none > 0)
      .sort((a, b) => (b[1].symbols + b[1].none) - (a[1].symbols + a[1].none)).slice(0, 4)
      .map(([k, v]) => `${v.symbols + v.none} ${k}`).join(', ');
    return tp(missing ? 'linked.countsMissing' : 'linked.counts', { drawn: c.drawn, symbols: c.symbols, none: c.none, list: missing });
  }
</script>

<section class="pk-card" data-testid="linked-models-card">
  <h4 class="pk-heading">{t('linked.title')}</h4>
  <Hint text={t('linked.hint')} />
  <div class="pk-row">
    <select bind:value={discipline} aria-label={t('fed.ui.discipline')} data-testid="linked-discipline">
      {#each DISCIPLINES as d (d)}<option value={d}>{t(`fed.disc.${d}`)}</option>{/each}
    </select>
    <label class="pk-btn lm-file">{busy ? t('linked.reading') : t('linked.link')}
      <input type="file" accept=".ifc" disabled={busy} onchange={(e) => link(e.currentTarget.files?.[0])} data-testid="linked-file" />
    </label>
  </div>
  {#if note}<p class="pk-hint" role="status" data-testid="linked-note">{note}</p>{/if}
  {#if links.length}
    <ul class="lm-list" data-testid="linked-list">
      {#each links as l (l.id)}
        <li data-testid="linked-{l.id}">
          <label class="pk-check"><input type="checkbox" checked={l.visible} onchange={(e) => setLinkVisible(l.id, e.currentTarget.checked)} /> {l.name}</label>
          <span class="pk-label">{t(`fed.disc.${l.discipline}`)}</span>
          <span class="lm-actions">
            <label class="pk-btn lm-file">{t('fed.ui.update')}<input type="file" accept=".ifc" disabled={busy} onchange={(e) => update(l, e.currentTarget.files?.[0])} data-testid="linked-update-{l.id}" /></label>
            <button class="pk-btn pk-btn-icon" onclick={() => removeLink(l.id)} aria-label={t('linked.remove')} title={t('linked.remove')}>×</button>
          </span>
          <p class="pk-hint lm-sum" data-testid="linked-summary-{l.id}">{summary(l)}</p>
          {#if l.reference && available[l.id] === false}
            <p class="pk-warn" data-testid="linked-missing-{l.id}">{t('linked.missing')}
              <label class="lm-relink">{t('linked.giveFile')}<input type="file" accept=".ifc" disabled={busy} onchange={(e) => relink(l, e.currentTarget.files?.[0])} /></label>
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .lm-file { position: relative; overflow: hidden; }
  .lm-file input, .lm-relink input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .lm-relink { position: relative; text-decoration: underline; cursor: pointer; margin-left: 4px; }
  .lm-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .lm-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 2px 6px; align-items: center; }
  .lm-actions { display: inline-flex; gap: 4px; }
  .lm-sum, .lm-list .pk-warn { grid-column: 1 / -1; }
</style>
