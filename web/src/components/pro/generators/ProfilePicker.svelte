<script lang="ts">
  /**
   * One role's profile: catalogue pick, arrangement, gap and rotation.
   *
   * Basic on purpose. The arrangement list is filtered by what the chosen profile can
   * actually be built into — `availableArrangements` refuses the compound ones for a profile
   * whose centroid is unknown — so the control cannot offer something the emitter would
   * then reject. The gap only appears for a compound arrangement, because it means nothing
   * for a single profile.
   */
  import { t } from '../../../lib/i18n';
  import ProSectionModal from '../section/ProSectionModal.svelte';
  import { availableArrangements, resolveProfile } from '../../../lib/engine/generators/profile-resolve';
  import { ARRANGEMENTS, isClosedArrangement } from '../../../lib/engine/generators/built-up-section';
  import { ROLE_COLOUR } from '../../../lib/engine/generators/preview-projection';
  import type { ProfileSpec } from '../../../lib/engine/generators/emit';
  import type { MemberRole } from '../../../lib/engine/generators/member-roles';
  import SectionFigure from './SectionFigure.svelte';

  interface Props {
    role: MemberRole;
    spec: ProfileSpec;
    onChange: (next: ProfileSpec) => void;
  }
  const { role, spec, onChange }: Props = $props();

  /** The popover is per-row: two roles open at once would be two dialogs over one panel. */
  let open = $state(false);

  const resolved = $derived(resolveProfile(spec.profileName));
  const arrangements = $derived(resolved ? availableArrangements(resolved) : (['single'] as const));
  const refusalCount = $derived(
    resolved ? Object.keys(ARRANGEMENTS).length - arrangements.length : 0,
  );
  const compound = $derived(spec.arrangement !== 'single');

</script>

<div class="row" data-testid={`gen-profile-${role}`}>
  <!-- The figure first, because it is what the row is about. -->
  <SectionFigure
    profileName={spec.profileName}
    arrangement={spec.arrangement}
    gapMm={spec.gapMm}
    rotationDeg={spec.rotationDeg}
    colour={ROLE_COLOUR[role]}
  />
  <label class="lbl" for={`prof-${role}`}>{t(`generator.role.${role}`)}</label>

  <!--
    A trigger, not a list.

    The `<select>` this replaces held 100+ options across 15 groups, and finding `HEA 200` in
    it meant opening it and scrolling. The button shows the current choice — which is the fact
    a user reads ninety per cent of the time — and the panel behind it is where searching and
    filtering happen.
  -->
  <div class="pick">
    <button
      id={`prof-${role}`}
      type="button"
      class="trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      onclick={() => (open = !open)}
      data-testid={`gen-profile-trigger-${role}`}
    >
      <span class="tname">{spec.profileName}</span>
      <!--
        The three facts a reader checks before opening anything: which family it is, what it
        weighs, and whether it is one profile or four. `IPE 200` and `HEA 200` are both "200"
        and are not interchangeable.
      -->
      <span class="tmeta" data-testid={`gen-profile-meta-${role}`}>
        {resolved?.family ?? '—'}
        {#if resolved}· {(resolved.profile.a * 1e4).toFixed(1)} cm²{/if}
        {#if compound}· ×{ARRANGEMENTS[spec.arrangement].count}{/if}
      </span>
    </button>

    <!--
      The same modal the sections tab opens, not a second catalogue.

      This row used to hold `ProfileSelectorPanel` in a popover — good browsing, but the
      arrangement, the gap and the rotation lived out here as three separate controls, so the
      row and the modal disagreed about what a section IS. Handing the whole `ProfileSpec` to
      one dialog means composing a back-to-back angle for a generator role and composing one in
      the sections tab are the same act on the same object.
    -->
    <ProSectionModal
      open={open}
      spec={spec}
      label={t(`generator.role.${role}`)}
      onApply={(choice) => { if (choice.kind === 'standard') onChange(choice.spec); }}
      onClose={() => { open = false; }}
    />
  </div>

  <!--
    Arrangement, gap and rotation are NOT here any more.

    They were three controls in this row and three controls inside the modal, both writing the
    same `ProfileSpec` — so the row could say `doubleBack` while the modal, opened a moment
    later, showed whatever it had last drafted. One source of truth is the modal, and the row
    reports the result: the figure draws the composed section and the meta line says how many
    parts it has.
  -->
</div>

{#if compound && isClosedArrangement(spec.arrangement)}
  <p class="note" data-testid={`gen-closed-${role}`}>
    {t('generator.builtUp.torsion.closedCellNotComputed')}
  </p>
{/if}
{#if refusalCount > 0}
  <p class="note" data-testid={`gen-refused-${role}`}>
    {t('generator.problem.centroidUnknown')
      .replace('{profile}', spec.profileName)
      .replace('{family}', resolved?.family ?? '')}
  </p>
{/if}

<style>
  .pick { position: relative; }
  .trigger {
    display: flex; flex-direction: column; gap: 1px;
    font-size: 0.68rem;
    padding: 3px 7px; min-width: 9rem; text-align: left; cursor: pointer;
    background: var(--st-surface); color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 3px;
  }
  .tname { font-family: var(--st-mono, monospace); }
  .tmeta { font-size: 0.6rem; color: var(--st-text-3); }
  .trigger:focus-visible { outline: 2px solid var(--st-focus, var(--st-accent)); outline-offset: 1px; }

  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
  .lbl { min-width: 6.5rem; font-size: 0.7rem; color: var(--st-text-2); }
  /* Indented past the figure and the label, so a note lines up under the controls. */
  .note { margin: 0 0 6px calc(6.5rem + 40px); font-size: 0.65rem; color: var(--st-warn); line-height: 1.35; }

  /*
    One focus ring for every control in this panel.

    The metallic surface was written before the `--st-*` system reached it: it carried its own
    palette of seventeen hardcoded hex values and, between the two panels, four `:focus-visible`
    rules for several dozen controls. A keyboard user got whatever the UA happened to draw.
  */
  /*
    One rule, one control. The row is a figure, a label and a trigger now — the selects and the
    number input moved into the modal, so listing them here would be styling elements this file
    no longer renders.
  */
  button:focus-visible {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
</style>
