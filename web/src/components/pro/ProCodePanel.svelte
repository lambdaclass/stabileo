<script lang="ts">
  /**
   * The model as code: read it, edit it, apply it, share it.
   *
   * Editing the text is as valid as editing the model on screen. Applying it replaces what the
   * code covers in one undo step (`model/code/apply.ts`); a text with any error is not applied at
   * all, and every error is listed with its line. What the code does not carry — the design's
   * products — is listed at the foot, so a reader knows what a shared code leaves behind.
   */
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { modelToCode, type CodeError } from '../../lib/model/code/format';
  import { applyCode } from '../../lib/model/code/apply';
  import { DERIVED_FIELDS } from '../../lib/model/code/coverage';

  let text = $state(modelToCode(modelStore.snapshot()));
  let generatedFrom = $state(modelStore.modelVersion);
  let lastGenerated = $state(text);
  let errors = $state<CodeError[]>([]);
  let message = $state<string | null>(null);
  let area: HTMLTextAreaElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();

  const dirty = $derived(text !== lastGenerated);
  /** The model moved on since the text was written from it. */
  const behind = $derived(modelStore.modelVersion !== generatedFrom);
  const lineCount = $derived(text.split('\n').length);

  function regenerate() {
    text = modelToCode(modelStore.snapshot());
    lastGenerated = text;
    generatedFrom = modelStore.modelVersion;
    errors = [];
    message = null;
  }

  function apply() {
    message = null;
    const r = applyCode(text);
    if (!r.applied) { errors = r.errors; return; }
    errors = [];
    lastGenerated = text;
    generatedFrom = modelStore.modelVersion;
    message = r.keptReinforcement > 0 ? tp('code.appliedKept', { n: r.keptReinforcement }) : t('code.applied');
  }

  /** Put the caret on a line, so an error can be fixed where it is. */
  function goTo(line: number) {
    if (!area) return;
    const lines = text.split('\n');
    const start = lines.slice(0, Math.max(0, line - 1)).reduce((s, l) => s + l.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    const lh = area.scrollHeight / Math.max(1, lines.length);
    area.scrollTop = Math.max(0, (line - 4) * lh);
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    message = t('code.copied');
  }

  function download() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(modelStore.model.name || 'model').replace(/[^\w.-]+/g, '_')}.stabileo.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function openFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    text = await f.text();
    errors = [];
    message = tp('code.loaded', { name: f.name });
  }
</script>

<div class="cp" data-testid="code-panel">
  <div class="cp-bar">
    <button class="cp-primary" onclick={apply} disabled={!dirty} data-testid="cp-apply">{t('code.apply')}</button>
    <button onclick={regenerate} data-testid="cp-regenerate">{t('code.fromModel')}</button>
    <button onclick={copy}>{t('code.copy')}</button>
    <button onclick={download}>{t('code.download')}</button>
    <button onclick={() => fileInput?.click()}>{t('code.open')}</button>
    <input type="file" accept=".txt,.stabileo" bind:this={fileInput} onchange={openFile} hidden />
  </div>
  <p class="cp-status">
    {tp('code.size', { lines: lineCount, chars: text.length })}
    {#if dirty} · <span class="cp-warn">{t('code.unapplied')}</span>{/if}
    {#if behind && !dirty} · <span class="cp-warn">{t('code.behind')}</span>{/if}
  </p>
  <textarea bind:this={area} bind:value={text} spellcheck="false" wrap="off" data-testid="cp-text"></textarea>

  {#if errors.length > 0}
    <div class="cp-errors" role="alert" data-testid="cp-errors">
      <p>{tp('code.errors', { n: errors.length })}</p>
      <ul>
        {#each errors.slice(0, 50) as e, i (i)}
          <li><button class="cp-line" onclick={() => goTo(e.line)}>{tp('code.line', { n: e.line })}</button> {e.message}</li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if message}<p class="cp-done" data-testid="cp-done">{message}</p>{/if}

  <details class="cp-covers">
    <summary>{t('code.notCarried')}</summary>
    <ul>{#each Object.keys(DERIVED_FIELDS) as f (f)}<li><code>{f}</code> — {t(`code.derived.${f}`)}</li>{/each}</ul>
    <p>{t('code.dedNote')}</p>
  </details>
</div>

<style>
  .cp { display: flex; flex-direction: column; gap: 6px; font-size: 0.72rem; height: 100%; }
  .cp-bar { display: flex; gap: 4px; flex-wrap: wrap; }
  button {
    padding: 3px 8px; font-size: 0.66rem; color: var(--st-text); background: var(--st-surface-3);
    border: 1px solid var(--st-hair-strong); border-radius: 3px; cursor: pointer;
  }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .cp-primary { border-color: var(--st-accent); }
  .cp-status { margin: 0; color: var(--st-text-3); font-size: 0.64rem; }
  .cp-warn { color: var(--st-warn); }
  textarea {
    flex: 1; min-height: 320px; width: 100%; box-sizing: border-box; resize: vertical;
    font-family: ui-monospace, monospace; font-size: 0.66rem; line-height: 1.45; tab-size: 2;
    background: var(--st-surface-2); color: var(--st-text-2); border: 1px solid var(--st-surface-3); border-radius: 3px; padding: 6px;
  }
  .cp-errors { color: var(--st-danger); font-size: 0.66rem; }
  .cp-errors p { margin: 0 0 2px; }
  .cp-errors ul { margin: 0; padding-left: 1rem; }
  .cp-line { padding: 0 4px; font-size: 0.62rem; color: var(--st-interactive); background: transparent; border: none; text-decoration: underline; }
  .cp-done { margin: 0; color: var(--st-ok); }
  .cp-covers { color: var(--st-text-3); font-size: 0.64rem; }
  .cp-covers ul { margin: 4px 0; padding-left: 1rem; }
  .cp-covers p { margin: 0; font-style: italic; }
</style>
