<script lang="ts">
  /**
   * Generadores — the surface that invokes the parametric generators.
   *
   * ── Deliberately basic ────────────────────────────────────────────
   *
   * Numbers, selects, a live count and a Generate button. No canvas preview, no drag
   * handles, no wizard. The engines behind it are complete and tested; this is the thinnest
   * thing that reaches them, and the UI is expected to be reworked.
   *
   * ── The count is not decoration ───────────────────────────────────
   *
   * It comes from the SAME topology object that Generate then emits, so it cannot disagree
   * with what lands in the model.
   *
   * ── Generating inserts, it does not replace ──────────────────────
   *
   * A generated structure goes into the model as a paste does, with its ghost: at the pointer,
   * or at typed coordinates with its anchor node marked (`GeneratorOutput`). It used to replace
   * the model by default.
   *
   * ── A gallery, then a form ────────────────────────────────────────
   *
   * The panel opens on every generator as a card with a drawing of what it makes
   * (`GeneratorGallery`); a card opens its parameters, and Back returns to the list.
   */
  import { t, tp } from '../../../lib/i18n';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { toDisplay, fromDisplay, unitLabel } from '../../../lib/utils/units';
  import { parseSpacings } from '../../../lib/model/edit/affine';
  import { modelStore } from '../../../lib/store/model.svelte';
  import {
    DEFAULT_TRUSS_PARAMS, generateTruss, validateTrussParams, type Topology, type TrussParams,
  } from '../../../lib/engine/generators/truss-topology';
  import {
    DEFAULT_LATTICE_COLUMN_PARAMS,
    generateLatticeColumn, validateLatticeColumnParams, type LatticeColumnParams,
  } from '../../../lib/engine/generators/lattice-column';
  import { weldedIPair } from '../../../lib/engine/generators/variable-pair';
  import TrussFields from './TrussFields.svelte';
  import LatticeColumnFields from './LatticeColumnFields.svelte';
  import {
    BRACING_BAYS, DEFAULT_SHED_PARAMS, generateShed, validateShedParams, type ShedParams,
  } from '../../../lib/engine/generators/shed';
  import {
    emitModel, requiredRoles, validateProfiles, defaultProfileSpec, variableRoles,
    type GeneratorMaterial, type ProfileSpec,
  } from '../../../lib/engine/generators/emit';
  import ProMaterialModal from '../material/ProMaterialModal.svelte';
  import { choiceGradeId } from '../../../lib/material/material-choice';

  /**
   * The metal categories, which is what a steel generator can emit.
   *
   * Concrete and timber are real materials with real presets; they are simply not something
   * `emitModel` can build a truss out of, and offering them would be offering a choice the
   * emitter must then refuse.
   */
  const METAL_CATEGORIES = ['acero', 'conformado', 'inox', 'aluminio'] as const;
  import { pairing, structuralGradeSource } from '../../../lib/grades/catalogue';
  import { resolveProfile } from '../../../lib/engine/generators/profile-resolve';
  import type { MemberRole } from '../../../lib/engine/generators/member-roles';
  import ProfilePicker from './ProfilePicker.svelte';
  import TopologyPreview from './TopologyPreview.svelte';
  import GeneratorOutput from './GeneratorOutput.svelte';
  import ProTemplatesSection from './ProTemplatesSection.svelte';
  import GeneratorGallery from './GeneratorGallery.svelte';
  import GenRow from './GenRow.svelte';
  import GenSection from './GenSection.svelte';
  import { genHelp, clearGenHelp, foldAllSections } from './gen-help.svelte';
  import type { GeneratorEntry } from '../../../lib/pro/generator-catalog';
  import {
    DEFAULT_STRUCTURE_PARAMS, STRUCTURE_FIELDS, STRUCTURE_KINDS, generateStructure, validateStructureParams,
    type StructureKind, type StructureParams,
  } from '../../../lib/engine/generators/structures';
  import { defaultOutputState, generatedData, generatedGroups, withSupportMode, type SupportMode } from '../../../lib/store/generated-structures';
  const outputState = $state(defaultOutputState());

  /** The structure fields that are a length; the others (an angle, a count) keep their own unit. */
  const LENGTH_FIELDS = new Set(['depth', 'span', 'rise', 'toothSpan', 'height', 'radius', 'baseRadius']);

  /*
   * A list of lengths ("6; 7,5; 6", "3x4") stays text, and the generator reads it in meters. It is
   * typed in the display units: in meters the text goes through as typed; in other units each
   * value is converted, and a text that does not read as a list is kept for the validator to name.
   */
  const lengthIsSI = $derived(toDisplay(1, 'length', uiStore.unitSystem) === 1);
  function listShown(si: string): string {
    if (lengthIsSI) return si;
    const v = parseSpacings(si);
    return v ? v.map((x) => String(+toDisplay(x, 'length', uiStore.unitSystem).toPrecision(6))).join('; ') : si;
  }
  function listRead(shown: string): string {
    if (lengthIsSI) return shown;
    const v = parseSpacings(shown);
    return v ? v.map((x) => String(+fromDisplay(x, 'length', uiStore.unitSystem).toPrecision(9))).join('; ') : shown;
  }
  /** The list being typed: shown as typed, not rewritten from the converted value under the cursor. */
  let listEditing = $state<{ id: string; text: string } | null>(null);

  type Kind = 'truss' | 'column' | 'shed' | 'structure';
  let structureKind = $state<StructureKind>('spaceFrame');
  let structureParams = $state<Record<StructureKind, StructureParams>>(
    Object.fromEntries(STRUCTURE_KINDS.map((k) => [k, { ...DEFAULT_STRUCTURE_PARAMS[k] }])) as Record<StructureKind, StructureParams>,
  );
  /** A generated group of the model being edited: Generate then regenerates it in place. */
  let editingGroupId = $state<number | null>(null);
  let kind = $state<Kind>('truss');
  /** The list of generators, or the parameters of the one picked. */
  let view = $state<'gallery' | 'form'>('gallery');
  /** The scroller: a form opens at its top, not where the gallery was left scrolled. */
  let scrollEl = $state<HTMLDivElement | null>(null);
  function pick(e: GeneratorEntry) {
    clearGenHelp();
    foldAllSections();
    if (scrollEl) scrollEl.scrollTop = 0;
    kind = e.kind;
    if (e.structureKind) structureKind = e.structureKind;
    editingGroupId = null;
    view = 'form';
  }
  const KIND_LABEL: Record<Exclude<Kind, 'structure'>, string> = {
    truss: 'generator.ui.kindTruss', column: 'generator.ui.kindColumn', shed: 'generator.ui.kindShed',
  };
  const formTitle = $derived(kind === 'structure' ? t(`generator.structure.${structureKind}`) : t(KIND_LABEL[kind]));

  let truss = $state<TrussParams>({ ...DEFAULT_TRUSS_PARAMS });
  let column = $state<LatticeColumnParams>({ ...DEFAULT_LATTICE_COLUMN_PARAMS });
  let shed = $state<ShedParams>({
    ...DEFAULT_SHED_PARAMS,
    column: { ...DEFAULT_SHED_PARAMS.column },
    truss: { ...DEFAULT_SHED_PARAMS.truss },
  });

  /**
   * One profile per role, kept across generator kinds.
   *
   * A user who set the chord profile for a truss and then switches to a shed means the same
   * thing by "chord". Resetting it per kind would make them say it three times.
   */
  let profiles = $state<Record<MemberRole, ProfileSpec>>({
    chord: defaultProfileSpec('IPE 100'),
    post: defaultProfileSpec('L 50x50x5'),
    diagonal: defaultProfileSpec('L 50x50x5'),
    rafter: defaultProfileSpec('IPE 200'),
    column: defaultProfileSpec('HEB 160'),
    beam: defaultProfileSpec('IPE 200'),
    purlin: defaultProfileSpec('UPN 100'),
    bracing: defaultProfileSpec('L 50x50x5'),
  });

  /**
   * The two ends of a role's members of variable section: at the supports and at mid-span for a
   * beam, at the base and at the head for a column. Until the user picks them, a welded I with
   * the role's profile's plates, twice as deep at the far end: the usual tapered girder.
   */
  let variablePairs = $state<Partial<Record<MemberRole, { start: ProfileSpec; end: ProfileSpec }>>>({});
  const pairOf = (role: MemberRole) => variablePairs[role] ?? weldedIPair(profiles[role]);
  function setPair(role: MemberRole, end: 'start' | 'end', next: ProfileSpec) {
    variablePairs = { ...variablePairs, [role]: { ...pairOf(role), [end]: next } };
  }

  /** Parameter problems, before anything is generated. */
  const paramProblems = $derived<Array<{ key: string }>>(
    kind === 'truss' ? validateTrussParams(truss)
      : kind === 'column' ? validateLatticeColumnParams(column)
        : kind === 'structure' ? validateStructureParams(structureKind, structureParams[structureKind])
          : validateShedParams(shed),
  );

  /**
   * A configuration that generates and then cannot be solved.
   *
   * Deliberately NOT a `ParamProblem`: those disable Generate, and this one must not. Every
   * parameter here is individually valid, and a user may well want the bare geometry to brace
   * it their own way. What they must not get is a model that looks finished and answers
   * "mechanism" the first time they press Solve.
   *
   * The condition is measured, not guessed. Restraining out-of-plane TRANSLATION at the roof
   * truss nodes turns the singular matrix into a 4.0 mm deflection; restraining rotations
   * there does not. So the missing thing is lateral restraint on the trusses, and purlins are
   * the members this generator has for it — which is why the notice names the switch to flip
   * rather than telling the user to go and think about it.
   */
  const stabilityNotice = $derived(
    kind === 'shed' && shed.roof && !shed.purlins
      ? t('generator.notice.roofWithoutPurlins')
      : null,
  );

  /**
   * Bracing that does not reach the ground, named before Generate rather than after Solve.
   *
   * The measurement in `shed-bracing.test.ts`: the shed has no longitudinal load path at all,
   * and the three bracing members only make one together. Roof bracing alone triangulates a
   * plate that still slides; vertical bracing alone ties the roof to an eave line that is itself
   * held by nothing but the columns' weak-axis bending. So a partial selection is a real state a
   * user can be in, and the honest thing is to say what is still missing from the path.
   *
   * A `status`, not an `alert`, and it never blocks Generate: someone may want the geometry to
   * brace it their own way, and half a system is not an invalid parameter.
   */
  const bracingNotice = $derived.by(() => {
    if (kind !== 'shed') return null;
    const any = shed.roofBracing || shed.trussBracing || shed.wallBracing;
    if (!any) return null;
    const all = shed.roofBracing && shed.trussBracing && shed.wallBracing;
    if (all) {
      return shed.longitudinalBeams ? null : t('generator.notice.bracingWithoutEaveBeams');
    }
    return t('generator.notice.bracingIncomplete');
  });

  /**
   * The topology, or null while the parameters are invalid.
   *
   * The generators throw on bad input by design, so the guard is here rather than inside a
   * try — a preview that swallowed the exception would show stale counts for parameters that
   * cannot be built.
   */
  const topology = $derived.by((): Topology | null => {
    if (paramProblems.length > 0) return null;
    if (kind === 'truss') return generateTruss(truss);
    if (kind === 'column') return generateLatticeColumn(column);
    if (kind === 'structure') return generateStructure(structureKind, structureParams[structureKind]);
    return generateShed(shed);
  });

  /**
   * The transverse frame on its own, for the shed's elevation view.
   *
   * Generated from the shed's own truss parameters at the shed's span — the same call
   * `generateShed` makes internally — so the elevation shows the frame that will actually be
   * placed rather than a redrawing of it. Null when the shed has no roof: there is no frame
   * to show, and an empty box would read as a failure rather than as an absence.
   */
  const frameElevation = $derived.by((): Topology | null => {
    if (kind !== 'shed' || !shed.roof) return null;
    const params = { ...shed.truss, spanM: shed.spanM } as TrussParams;
    if (validateTrussParams(params).length > 0) return null;
    return generateTruss(params);
  });

  const roles = $derived(topology ? requiredRoles(topology) : []);
  const varying = $derived(new Set(topology ? variableRoles(topology) : []));
  /** What the emitter gets: a varying role's own profile is its start section. */
  const emitProfiles = $derived.by(() => {
    const out = { ...profiles };
    for (const role of varying) out[role] = pairOf(role).start;
    return out;
  });
  const emitVariable = $derived(Object.fromEntries([...varying].map((role) => [role, pairOf(role).end])) as Partial<Record<MemberRole, ProfileSpec>>);
  const profileProblems = $derived(topology ? validateProfiles(topology, emitProfiles, emitVariable) : []);
  const canGenerate = $derived(
    topology !== null && paramProblems.length === 0 && profileProblems.length === 0,
  );

  /**
   * The grade every generated member is made of, or null for the placeholder.
   *
   * `emit.ts` has carried `GeneratorMaterial.gradeId` since PR21 and has never been given one:
   * a generated model took `PLACEHOLDER_STEEL` — A36, which is not an Argentine grade — and
   * declared `generator.assume.placeholderGrade` to say so. Choosing here is what makes that
   * assumption disappear, and it is a one-line change at the call site precisely because the
   * field was already there.
   */
  let gradeId = $state<string | null>(null);
  let gradeOpen = $state(false);

  /**
   * Whether the preview is docked to the bottom of the panel.
   *
   * Docked by default, because the preview is the feedback loop: the whole point of typing a
   * span is watching the drawing change, and until now it sat inline in a single scrolling
   * column and left the viewport as soon as the parameters were scrolled. Unlockable, because
   * on a short viewport a docked preview costs the parameters the room they need — and that is
   * the user's call, not a rule.
   *
   * On a phone it starts unpinned: the sheet is short, and a pinned drawing left room for one row
   * of parameters. The drawing then follows the form, and only the help line and the Place button
   * stay at the foot.
   */
  const narrow = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;
  let previewDocked = $state(!narrow);

  const grade = $derived(gradeId ? structuralGradeSource.byId(gradeId) : null);

  /**
   * The material handed to the emitter.
   *
   * Null while no grade is chosen, which is what keeps the placeholder and its disclosure: an
   * emitter that received a half-filled material would have to invent the rest.
   */
  const material = $derived.by((): GeneratorMaterial | null => {
    if (!grade) return null;
    return {
      name: grade.designation,
      e: grade.eMPa,
      nu: grade.nu,
      rho: grade.rhoKNM3,
      // The headline value, which is the first thickness band. The member's governing
      // thickness is not known here — the generator places profiles, it does not size them —
      // so resolving a band would be inventing the decision that picks one.
      fy: grade.fyMPa,
      gradeId: grade.id,
    };
  });

  /**
   * Which of the chosen profiles this grade is not ordinarily rolled in.
   *
   * One grade is applied to every member, and the roles do not all take the same section
   * family: a shed's chords are I-sections and its diagonals are angles. So the pairing question
   * has one answer per role, and the useful report is the list of roles where the answer is
   * "this family is not rolled in that steel" — a matter of cost and lead time, never of
   * correctness, and nothing is blocked by it.
   */
  const unusualRoles = $derived.by(() => {
    if (!gradeId) return [] as string[];
    const out: string[] = [];
    for (const role of roles) {
      const specs = [emitProfiles[role], emitVariable[role]];
      const unusual = specs.some((spec) => {
        const family = spec ? resolveProfile(spec.profileName)?.family : undefined;
        return !!family && pairing(family, gradeId!).verdict === 'unusual';
      });
      if (unusual) out.push(role);
    }
    return out;
  });



  function paramsOf(): Record<string, unknown> {
    return kind === 'truss' ? { ...truss } : kind === 'column' ? { ...column }
      : kind === 'structure' ? { ...structureParams[structureKind] } : { ...shed };
  }

  function nameOf(): string {
    if (kind === 'truss') return `${t('generator.ui.kindTruss')} ${truss.spanM} m`;
    if (kind === 'column') return `${t('generator.ui.kindColumn')} ${column.heightM} m`;
    if (kind === 'structure') return t(`generator.structure.${structureKind}`);
    return `${t('generator.ui.kindShed')} ${shed.spanM}x${shed.bayM}x${shed.frames}`;
  }

  /** The generated model as it would be emitted now, with the supports as chosen. */
  function build(supports: SupportMode) {
    if (!topology || !canGenerate) return null;
    return emitModel(withSupportMode(topology, supports), { name: nameOf(), profiles: emitProfiles, variable: emitVariable, ...(material ? { material } : {}) });
  }

  const generatorId = () => (kind === 'structure' ? structureKind : kind);
  function meta() {
    return { generator: generatorId(), params: paramsOf(), profiles: { ...profiles }, variable: { ...variablePairs }, gradeId, name: nameOf() };
  }

  /** Load a generated group's parameters back into the form, to regenerate it. */
  function editGroup(id: number) {
    const d = generatedData(id);
    if (!d) return;
    if ((STRUCTURE_KINDS as readonly string[]).includes(d.generator)) {
      kind = 'structure';
      structureKind = d.generator as StructureKind;
      structureParams = { ...structureParams, [structureKind]: { ...(d.params as StructureParams) } };
    } else if (d.generator === 'truss') { kind = 'truss'; truss = { ...truss, ...(d.params as Partial<TrussParams>) }; }
    else if (d.generator === 'column') { kind = 'column'; column = { ...column, ...(d.params as Partial<LatticeColumnParams>) }; }
    else if (d.generator === 'shed') { kind = 'shed'; shed = { ...shed, ...(d.params as Partial<ShedParams>) }; }
    profiles = { ...profiles, ...(d.profiles as Record<MemberRole, ProfileSpec>) };
    variablePairs = { ...variablePairs, ...((d.variable ?? {}) as typeof variablePairs) };
    gradeId = d.gradeId;
    editingGroupId = id;
    view = 'form';
  }

  /* ── The form's help line and the summaries its folded sections show ── */
  const activeHelp = $derived(genHelp.hover ?? genHelp.focus);
  const hint = (key: string) => ({ hint: t(`generator.hint.${key}`), hintId: `gen-hint-${key}` });
  const len = (m: number) => `${+toDisplay(m, 'length', uiStore.unitSystem).toPrecision(4)} ${unitLabel('length', uiStore.unitSystem)}`;
  const sumTrussShape = $derived(`${t(`generator.truss.${truss.kind}`)} · ${len(truss.spanM)}`);
  const sumTrussWeb = $derived(truss.kind === 'rolledPortal'
    ? (truss.variableSection ? t('generator.ui.variableSection') : '')
    : `${tp('generator.sum.panels', { n: truss.panelsPerHalf })} · ${t(`generator.webPattern.${truss.webPattern}`)}`);
  const sumColumn = $derived(`${len(column.heightM)} · ${len(column.widthM)} · ${t(`generator.lacing.${column.lacing}`)}`);
  const sumStructure = $derived.by(() => {
    const p = structureParams[structureKind];
    return STRUCTURE_FIELDS[structureKind].filter((f) => f.type !== 'bool').slice(0, 2).map((f) => {
      const v = p[f.key];
      const shown = f.type === 'bays' ? `${listShown(String(v ?? ''))} ${unitLabel('length', uiStore.unitSystem)}`
        : f.type === 'select' ? t(`generator.option.${f.key}.${v}`)
          : LENGTH_FIELDS.has(f.key) ? len(Number(v)) : String(v);
      return `${t(`generator.field.${f.key}`)} ${shown}`;
    }).join(' · ');
  });
  const sumFrames = $derived(tp('generator.sum.frames', {
    span: len(shed.spanM), height: len(shed.clearHeightM), frames: shed.frames, bay: len(shed.bayM),
  }));
  const sumShedColumns = $derived(shed.columnKind === 'solid'
    ? t('generator.ui.columnSolid')
    : `${t('generator.ui.columnLattice')} · ${len(shed.column.widthM)}`);
  const sumRoof = $derived(shed.roof
    ? `${t(`generator.truss.${shed.truss.kind}`)} · ${len(shed.truss.riseM)}${shed.purlins ? ` · ${t('generator.ui.purlins')}` : ''}`
    : t('generator.sum.noRoof'));
  const sumBracing = $derived.by(() => {
    const n = [shed.roofBracing, shed.trussBracing, shed.wallBracing].filter(Boolean).length;
    return n === 0 ? t('generator.sum.none') : tp('generator.sum.bracing', { n, total: 3 });
  });
  const sumMembers = $derived([
    [...new Set(roles.map((r) => emitProfiles[r].profileName))].slice(0, 3).join(', '),
    grade ? grade.designation : t('generator.sum.provisionalGrade'),
  ].filter(Boolean).join(' · '));
  const sumWhere = $derived(editingGroupId !== null
    ? t('generator.out.regenerate')
    : `${t(`generator.out.${outputState.mode}`)} · ${t('generator.out.supports')}: ${t(`generator.out.supports.${outputState.supportMode}`)}`);
  const groups = $derived(generatedGroups());
  /** In a generator's form, the structures it made in this model, to regenerate one in place. */
  const formGroups = $derived(groups.filter((g) => generatedData(g.id)?.generator === generatorId()));

