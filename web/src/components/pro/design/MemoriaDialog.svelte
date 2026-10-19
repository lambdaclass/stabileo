<!--
  The memoria de cálculo as a catalog: the chapters and their parts to include, the language it is
  written in, a preview of the document as it will print, and the two ways out (the browser's
  print dialog, which also saves a PDF, and the HTML file). The data is read once when the dialog
  opens (`memoriaInput`); choosing chapters or a language only prints it again.
-->
<script lang="ts">
  import OutdatedNotice from './OutdatedNotice.svelte';
  import RecheckNotice from './RecheckNotice.svelte';
  import { t, tp, i18n, OFFERED_LOCALES } from '../../../lib/i18n';
  import { teAt } from '../../../lib/i18n/engine-text';
  import { memoriaInput } from '../../../lib/store/memoria-inputs';
  import { renderMemoriaHtml, type RenderContext } from '../../../lib/report/memoria/render';
  import { ALL_CHAPTERS, CHAPTERS, type ChapterId, type ChapterKey } from '../../../lib/report/memoria/types';

  let { onclose }: { onclose: () => void } = $props();

  let lang = $state<string>(i18n.locale);
  let chosen = $state<Set<ChapterId>>(new Set(ALL_CHAPTERS));
  const ctxFor = (l: string): RenderContext => ({
    tr: (key, params) => teAt({ key, ...(params ? { params } : {}) }, l),
    msg: (m) => teAt(m, l),
    fmt: (v, d) => new Intl.NumberFormat(l, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v),
  });
  // The data in the chosen language: names of kinds and notices are written into it.
  const input = $derived(memoriaInput(ctxFor(lang).tr, lang));
  const html = $derived(renderMemoriaHtml(input, chosen, ctxFor(lang), lang));
  const nRows = $derived(input.elements.reduce((s, e) => s + e.rows.length, 0));

  function toggle(id: ChapterId) {
    const next = new Set(chosen);
    const [key, part] = id.split('.') as [ChapterKey, string?];
    const on = !next.has(id);
    if (part) {
      if (on) { next.add(id); next.add(key); } else next.delete(id);
    } else {
      // A chapter carries its parts with it.
      for (const p of [key, ...CHAPTERS[key].map((x) => `${key}.${x}` as ChapterId)]) { if (on) next.add(p); else next.delete(p); }
    }
    chosen = next;
  }

  const partLabel = (key: ChapterKey, p: string) => (key === 'members' ? t(`memo.fam.${p}`) : t(`memo.part.${key}.${p}`));

  function print() {
    const w = window.open('', '_blank');
    if (!w) return download();
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  function download() {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = url; a.download = `memoria-${input.project.date}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleKeydown(e: KeyboardEvent) { if (e.key === 'Escape') onclose(); }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="memo-overlay" onkeydown={handleKeydown} onclick={onclose} role="dialog" aria-modal="true" aria-labelledby="memo-title" tabindex="-1">
  <div class="memo-dialog" data-testid="memoria-dialog" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2 id="memo-title">{t('memo.ui.title')}</h2>
      <span class="muted" data-testid="memoria-count">{tp('memo.ui.elements', { n: input.elements.length, r: nRows })}</span>
      <OutdatedNotice what="memoria" testid="memoria-outdated" />
      <RecheckNotice />
      <button class="close" data-testid="memoria-close" onclick={onclose} aria-label={t('memo.ui.close')}>&times;</button>
    </header>
    <div class="memo-body">
      <aside>
        <label class="lang">{t('memo.ui.language')}
          <select data-testid="memoria-language" bind:value={lang}>
            {#each OFFERED_LOCALES as l (l)}<option value={l}>{l}</option>{/each}
          </select>
        </label>
        <h3>{t('memo.ui.chapters')}</h3>
        <ul class="tree" data-testid="memoria-chapters">
          {#each Object.keys(CHAPTERS) as key (key)}
            {@const k = key as ChapterKey}
            <li>
              <label><input type="checkbox" data-testid={`memoria-ch-${k}`} checked={chosen.has(k)} onchange={() => toggle(k)} /> {t(`memo.ch.${k}`)}</label>
              {#if CHAPTERS[k].length}
                <ul>
                  {#each CHAPTERS[k] as p (p)}
                    <li><label><input type="checkbox" data-testid={`memoria-ch-${k}.${p}`} checked={chosen.has(`${k}.${p}` as ChapterId)} onchange={() => toggle(`${k}.${p}` as ChapterId)} /> {partLabel(k, p)}</label></li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
        <div class="actions">
          <button data-testid="memoria-print" onclick={print}>{t('memo.ui.print')}</button>
          <button data-testid="memoria-html" onclick={download}>{t('memo.ui.html')}</button>
        </div>
      </aside>
      <section class="preview">
        <h3>{t('memo.ui.preview')}</h3>
        <iframe title={t('memo.ui.preview')} data-testid="memoria-preview" srcdoc={html}></iframe>
      </section>
    </div>
  </div>
</div>

<style>
  .memo-overlay {
    position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--st-surface) 75%, transparent);
  }
  .memo-dialog {
    background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-surface-3); border-radius: 10px;
    width: min(1100px, 94vw); height: min(820px, 90vh); display: flex; flex-direction: column;
  }
  header { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--st-surface-3); }
  header h2 { margin: 0; font-size: 1rem; }
  .muted { color: var(--st-text-2); font-size: 0.75rem; }
  .close { margin-left: auto; background: none; border: none; color: var(--st-text-3); font-size: 1.4rem; cursor: pointer; }
  .close:hover { color: var(--st-text); }
  .memo-body { flex: 1; display: grid; grid-template-columns: 15rem 1fr; min-height: 0; }
  aside { border-right: 1px solid var(--st-surface-3); padding: 0.75rem; overflow: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  h3 { margin: 0; font-size: 0.72rem; color: var(--st-text-2); text-transform: uppercase; }
  .lang { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.7rem; color: var(--st-text-2); }
  select { font-size: 0.75rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; padding: 0.15rem 0.3rem; }
  .tree, .tree ul { list-style: none; margin: 0; padding: 0; }
  .tree ul { padding-left: 1.1rem; }
  .tree label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; padding: 0.1rem 0; }
  .actions { margin-top: auto; display: flex; flex-direction: column; gap: 0.35rem; }
  .actions button {
    font-size: 0.75rem; padding: 0.35rem 0.6rem; background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer;
  }
  .actions button:hover { background: var(--st-hair-strong); }
  .preview { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.75rem; min-height: 0; }
  iframe { flex: 1; width: 100%; border: 1px solid var(--st-surface-3); border-radius: 4px; background: var(--st-surface); }
</style>
