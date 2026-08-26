<script lang="ts">
  /**
   * The rótulo, as a form: what the author writes, and what the project states back.
   *
   * ── Why the two halves look different ──────────────────────────────
   *
   * Because they have different owners, and `title-block-config.ts` spends its header on why
   * that line is fixed. The identification is the author's and is editable. The norms are the
   * regulations the verification actually ran against, read from the bindings, and they are
   * printed here as TEXT — not as fields, not as a list with a delete button beside each one.
   * A control that could remove one would let a sheet claim a provenance the run never had,
   * and the sheet is the one surface whose whole purpose is stating that provenance.
   *
   * What an author CAN do is declare a code they also worked to. It is added to the same list,
   * marked, and qualified on the sheet itself.
   *
   * ── Its own component ──────────────────────────────────────────────
   *
   * `DetailingWorkflow.svelte` was at 561 lines against the 600 the gate enforces, and this is
   * four inputs, a list, and their styles. Same decision, same reason, as `RcBarList`.
   */
  import { t, tp } from '../../../lib/i18n';
  import { detailingSheet } from '../../../lib/store/detailing-sheet.svelte';
  import {
    RC_MAX_DECLARED_CODES, RC_TITLE_BLOCK_LIMITS, rcTitleBlockNamed,
  } from '../../../lib/engine/detailing/title-block-config';

  /** The code the author is typing. Local because it is a draft, not a stored value. */
  let draft = $state('');

  const config = $derived(detailingSheet.titleBlockConfig);
  const codes = $derived(detailingSheet.titleBlockCodes);
  const declared = $derived(config.declaredCodes ?? []);
  const full = $derived(declared.length >= RC_MAX_DECLARED_CODES);

  function set(field: 'project' | 'subtitle' | 'office', value: string) {
    detailingSheet.setTitleBlock({ [field]: value });
  }

  function addCode() {
    const v = draft.trim();
    if (!v || full) return;
    detailingSheet.setTitleBlock({ declaredCodes: [...declared, v] });
    draft = '';
  }

  function removeCode(code: string) {
    detailingSheet.setTitleBlock({ declaredCodes: declared.filter((c) => c !== code) });
  }
</script>