</script>


{#snippet preview()}
  {#if topology}
    <div class="previews" data-testid="gen-previews">
      {#if frameElevation}
        <TopologyPreview
          topology={frameElevation}
          view="elevation"
          label={t('generator.ui.previewFrame')}
          heightPx={165}
        />
      {:else if kind === 'structure' && topology.nodes.some((n) => Math.abs(n.y) > 1e-9)}
        <TopologyPreview
          topology={topology}
          view="isometric"
          label={t('generator.ui.previewIso')}
          heightPx={195}
          showLegend
        />
      {:else if kind !== 'shed'}
        <TopologyPreview
          topology={topology}
          view="elevation"
          label={t('generator.ui.previewElevation')}
          heightPx={165}
          showLegend
        />
      {/if}
      {#if kind === 'shed'}
        <TopologyPreview
          topology={topology}
          view="isometric"
          footprint={{ spanM: shed.spanM, lengthM: shed.bayM * (shed.frames - 1) }}
          label={t('generator.ui.previewIso')}
          heightPx={165}
          showLegend
        />
      {/if}
    </div>

    <div class="preview" data-testid="gen-preview">
      <p class="totals">
        {tp('generator.ui.totals', {
          members: topology.members.length,
          nodes: topology.nodes.length,
          length: topology.totalLengthM.toFixed(2),
        })}
        {#if topology.slopePercent !== null}
          · {topology.slopePercent.toFixed(0)}% {t('generator.ui.slope')}
        {/if}
        {#if 'areaM2' in topology}
          · {(topology as { areaM2: number }).areaM2.toFixed(0)} m²
        {/if}
      </p>
      <details class="assume">
        <summary>{t('generator.ui.assumptions')} <span class="count">{topology.assumptions.length}</span></summary>
        <ul>
          {#each topology.assumptions as key (key)}<li>{t(key)}</li>{/each}
        </ul>
      </details>
    </div>
  {/if}

{/snippet}

<div class="gen" data-testid="pro-generators-panel">
  <!-- The panel's frame already says "Generators": the subtitle is all it adds. -->
  <header>
    <p class="sub">{t('generator.ui.subtitle')}</p>
  </header>

  {#if view === 'form'}
    <div class="gen-crumb">
      <button type="button" class="gen-back" onclick={() => { view = 'gallery'; editingGroupId = null; clearGenHelp(); }} data-testid="gen-back">← {t('generator.ui.all')}</button>
      <span class="gen-current" data-testid="gen-current">{formTitle}</span>
    </div>
  {/if}

  <!--
    Everything above the dock scrolls. The dock does not.

    Two regions rather than one column with `position: sticky`: sticky inside a scroller keeps
    the element in flow, so the drawing would still push the Generate button off the bottom on
    a short viewport. A flex column with one `min-height: 0` scroller and a fixed footer is what
    actually pins it.
  -->
  <div class="gen-scroll" bind:this={scrollEl} data-testid="gen-scroll">
  {#if view === 'gallery'}
    <GeneratorGallery onPick={pick} />
    {#if groups.length > 0}
      <h4>{t('generator.out.groupsTitle')}</h4>
      <ul class="gen-groups" data-testid="gen-groups">
        {#each groups as g (g.id)}
          <li class:editing={editingGroupId === g.id}>
            <span>{g.name}</span>
            {#if editingGroupId === g.id}
              <button type="button" class="dock-toggle" onclick={() => (editingGroupId = null)}>{t('generator.out.stopEditing')}</button>
            {:else}
              <button type="button" class="dock-toggle" onclick={() => editGroup(g.id)} data-testid="gen-edit-group-{g.id}">{t('generator.out.editGroup')}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <ProTemplatesSection />
  {:else}

  <!--
    ── The form, in sections ──

    Each section folds and, folded, keeps saying what it holds. The parameters come first, split
    the way the structure is read (the outline, then what is inside it); then the members and
    their steel; then where it goes.
  -->
  <div class="gen-form">
  {#if kind === 'truss'}
    <GenSection id="shape" title={t('generator.sec.shape')} summary={sumTrussShape}>
      <TrussFields bind:p={truss} withSpan part="shape" />
    </GenSection>
    <GenSection id="web" title={truss.kind === 'rolledPortal' ? t('generator.sec.solidWeb') : t('generator.sec.web')} summary={sumTrussWeb}>
      <TrussFields bind:p={truss} part="web" />
    </GenSection>

  {:else if kind === 'column'}
    <GenSection id="column" title={t('generator.sec.column')} summary={sumColumn}>
      <LatticeColumnFields bind:p={column} standalone />
    </GenSection>

  {:else if kind === 'structure'}
    <GenSection id="geometry" title={t('generator.sec.geometry')} summary={sumStructure}>
      {#each STRUCTURE_FIELDS[structureKind] as f (structureKind + f.key)}
        {@const fh = { hint: t(`generator.fhint.${f.key}`), hintId: `gen-hint-f-${f.key}` }}
        {#if f.type === 'bool'}
          <GenRow name={t(`generator.field.${f.key}`)} check {...fh}><input type="checkbox" checked={!!structureParams[structureKind][f.key]} onchange={(e) => { structureParams[structureKind][f.key] = e.currentTarget.checked; }} aria-describedby={fh.hintId} data-testid="gen-f-{f.key}" /></GenRow>
        {:else if f.type === 'select'}
          <GenRow name={t(`generator.field.${f.key}`)} {...fh}>
            <select bind:value={structureParams[structureKind][f.key]} aria-describedby={fh.hintId} data-testid="gen-f-{f.key}">
              {#each f.options ?? [] as o (o)}<option value={o}>{t(`generator.option.${f.key}.${o}`)}</option>{/each}
            </select>
          </GenRow>
        {:else if f.type === 'bays'}
          {@const id = structureKind + f.key}
          <GenRow name={t(`generator.field.${f.key}`)} {...fh}>
            <input type="text" class="bays" placeholder="6; 7,5; 6" aria-describedby={fh.hintId} data-testid="gen-f-{f.key}"
              value={listEditing?.id === id ? listEditing.text : listShown(String(structureParams[structureKind][f.key] ?? ''))}
              onfocus={(e) => (listEditing = { id, text: e.currentTarget.value })}
              oninput={(e) => { listEditing = { id, text: e.currentTarget.value }; structureParams[structureKind][f.key] = listRead(e.currentTarget.value); }}
              onblur={() => (listEditing = null)} />
            <span class="unit">{unitLabel('length', uiStore.unitSystem)}</span>
          </GenRow>
        {:else if LENGTH_FIELDS.has(f.key)}
          <!-- No min/max on the field: a value out of range is named by the validator, not dropped. -->
          <GenRow name={t(`generator.field.${f.key}`)} {...fh}>
            <QuantityInput quantity="length" testid="gen-f-{f.key}" describedBy={fh.hintId}
              bind:value={() => Number(structureParams[structureKind][f.key]), (v) => (structureParams[structureKind][f.key] = v)} />
          </GenRow>
        {:else}
          <GenRow name={t(`generator.field.${f.key}`)} {...fh}>
            <input type="number" min={f.min} max={f.max} step={f.step ?? 1} bind:value={structureParams[structureKind][f.key]} aria-describedby={fh.hintId} data-testid="gen-f-{f.key}" />
          </GenRow>
        {/if}
      {/each}
    </GenSection>

  {:else}
    <GenSection id="frames" title={t('generator.sec.frames')} summary={sumFrames}>
      <GenRow name={t('generator.ui.spanVT')} {...hint('spanVT')}><QuantityInput quantity="length" bind:value={shed.spanM} describedBy="gen-hint-spanVT" /></GenRow>
      <GenRow name={t('generator.ui.clearHeight')} {...hint('clearHeight')}><QuantityInput quantity="length" bind:value={shed.clearHeightM} describedBy="gen-hint-clearHeight" /></GenRow>
      <GenRow name={t('generator.ui.bayVP')} {...hint('bayVP')}><QuantityInput quantity="length" bind:value={shed.bayM} describedBy="gen-hint-bayVP" /></GenRow>
      <GenRow name={t('generator.ui.frames')} {...hint('frames')}><input type="number" min="2" step="1" bind:value={shed.frames} aria-describedby="gen-hint-frames" /></GenRow>
      <GenRow name={t('generator.ui.beams')} check {...hint('beams')}><input type="checkbox" bind:checked={shed.longitudinalBeams} aria-describedby="gen-hint-beams" /></GenRow>
      <GenRow name={t('generator.ui.fixedBase')} check><input type="checkbox" bind:checked={shed.fixedBase} /></GenRow>
    </GenSection>

    <GenSection id="columns" title={t('generator.sec.columns')} summary={sumShedColumns}>
      <GenRow name={t('generator.ui.columnKind')}>
        <select bind:value={shed.columnKind} data-testid="gen-column-kind">
          <option value="lattice">{t('generator.ui.columnLattice')}</option>
          <option value="solid">{t('generator.ui.columnSolid')}</option>
        </select>
      </GenRow>
      {#if shed.columnKind === 'solid'}
        <GenRow name={t('generator.ui.variableSection')} check><input type="checkbox" checked={!!shed.variableColumns} onchange={(e) => { shed.variableColumns = e.currentTarget.checked; }} data-testid="gen-variable-columns" /></GenRow>
        <p class="gen-note">{t('generator.ui.variableColumnHelp')}</p>
      {:else}
        <LatticeColumnFields bind:p={shed.column} />
      {/if}
    </GenSection>

    <GenSection id="roof" title={t('generator.sec.roof')} summary={sumRoof}>
      <GenRow name={t('generator.ui.roof')} check><input type="checkbox" bind:checked={shed.roof} /></GenRow>
      {#if shed.roof}
        <TrussFields bind:p={shed.truss} shapeKey="generator.ui.roofTrussShape" part="shape" />
        <TrussFields bind:p={shed.truss} part="web" />
        <GenRow name={t('generator.ui.purlins')} check {...hint('purlinsOn')}><input type="checkbox" bind:checked={shed.purlins} aria-describedby="gen-hint-purlinsOn" /></GenRow>
      {/if}
      <!--
        `status`, not `alert`: nothing is wrong yet and Generate stays available. It is announced
        when it appears, which is the moment the user unticks Purlins — before Generate, not after
        Solve refuses.
      -->
      {#if stabilityNotice}
        <p class="notice" role="status" data-testid="gen-stability-notice">{stabilityNotice}</p>
      {/if}
    </GenSection>

    <!--
      Bracing, as three switches rather than one.

      They are three different members doing three different jobs, and collapsing them into
      "Bracing" would hide the fact the measurement turned up: bracing the roof PLANE anchors
      nothing on its own. The path is roof plane → vertical bracing between trusses → eave line
      → eave beams → braced wall → ground, and a user who ticks one box and gets 10^11 m of
      displacement learns nothing from a single control.

      `shed-bracing.test.ts` measures each one's contribution by removing it.
    -->
    <GenSection id="bracing" title={t('generator.sec.bracing')} summary={sumBracing}>
      <GenRow name={t('generator.ui.roofBracing')} check {...hint('roofBracing')}><input type="checkbox" bind:checked={shed.roofBracing} aria-describedby="gen-hint-roofBracing" /></GenRow>
      <GenRow name={t('generator.ui.trussBracing')} check {...hint('trussBracing')}><input type="checkbox" bind:checked={shed.trussBracing} aria-describedby="gen-hint-trussBracing" /></GenRow>
      <GenRow name={t('generator.ui.wallBracing')} check {...hint('wallBracing')}><input type="checkbox" bind:checked={shed.wallBracing} aria-describedby="gen-hint-wallBracing" /></GenRow>
      {#if shed.roofBracing || shed.trussBracing || shed.wallBracing}
        <GenRow name={t('generator.ui.bracingBays')}>
          <select bind:value={shed.bracingBays} data-testid="gen-bracing-bays">
            {#each BRACING_BAYS as b (b)}<option value={b}>{t(`generator.bracingBays.${b}`)}</option>{/each}
          </select>
        </GenRow>
      {/if}
      {#if bracingNotice}
        <p class="notice" role="status" data-testid="gen-bracing-notice">{bracingNotice}</p>
      {/if}
    </GenSection>
  {/if}

  {#if paramProblems.length > 0}
    <ul class="problems" id="gen-param-problems" role="alert" data-testid="gen-param-problems">
      {#each paramProblems as p, i (i)}<li>{t(p.key)}</li>{/each}
    </ul>
  {/if}

  <!-- ── Profiles, only for the roles this topology actually places, and the one steel ── -->
  <GenSection id="members" title={t('generator.sec.members')} summary={sumMembers}>
  {#if roles.length > 0}
    {#each roles as role (role)}
      {#if varying.has(role)}
        <!-- A member of variable section: the section where it starts, and where it grows to. -->
        <ProfilePicker
          {role} key={`${role}-start`} allowBuilt
          label={`${t(`generator.role.${role}`)} · ${t(`generator.variable.start.${role}`)}`}
          spec={pairOf(role).start}
          onChange={(next) => setPair(role, 'start', next)}
        />
        <ProfilePicker
          {role} key={`${role}-end`} allowBuilt
          label={`${t(`generator.role.${role}`)} · ${t(`generator.variable.end.${role}`)}`}
          spec={pairOf(role).end}
          onChange={(next) => setPair(role, 'end', next)}
        />
      {:else}
        <ProfilePicker
          {role}
          spec={profiles[role]}
          onChange={(next) => { profiles = { ...profiles, [role]: next }; }}
        />
      {/if}
    {/each}
  {/if}

  <!--
    ── The material, once, for every member the generator places ──

    One grade rather than one per role. A generated frame is fabricated from one steel, and a
    per-role material would be a modelling capability the generator has no use for — while the
    role-by-role CONSEQUENCE of the single choice, which sections that steel is not ordinarily
    rolled in, is reported below.
  -->
  <div class="grade-line" data-testid="gen-grade-line">
    <span class="grade-name">{t('generator.ui.material')}</span>
    <button
      type="button"
      class="grade-trigger"
      aria-expanded={gradeOpen}
      onclick={() => (gradeOpen = !gradeOpen)}
      data-testid="gen-grade-trigger"
    >{grade ? grade.designation : t('steel.grades.none')}</button>
    {#if grade}
      <span class="grade-meta">{grade.productStandard} · fy {grade.fyMPa} MPa</span>
      <button type="button" class="grade-clear" onclick={() => { gradeId = null; }}
              data-testid="gen-grade-clear">{t('generator.ui.materialClear')}</button>
    {:else}
      <!--
        What the model gets INSTEAD, named. An empty control beside "no grade" leaves a user to
        assume the members have no material at all; they have a placeholder, and the generated
        model declares it as an assumption.
      -->
      <span class="grade-meta">{t('generator.ui.materialPlaceholder')}</span>
    {/if}
  </div>
  <p class="gen-note" data-testid="gen-grade-scope">{t('generator.ui.materialScope')}</p>

  <!--
    The pairing note sits with the controls it is about. A warning that a grade is unusual for
    the diagonals is useless three sections away from the control that chose the diagonals.
  -->
  {#if unusualRoles.length > 0}
    <p class="notice" role="status" data-testid="gen-grade-pairing">
      {tp('generator.notice.gradeUnusualForRoles', {
        grade: grade?.designation ?? '',
        roles: unusualRoles.map((r) => t(`generator.role.${r}`)).join(', '),
      })}
    </p>
  {/if}

  {#if profileProblems.length > 0}
    <ul class="problems" id="gen-profile-problems" role="alert" data-testid="gen-profile-problems">
      {#each profileProblems as p, i (i)}
        <li>{t(p.key).replace('{role}', p.role ? t(`generator.role.${p.role}`) : '').replace('{name}', String(p.params?.name ?? ''))}</li>
      {/each}
    </ul>
  {/if}
  </GenSection>

  <!--
    The same selector the materials tab opens, narrowed to the metals.

    It used to be `GradePickerPanel`, an inline popover over the grade database. That panel is
    good and is still what the modal's own list is measured against, but having two material
    surfaces in PRO meant two places to keep in step — and only one of them carried the
    thickness bands and the per-field authority. Narrowing the shared one to the metal
    categories keeps the catalogue, the sheet, the keyboard and the conversion identical, and
    shortens only the tab strip.
  -->
  <ProMaterialModal
    open={gradeOpen}
    selected={grade?.designation ?? ''}
    label={t('generator.ui.material')}
    categories={METAL_CATEGORIES}
    onApply={(choice) => { gradeId = choiceGradeId(choice); }}
    onClose={() => (gradeOpen = false)}
  />

    {#if formGroups.length > 0}
      <GenSection id="groups" title={t('generator.out.groupsTitle')} summary={String(formGroups.length)}>
      <ul class="gen-groups" data-testid="gen-groups">
        {#each formGroups as g (g.id)}
          <li class:editing={editingGroupId === g.id}>
            <span>{g.name}</span>
            {#if editingGroupId === g.id}
              <button type="button" class="dock-toggle" onclick={() => (editingGroupId = null)}>{t('generator.out.stopEditing')}</button>
            {:else}
              <button type="button" class="dock-toggle" onclick={() => editGroup(g.id)} data-testid="gen-edit-group-{g.id}">{t('generator.out.editGroup')}</button>
            {/if}
          </li>
        {/each}
      </ul>
      </GenSection>
    {/if}
    <GenSection id="where" title={t('generator.out.where')} summary={sumWhere}>
      <GeneratorOutput part="options" st={outputState} {topology} {canGenerate} {build} {meta} {editingGroupId} />
    </GenSection>
  </div><!-- /gen-form -->

    {#if !previewDocked}{@render preview()}{/if}
  {/if}
  </div><!-- /gen-scroll -->

  <!--
    The drawing and the count, both from the same topology object Generate then emits — so
    the picture, the numbers and the model agree by construction rather than by care.
  -->
  {#if view === 'form'}
  <div class="gen-dock" class:docked={previewDocked} data-testid="gen-dock">
    <div class="gen-dock-head">
      <!--
        What the parameter under the pointer (or in focus) controls, on the same line as the
        preview's pin. One line tall: a longer explanation opens over the drawing below it, never
        pushing anything (a line that grew shrank the list above, moved the hovered row out from
        under the pointer, and the form shook). Read aloud through each field's own
        `aria-describedby`, so it is for the eye only.
      -->
      <div class="gen-help" class:on={!!activeHelp} aria-hidden="true" data-testid="gen-help">
        <p class="gen-help-text">{#if activeHelp}<span class="gen-help-name">{activeHelp.name}</span> {activeHelp.text}{:else}{t('generator.help.idle')}{/if}</p>
      </div>
      <button
        type="button" class="dock-toggle" data-testid="gen-dock-toggle"
        aria-pressed={previewDocked}
        onclick={() => (previewDocked = !previewDocked)}
      >{previewDocked ? t('generator.ui.previewUnlock') : t('generator.ui.previewLock')}</button>
    </div>
    {#if previewDocked}<div class="gen-dock-body">{@render preview()}</div>{/if}
  </div>
  <!--
    The action that places what the form describes, always at the foot of the panel: with the
    preview pinned or not, and however long the form, it is never scrolled away.
  -->
  <div class="gen-actions">
    <GeneratorOutput part="actions" st={outputState} {topology} {canGenerate} {build} {meta}
      {editingGroupId}
      describedBy={paramProblems.length > 0 ? 'gen-param-problems' : profileProblems.length > 0 ? 'gen-profile-problems' : undefined} />
  </div>
  {/if}


  <p class="model-note">
    {tp('generator.ui.currentModel', {
      nodes: modelStore.nodes.size, elements: modelStore.elements.size,
    })}
  </p>
</div>

<style>
  /*
    The panel is a column with one scroller and one fixed footer, not a single scroller.
    `min-height: 0` on the scroller is what lets it actually shrink inside the flex parent —
    without it the default `min-height: auto` makes it as tall as its content and the dock is
    pushed off the bottom, which is the same failure the dock exists to fix.
  */
  /* Horizontal inset comes from `.pro-content`; see ProPanel. */
  .gen { display: flex; flex-direction: column; padding: 10px 0; height: 100%; overflow: hidden; }
  .gen-crumb { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .gen-back {
    padding: 2px 8px; background: none; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    color: var(--st-text-2); font: inherit; font-size: 0.7rem; cursor: pointer;
  }
  .gen-back:hover { color: var(--st-text); border-color: var(--st-accent); }
  .gen-current { font-size: 0.8rem; font-weight: 600; color: var(--st-text); }
  .gen-scroll { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; overflow-y: auto; }
  .gen-dock {
    display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;
    border-top: 1px solid var(--st-hair); margin-top: 6px; padding-top: 5px;
  }
  /* Bounded, so a tall drawing cannot take the whole panel and leave no parameters. */
  .gen-dock.docked { max-height: 50%; min-height: 0; }
  .gen-dock-body { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; }
  .gen-actions { flex-shrink: 0; padding-top: 8px; }
  .dock-toggle {
    align-self: flex-end; padding: 2px 8px; font-size: 0.64rem; cursor: pointer;
    background: transparent; color: var(--st-text-3);
    border: 1px solid var(--st-hair); border-radius: 3px;
  }
  .dock-toggle:hover { color: var(--st-text-2); }
  .dock-toggle:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  /*
    Number inputs: the spinner overlaps the value at this size.

    The controls in this panel are 4–6 rem wide with right-aligned numbers, and WebKit's
    inner spin button is drawn INSIDE that box — so `24.50` renders under a pair of arrows and
    the last digit is unreadable. Firefox's `appearance: textfield` does the same job through a
    different property, so both are set.

    What this does NOT do is remove the behaviour. `step`, `min` and `max` still apply, the
    Up and Down arrow keys still step the value, and the field is still `type="number"`, so a
    screen reader still announces it as a spinbutton and a mobile keyboard is still numeric.
    Only the painted arrows go.
  */
  .gen :global(input[type='number']::-webkit-outer-spin-button),
  .gen :global(input[type='number']::-webkit-inner-spin-button) {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }
  .gen :global(input[type='number']) {
    -moz-appearance: textfield;
    appearance: textfield;
    /* The room the arrows used to take, given back to the number. */
    padding-right: 6px;
  }
  h3 { margin: 0; font-size: 0.86rem; font-weight: 600; }
  h4 { margin: 6px 0 2px; font-size: 0.74rem; font-weight: 600; color: var(--st-text-2); }
  .sub { margin: 2px 0 0; font-size: 0.7rem; color: var(--st-text-2); }
  /*
    The form: sections of rows, every name in one column and every box in the next (`GenRow`).
    The name column narrows with the panel, down to a width that still holds two short words.
  */
  .gen-form { --gr-l: clamp(6.5rem, 34%, 9rem); display: flex; flex-direction: column; }
  .gen-form .unit { font-size: 0.66rem; color: var(--st-text-3); }
  /* A note about the field above it, under the box column where that field starts. */
  .gen-form :global(.gen-note) {
    margin: -1px 0 3px calc(var(--gr-l) + 8px);
    font-size: 0.62rem; line-height: 1.4; color: var(--st-text-3);
  }
  .gen-groups { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: 0.7rem; }
  .gen-groups li { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 3px; }
  .gen-groups li.editing { background: var(--st-surface-3); }
  .problems { margin: 0; padding-left: 16px; font-size: 0.68rem; color: var(--st-danger); }
  /* Warn, not error: the model will generate. `--st-warn` is the token that means exactly
     "this is going to cost you something", which is what an unsolvable roof is. */
  .notice {
    margin: 6px 0 0; font-size: 0.68rem; line-height: 1.45; color: var(--st-warn);
    border-left: 2px solid var(--st-warn); padding-left: 8px;
  }
  /* Side by side where the panel is wide enough, so two drawings do not take the whole dock. */
  .previews { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px; }
  .preview { border: 1px solid var(--st-surface-3); border-radius: 4px; padding: 6px 8px; }
  .totals { margin: 0; font-size: 0.72rem; color: var(--st-text); font-variant-numeric: tabular-nums; }
  /* The per-role legend moved into the preview, beside the colours it names. */
  .assume { margin-top: 5px; }
  .assume summary { cursor: pointer; font-size: 0.68rem; color: var(--st-text-2); }
  .assume summary:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 2px; }
  .assume ul { margin: 4px 0 0; padding-left: 16px; font-size: 0.66rem; color: var(--st-text-2); line-height: 1.4; }
  .count { padding: 0 4px; border-radius: 3px; background: rgba(128,128,128,0.3); }
  .warn { margin: 0; font-size: 0.68rem; color: var(--st-warn); }
  .go {
    padding: 6px 10px; font-size: 0.76rem; font-weight: 600; cursor: pointer;
    background: var(--st-hair-strong); border: 1px solid var(--st-interactive); border-radius: 3px; color: var(--st-text);
  }
  .go:disabled { opacity: 0.45; cursor: not-allowed; border-color: var(--st-hair-strong); }
  .go:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 2px; }
  .result { margin: 0; font-size: 0.7rem; color: var(--st-ok); }
  .model-note { margin: 0; font-size: 0.66rem; color: var(--st-text-3); }

  /* The material row reads like a profile row, because it is the same kind of choice. */
  .grade-line {
    display: grid; grid-template-columns: var(--gr-l) auto auto auto; justify-content: start;
    align-items: center; gap: 4px 8px; margin: 4px 0 2px;
  }
  .grade-name { text-align: right; font-size: 0.7rem; color: var(--st-text-2); }
  .grade-trigger {
    font-family: var(--st-mono, monospace); font-size: 0.68rem;
    padding: 3px 7px; min-width: 7.5rem; text-align: left; cursor: pointer;
    background: var(--st-surface); color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 3px;
  }
  .grade-meta { font-size: 0.62rem; color: var(--st-text-3); }
  .grade-clear {
    background: none; border: none; cursor: pointer;
    font-size: 0.6rem; color: var(--st-text-3); text-decoration: underline;
  }

  /*
    One focus ring for every control in this panel.

    The metallic surface was written before the `--st-*` system reached it: it carried its own
    palette of seventeen hardcoded hex values and, between the two panels, four `:focus-visible`
    rules for several dozen controls. A keyboard user got whatever the UA happened to draw.
  */
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  summary:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }

  /* The help line, beside the preview's pin. Above the drawing, so it can open over it. */
  .gen-dock-head { position: relative; z-index: 3; display: flex; align-items: center; gap: 8px; }
  .gen-dock-head .dock-toggle { flex-shrink: 0; }
  .gen-help { position: relative; flex: 1; min-width: 0; height: 1.35em; font-size: 0.64rem; line-height: 1.35; }
  .gen-help-text {
    position: absolute; top: 0; left: 0; right: 0; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: var(--st-text-3); pointer-events: none;
  }
  /* An explanation longer than the line opens downward over the drawing, on its own card. */
  .gen-help.on .gen-help-text {
    white-space: normal; overflow: visible;
    top: -4px; left: -6px; right: -6px; padding: 3px 6px;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius, 3px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  /* Without a pointer to hover with (a phone), the invitation to hover is only in the way. */
  @media (hover: none) {
    .gen-help:not(.on) .gen-help-text { visibility: hidden; }
  }
  .gen-help-name { color: var(--st-text); font-weight: 600; margin-right: 2px; }
  .gen-help-name::after { content: ' ·'; font-weight: 400; color: var(--st-text-3); }
</style>
