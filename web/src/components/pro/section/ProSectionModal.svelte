<script lang="ts">
  /**
   * The PRO section selector: two divisions, one modal, one contract.
   *
   * ── Why this is not `SectionChanger` remounted ─────────────────────
   *
   * Basic's picker has three divisions — catalogue, shape builder, and an **amorphous**
   * section that is an area and an inertia with no geometry at all. PRO has two, and the
   * missing one is deliberate: a section with no structure cannot be classified, cannot be
   * drawn, cannot be composed and cannot be checked against a clause, so offering it here
   * would be offering a section the rest of PRO has nothing to say about. A test asserts the
   * third division never appears.
   *
   * ── Why it is not `ProfileSelectorPanel` either ────────────────────
   *
   * It CONTAINS it. That panel already does search, family/body/design-code/depth filters,
   * grouping, pinned comparison and full keyboard navigation, and its own header says the
   * `ProfileSource` seam exists "so the general PRO section picker can hand it a different
   * catalogue". This is that picker. Rewriting the browsing would have produced a second
   * catalogue surface that could disagree with the generator's.
   *
   * What this shell adds is what a popover anchored to a row could not have: a centred dialog,
   * a focus trap, focus restored to whatever opened it, a large preview, the composition and
   * rotation controls, and the data sheet.
   *
   * ── Composition and rotation are the same fact everywhere ──────────
   *
   * The result is a `ProfileSpec` — profile, arrangement, gap, rotation — which is exactly
   * what the generator's per-role picker produces and exactly what `Section.composition` plus
   * `Section.rotation` store. One vocabulary, so a back-to-back angle chosen here and one
   * chosen inside a generator are the same object rather than two representations that agree
   * until someone edits one.
   */
  import { t } from '../../../lib/i18n';
  import ProfileSelectorPanel from '../generators/ProfileSelectorPanel.svelte';
  import SectionFigure from '../generators/SectionFigure.svelte';
  import SectionDataSheet from './SectionDataSheet.svelte';
  import BuiltSectionPanel from './BuiltSectionPanel.svelte';
  import BattenPanel from './BattenPanel.svelte';
  import { steelProfileSource, type ProfileSource } from '../../../lib/profiles/catalogue';
  import { sectionDataSheet } from '../../../lib/section/data-sheet';
  import { battenPlan } from '../../../lib/section/battens';
  import type { SectionChoice } from '../../../lib/section/section-choice';
  import {
    BUILT_UP_ARRANGEMENTS, isCompound,
    type ProfileSpec, type BuiltUpArrangement,
  } from '../../../lib/section/profile-spec';
  import { availableArrangements, resolveProfile, canCompose } from '../../../lib/engine/generators/profile-resolve';
  import { isClosedArrangement } from '../../../lib/engine/generators/built-up-section';

  interface Props {
    open: boolean;
    /** The spec being edited. The modal never mutates it; it emits a new one. */
    spec: ProfileSpec;
    /**
     * The chosen section.
     *
     * A `SectionChoice`, not a `ProfileSpec`, because the two divisions produce genuinely
     * different things: a catalogue pick has a designation and no parameters, a built section
     * has parameters and no designation. Collapsing them would put the make-up of a section
     * back into a string, which is the defect `Section.composition` was added to close.
     */
    onApply: (choice: SectionChoice) => void;
    onClose: () => void;
    source?: ProfileSource;
    /** Accessible name, e.g. the member role or the section being replaced. */
    label?: string;
  }
  const { open, spec, onApply, onClose, source = steelProfileSource, label = '' }: Props = $props();

  /** Exactly two. The type is the guarantee, not a convention. */
  type Division = 'standard' | 'build';
  let division = $state<Division>('standard');

  /** Working copy. Applying is an explicit act, so Escape can leave the model untouched. */
  let draft = $state<ProfileSpec>({ ...spec });

  let dialogEl: HTMLDivElement | undefined = $state();
  /**
   * Whatever had focus when the modal opened.
   *
   * Restored on close, because a dialog that drops focus to `<body>` leaves a keyboard user
   * at the top of the document with no way back to the control they were on. Basic's pickers
   * do exactly that today; this is the half of "coherent with Basic" that had to be built
   * rather than inherited.
   */
  let returnFocus: HTMLElement | null = null;

  $effect(() => {
    if (!open) return;
    returnFocus = document.activeElement as HTMLElement | null;
    draft = { ...spec };
    // One frame, so the dialog is in the DOM before focus moves into it.
    queueMicrotask(() => dialogEl?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    return () => { returnFocus?.focus?.(); };
  });

  const resolved = $derived(resolveProfile(draft.profileName));
  const arrangements = $derived(
    resolved ? availableArrangements(resolved) : (['single'] as readonly BuiltUpArrangement[]),
  );
  /**
   * Arrangements the catalogue refuses for this profile, counted rather than silently dropped.
   *
   * A compound arrangement needs the single profile's centroid, and a properties-only family
   * has none — so the list shortens and the modal says why instead of the option quietly
   * vanishing.
   */
  const refused = $derived(resolved ? BUILT_UP_ARRANGEMENTS.length - arrangements.length : 0);

  const entry = $derived(source.byId(draft.profileName) ?? null);
  const sheet = $derived(entry ? sectionDataSheet({ entry }) : null);
  let sheetOpen = $state(false);

  /**
   * What holds the assembly together, per §E.6.
   *
   * Only for a compound arrangement, because a single profile is not a `barra armada` and the
   * clause has nothing to say about it. Note what is NOT passed: a member length. A section is
   * a cross-section and sits on members of any length, so the batten spacing comes back null
   * with the rule named rather than as `L/3` against an assumed length.
   */
  const battens = $derived(battenPlan({ arrangement: draft.arrangement, gapMm: draft.gapMm }));
  let battensOpen = $state(false);

  /**
   * The build division's draft, or null while its form cannot produce a section.
   *
   * Null is what disables Apply. Writing a NaN area onto the model because a thickness box was
   * momentarily empty is the failure this prevents, and it is not hypothetical — a half-typed
   * number input reads as `null`, not as the last good value.
   */
  let builtDraft = $state<SectionChoice | null>(null);

  /**
   * Whether Apply can do anything.
   *
   * For the catalogue division this asks whether the profile RESOLVES, not merely whether a
   * name is present. `toSectionFields` returns null for a name the catalogue does not know —
   * a section with no area would be reported by the canonical resolver as having no known
   * geometry — and a button that silently does nothing is worse than one that is disabled.
   */
  const canApply = $derived(division === 'standard' ? resolved !== null : builtDraft !== null);

  function pick(id: string) {
    const r = resolveProfile(id);
    // A profile change can invalidate the arrangement — an I-beam to a properties-only channel
    // takes the compound options away. Fall back rather than hold a spec nothing can build.
    const keep = r && canCompose(r, draft.arrangement) === null;
    draft = { ...draft, profileName: id, arrangement: keep ? draft.arrangement : 'single' };
  }

  function apply() {
    const choice: SectionChoice | null =
      division === 'standard' ? { kind: 'standard', spec: draft } : builtDraft;
    if (!choice) return;
    onApply(choice);
    onClose();
  }

  /**
   * The focus trap.
   *
   * Tab cycles inside the dialog, Escape closes. Without the wrap, tabbing off the last
   * control lands on the browser chrome and the modal is still covering the page — which is
   * the failure mode a11y checkers describe and users experience as the page freezing.
   */
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !dialogEl) return;
    const focusable = [...dialogEl.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="overlay" role="presentation" onkeydown={keydown}>
    <!-- The backdrop is a button so it has a name and is reachable, rather than a div that
         only a mouse can use. -->
    <button class="backdrop" type="button" aria-label={t('section.modal.close')} onclick={onClose}></button>
    <div
      class="modal"
      bind:this={dialogEl}
      role="dialog"
      aria-modal="true"
      aria-label={label || t('section.modal.title')}
      data-testid="pro-section-modal"
    >
      <header>
        <h2>{t('section.modal.title')}</h2>
        <button type="button" class="close" onclick={onClose} aria-label={t('section.modal.close')}>✕</button>
      </header>

      <!-- Exactly two divisions. -->
      <div class="divisions" role="tablist" aria-label={t('section.modal.divisions')}>
        <button
          type="button" role="tab" data-autofocus
          aria-selected={division === 'standard'}
          class:active={division === 'standard'}
          data-testid="section-division-standard"
          onclick={() => (division = 'standard')}
        >{t('section.modal.standard')}</button>
        <button
          type="button" role="tab"
          aria-selected={division === 'build'}
          class:active={division === 'build'}
          data-testid="section-division-build"
          onclick={() => (division = 'build')}
        >{t('section.modal.build')}</button>
      </div>

      <div class="body">
        <div class="browse">
          {#if division === 'standard'}
            <ProfileSelectorPanel
              selected={draft.profileName}
              label={t('section.modal.standard')}
              {source}
              onPick={pick}
              onClose={() => {}}
            />
          {:else}
            <BuiltSectionPanel onDraft={(c) => (builtDraft = c)} />
          {/if}
        </div>

        <aside class="side">
          <!-- The large preview the brief asks for: the composition as it will be built,
               not a thumbnail of one part. -->
          <div class="preview" data-testid="section-preview">
            <SectionFigure
              profileName={draft.profileName}
              arrangement={draft.arrangement}
              gapMm={draft.gapMm}
              rotationDeg={draft.rotationDeg}
              colour={'var(--st-value)'}
              sizePx={140}
            />
          </div>

          <!--
            Composition and rotation belong to the catalogue division only.
            An arrangement places COPIES OF A CATALOGUE PROFILE, and a built section has no
            catalogue part to place — `ARRANGEMENTS` works off a resolved profile's extents.
            Offering the control here would be offering something the emitter must refuse.
          -->
          {#if division === 'standard'}
          <div class="controls">
            <label>
              <span>{t('section.modal.arrangement')}</span>
              <select
                bind:value={draft.arrangement}
                data-testid="section-arrangement"
              >
                {#each arrangements as a (a)}
                  <option value={a}>{t(`generator.arrangement.${a}`)}</option>
                {/each}
              </select>
            </label>

            {#if isCompound(draft)}
              <label>
                <span>{t('section.modal.gap')}</span>
                <input
                  type="number" min="0" step="1" data-testid="section-gap"
                  value={draft.gapMm}
                  onchange={(e) => (draft = { ...draft, gapMm: Math.max(0, Number(e.currentTarget.value) || 0) })}
                />
                <span class="unit">mm</span>
              </label>
              {#if isClosedArrangement(draft.arrangement)}
                <p class="note" data-testid="section-closed-note">
                  {t('generator.builtUp.torsion.closedCellNotComputed')}
                </p>
              {/if}
            {/if}

            <label>
              <span>{t('section.modal.rotation')}</span>
              <select
                data-testid="section-rotation"
                value={String(draft.rotationDeg)}
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  draft = { ...draft, rotationDeg: v === 'auto' ? 'auto' : Number(v) };
                }}
              >
                <option value="auto">{t('generator.ui.rotationAuto')}</option>
                <option value="0">0°</option>
                <option value="90">90°</option>
                <option value="180">180°</option>
                <option value="270">270°</option>
              </select>
            </label>

            {#if refused > 0}
              <p class="note" data-testid="section-refused">
                {t('generator.problem.centroidUnknown')
                  .replace('{profile}', draft.profileName)
                  .replace('{family}', resolved?.family ?? '')}
              </p>
            {/if}
          </div>
          {/if}

          {#if division === 'standard' && isCompound(draft)}
            <details bind:open={battensOpen} data-testid="section-battens-toggle">
              <summary>{t('battens.title')}</summary>
              <BattenPanel plan={battens} />
            </details>
          {/if}

          {#if sheet && division === 'standard'}
            <details bind:open={sheetOpen} data-testid="section-sheet-toggle">
              <summary>{t('section.sheet.title')}</summary>
              <SectionDataSheet {sheet} />
            </details>
          {/if}
        </aside>
      </div>

      <footer>
        <span class="current" data-testid="section-current">
          {division === 'standard' ? draft.profileName : (builtDraft?.kind === 'built' ? builtDraft.name : '—')}
        </span>
        <button type="button" class="ghost" onclick={onClose}>{t('section.modal.cancel')}</button>
        <button type="button" class="primary" onclick={apply} disabled={!canApply} data-testid="section-apply">
          {t('section.modal.apply')}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
  }
  .backdrop {
    position: absolute; inset: 0; border: none; padding: 0;
    background: rgba(0, 0, 0, 0.55); cursor: pointer;
  }
  .modal {
    position: relative;
    display: flex; flex-direction: column;
    width: min(980px, 94vw);
    /* 1024×700 is one of the two audited sizes: the modal must not exceed it. */
    max-height: min(640px, 92vh);
    background: var(--st-surface); color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px 6px;
  }
  h2 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  .close { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 1rem; }
  .close:hover { color: var(--st-text); }

  .divisions { display: flex; gap: 4px; padding: 0 14px 8px; }
  .divisions button {
    padding: 5px 12px; font-size: 0.74rem; cursor: pointer;
    background: transparent; color: var(--st-text-2);
    border: 1px solid var(--st-hair); border-radius: 4px;
  }
  .divisions button.active {
    background: var(--st-interactive); border-color: var(--st-interactive); color: var(--st-bg);
  }

  .body { display: flex; gap: 12px; padding: 0 14px; flex: 1; min-height: 0; }
  .browse { flex: 1; min-width: 0; overflow: auto; }
  .side {
    width: 260px; flex-shrink: 0; overflow-y: auto;
    display: flex; flex-direction: column; gap: 10px;
  }
  .preview {
    display: flex; align-items: center; justify-content: center;
    padding: 8px; border: 1px solid var(--st-hair); border-radius: 4px;
    background: var(--st-bg);
  }
  .controls { display: flex; flex-direction: column; gap: 6px; }
  label { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  label > span:first-child { min-width: 5.5rem; }
  select, input {
    background: var(--st-bg); color: var(--st-text);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
    padding: 3px 5px; font-size: 0.72rem;
  }
  input { width: 5rem; text-align: right; }
  .unit { color: var(--st-text-3); }
  .note { margin: 0; font-size: 0.68rem; color: var(--st-warn); line-height: 1.35; }
  details summary { cursor: pointer; font-size: 0.72rem; color: var(--st-text-2); padding: 4px 0; }

  footer {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-top: 1px solid var(--st-hair);
  }
  .current { flex: 1; font-family: var(--st-mono, monospace); font-size: 0.74rem; color: var(--st-text); }
  footer button { padding: 5px 14px; font-size: 0.74rem; border-radius: 4px; cursor: pointer; }
  .ghost { background: transparent; color: var(--st-text-2); border: 1px solid var(--st-hair); }
  .primary { background: var(--st-interactive); color: var(--st-bg); border: 1px solid var(--st-interactive); }

  /* One focus ring for every control in this dialog. */
  button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible {
    outline: 2px solid var(--st-value); outline-offset: 1px;
  }
</style>