<fieldset class="rotulo" data-testid="rotulo">
  <legend>{t('detailing.titleBlock.legend')}</legend>

  <!--
    Three fields, and `maxlength` on each rather than a validator that complains afterwards.

    The limits are what makes the field a rótulo: `sheetToSvg` prints these as fixed lines under
    the drawing and `sheetToDxf` emits each as one TEXT entity, and neither wraps. Refusing at
    the keystroke is the only version of this where the author finds out on their own screen.
  -->
  <label>
    <span>{t('detailing.titleBlock.project')}</span>
    <input
      type="text"
      data-testid="rotulo-project"
      maxlength={RC_TITLE_BLOCK_LIMITS.project}
      placeholder={t('detailing.titleBlock.projectHint')}
      value={config.project ?? ''}
      onchange={(e) => set('project', (e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  <label>
    <span>{t('detailing.titleBlock.subtitle')}</span>
    <input
      type="text"
      data-testid="rotulo-subtitle"
      maxlength={RC_TITLE_BLOCK_LIMITS.subtitle}
      value={config.subtitle ?? ''}
      onchange={(e) => set('subtitle', (e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  <label>
    <span>{t('detailing.titleBlock.office')}</span>
    <input
      type="text"
      data-testid="rotulo-office"
      maxlength={RC_TITLE_BLOCK_LIMITS.office}
      value={config.office ?? ''}
      onchange={(e) => set('office', (e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  <!--
    A project nobody has named says so, here, once.

    It is not an error and it is not blocked: working on an unnamed project is ordinary. What
    the reader has to be able to tell is that the sheets will carry no name — because the
    alternative the app used to ship was heading every export with the word "Project", and a
    drawing set whose every sheet says that identifies nothing.
  -->
  {#if !rcTitleBlockNamed(config)}
    <p class="unnamed" data-testid="rotulo-unnamed">{t('detailing.titleBlock.unnamed')}</p>
  {/if}

  <!--
    The norms. Read-only for the verified ones — see the header.
  -->
  <p class="codes-head">{t('detailing.titleBlock.codes')}</p>
  {#if codes.length === 0}
    <p class="unnamed" data-testid="rotulo-nocodes">{t('detailing.titleBlock.noCodes')}</p>
  {:else}
    <ul class="codes" data-testid="rotulo-codes">
      {#each codes as c (c.text)}
        <li data-testid={`rotulo-code-${c.source}`} data-source={c.source}>
          <span class="code-text">{c.text}</span>
          {#if c.qualifierKey}
            <span class="qualifier">{t(c.qualifierKey)}</span>
            <button
              type="button"
              class="drop"
              data-testid="rotulo-code-remove"
              aria-label={tp('detailing.titleBlock.removeCode', { code: c.text })}
              onclick={() => removeCode(c.text)}
            >×</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <!--
    Adding one. Bounded at four, and the control says so instead of silently ignoring the fifth
    — `rcNormaliseTitleBlock` would drop it, and a form that accepts a value and stores nothing
    is the worst of the three possible behaviours.
  -->
  <div class="add">
    <label class="add-label">
      <span class="sr-only">{t('detailing.titleBlock.addCode')}</span>
      <input
        type="text"
        data-testid="rotulo-code-input"
        maxlength={RC_TITLE_BLOCK_LIMITS.code}
        placeholder={t('detailing.titleBlock.addCode')}
        disabled={full}
        bind:value={draft}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCode(); } }}
      />
    </label>
    <button type="button" data-testid="rotulo-code-add" disabled={full || draft.trim() === ''}
            onclick={addCode}>{t('detailing.titleBlock.add')}</button>
  </div>
  {#if full}
    <p class="unnamed" data-testid="rotulo-codes-full">
      {tp('detailing.titleBlock.codesFull', { n: RC_MAX_DECLARED_CODES })}
    </p>
  {/if}
</fieldset>

<style>
  /* The same fieldset the sheet controls use — one control group, one shape. */
  fieldset.rotulo {
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    padding: 0.3rem 0.5rem 0.45rem;
    margin: 0.5rem 0 0;
  }
  legend { font-size: 0.75rem; padding: 0 0.3rem; color: var(--st-text-2); }

  label {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0.2rem 0;
    font-size: 0.72rem;
  }
  label > span { min-width: 5.5rem; color: var(--st-text-2); }
  input[type='text'] {
    flex: 1;
    min-width: 0;
    padding: 0.12rem 0.35rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.72rem;
  }
  input[type='text']:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  input[type='text']:disabled { opacity: 0.55; cursor: not-allowed; }

  .unnamed { margin: 0.15rem 0 0; font-size: 0.68rem; color: var(--st-text-3); line-height: 1.35; }
  .codes-head {
    margin: 0.45rem 0 0.15rem;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-3);
  }

  ul.codes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  ul.codes > li {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem;
    font-size: 0.7rem;
  }
  .code-text { color: var(--st-text); }
  /*
    A declared code is dimmer AND carries the word. Neither alone: the tint is not readable as
    a claim, and the word is what a reader acts on — the same rule the bar states pass.
  */
  li[data-source='declared'] .code-text { color: var(--st-text-2); }
  .qualifier { font-size: 0.64rem; color: var(--st-warn); }
  .drop {
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.66rem;
    line-height: 1;
    padding: 0.05rem 0.28rem;
    cursor: pointer;
  }
  .drop:hover { background: var(--st-surface-3); color: var(--st-text); }
  .drop:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  .add { display: flex; gap: 0.3rem; margin-top: 0.3rem; }
  .add-label { flex: 1; margin: 0; }
  .add button {
    padding: 0.12rem 0.45rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }
  .add button:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .add button:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .add button:disabled { opacity: 0.55; cursor: not-allowed; }

  /* Visible to a screen reader, not to the eye: the placeholder is not an accessible name. */
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
</style>
