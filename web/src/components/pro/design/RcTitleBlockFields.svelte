<script lang="ts">
  /**
   * The rótulo, as a form: what the author writes, and what the project states back.
   *
   * ── Why the two halves look different ──────────────────────────────
   *
   * Because they have different owners, and `title-block-config.ts` spends its header on why
   * that line is fixed. The identification is the author's and is editable. The norms are the
   * regulations selected in the Reglamentos stage, and they are printed here as TEXT — not as
   * fields, not as a list with a delete button beside each one, not as a list an author can add
   * to. A control that could change one would let a sheet claim a provenance the run never had,
   * and the sheet is the one surface whose whole purpose is stating that provenance.
   *
   * The list follows Reglamentos. Rebind a role there and the rótulo says so on the next
   * render, because it is read from the bindings rather than copied into the project.
   *
   * A per-code visibility switch is a FUTURE extension and deliberately absent: a control that
   * could hide a governing code is the same failure as one that could rename it.
   *
   * ── Its own component ──────────────────────────────────────────────
   *
   * `DetailingWorkflow.svelte` was at 561 lines against the 600 the gate enforces, and this is
   * four inputs, a list, and their styles. Same decision, same reason, as `RcBarList`.
   */
  import { t, tp } from '../../../lib/i18n';
  import { detailingSheet } from '../../../lib/store/detailing-sheet.svelte';
  import {
    RC_TITLE_BLOCK_LIMITS, rcTitleBlockNamed,
  } from '../../../lib/engine/detailing/title-block-config';

  const config = $derived(detailingSheet.titleBlockConfig);
  const codes = $derived(detailingSheet.titleBlockCodes);

  function set(field: 'project' | 'subtitle' | 'office', value: string) {
    detailingSheet.setTitleBlock({ [field]: value });
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
    The norms, as they stand in Reglamentos. Read-only — see the header.
  -->
  <p class="codes-head">{t('detailing.titleBlock.codes')}</p>
  {#if codes.length === 0}
    <p class="unnamed" data-testid="rotulo-nocodes">{t('detailing.titleBlock.noCodes')}</p>
  {:else}
    <ul class="codes" data-testid="rotulo-codes">
      {#each codes as c (c.text)}
        <li data-testid="rotulo-code"><span class="code-text">{c.text}</span></li>
      {/each}
    </ul>
    <!--
      Where they come from, said once.

      Without it the list reads as a field somebody forgot to make editable. It is not: it is a
      projection of the Reglamentos stage, and the way to change it is to change that.
    -->
    <p class="unnamed" data-testid="rotulo-codes-source">
      {t('detailing.titleBlock.codesFromRegulations')}
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

  /* A sentence, so `--st-text-2`: `--st-text-3` is for glyphs and rules and measures under
     AA as copy — see `tokens.css` and `RcExportLog`. */
  .unnamed { margin: 0.15rem 0 0; font-size: 0.68rem; color: var(--st-text-2); line-height: 1.35; }
  /* The comment two lines up applies to this heading as well, and it was the one exception
     left: measured at 3,74 against 4,5. Uppercase and letter-spacing carry the hierarchy. */
  .codes-head {
    margin: 0.45rem 0 0.15rem;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-2);
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
    The `.qualifier`, `.drop` and `.add` rules left with the controls they styled. Svelte scopes
    styles per component, so a copy kept here would reach nothing — it would be dead text the
    next reader has to prove is dead, which is what `DetailingWorkflow`'s bar-list rules were.
  */
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
