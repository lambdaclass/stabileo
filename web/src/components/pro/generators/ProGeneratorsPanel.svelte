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
   * with what lands in the model. `matchesPreview` asserts that after the fact, and the
   * summary line reports the mismatch rather than hiding it.
   *
   * ── Generating replaces the model ─────────────────────────────────
   *
   * Said before the button, not after. One undo step gets it back, and that is also stated
   * rather than assumed.
   */
  import { t, tp } from '../../../lib/i18n';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { modelStore } from '../../../lib/store/model.svelte';
  import { applyGeneratedModel, matchesPreview } from '../../../lib/store/generator-apply';
  import {
    DEFAULT_TRUSS_PARAMS, TRUSS_KINDS, ARCH_CURVES, WEB_PATTERNS,
    generateTruss, validateTrussParams, type Topology, type TrussParams,
  } from '../../../lib/engine/generators/truss-topology';
  import {
    DEFAULT_LATTICE_COLUMN_PARAMS, LACING_PATTERNS,
    generateLatticeColumn, validateLatticeColumnParams, type LatticeColumnParams,
  } from '../../../lib/engine/generators/lattice-column';
  import {
    BRACING_BAYS, DEFAULT_SHED_PARAMS, generateShed, validateShedParams, type ShedParams,
  } from '../../../lib/engine/generators/shed';
  import {
    emitModel, requiredRoles, validateProfiles, defaultProfileSpec,
    type EmitOptions, type GeneratorMaterial, type ProfileSpec,
  } from '../../../lib/engine/generators/emit';
  import GradePickerPanel from '../steel/GradePickerPanel.svelte';
  import { pairing, structuralGradeSource } from '../../../lib/grades/catalogue';
  import { resolveProfile } from '../../../lib/engine/generators/profile-resolve';
  import type { MemberRole } from '../../../lib/engine/generators/member-roles';
  import type { ProvenanceSource } from '../../../lib/model/provenance';
  import ProfilePicker from './ProfilePicker.svelte';
  import TopologyPreview from './TopologyPreview.svelte';

  type Kind = 'truss' | 'column' | 'shed';
  let kind = $state<Kind>('truss');

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

  /** Parameter problems, before anything is generated. */
  const paramProblems = $derived(
    kind === 'truss' ? validateTrussParams(truss)
      : kind === 'column' ? validateLatticeColumnParams(column)
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
  const profileProblems = $derived(topology ? validateProfiles(topology, profiles) : []);
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
      const spec = profiles[role];
      if (!spec) continue;
      const family = resolveProfile(spec.profileName)?.family;
      if (!family) continue;
      if (pairing(family, gradeId).verdict === 'unusual') out.push(role);
    }
    return out;
  });

  let lastResult = $state<string | null>(null);

  const SOURCE: Record<Kind, ProvenanceSource> = {
    truss: 'generator-truss',
    column: 'generator-lattice-column',
    shed: 'generator-shed',
  };

  function paramsOf(): Record<string, unknown> {
    return kind === 'truss' ? { ...truss } : kind === 'column' ? { ...column } : { ...shed };
  }

  function nameOf(): string {
    if (kind === 'truss') return `${t('generator.ui.kindTruss')} ${truss.spanM} m`;
    if (kind === 'column') return `${t('generator.ui.kindColumn')} ${column.heightM} m`;
    return `${t('generator.ui.kindShed')} ${shed.spanM}x${shed.bayM}x${shed.frames}`;
  }

  function generate() {
    if (!topology || !canGenerate) return;
    const opts: EmitOptions = {
      name: nameOf(), profiles,
      ...(material ? { material } : {}),
    };
    const g = emitModel(topology, opts);
    const r = applyGeneratedModel(g, {
      source: SOURCE[kind],
      // The clock is read HERE and nowhere below: every module under this one takes the
      // timestamp as a parameter so its output is reproducible.
      atIso: new Date().toISOString(),
      params: paramsOf(),
      name: opts.name,
    });
    lastResult = matchesPreview(g, r)
      ? tp('generator.ui.generated', { nodes: r.nodes, elements: r.elements, name: opts.name })
      : tp('generator.ui.mismatch', { promised: g.json.elements.length, got: r.elements });
    uiStore.toast(lastResult, matchesPreview(g, r) ? 'success' : 'error');
  }
</script>

<!--
  The head of a parameter field: its name, and one line saying what the number CONTROLS.

  The fields were bare labels — `Span`, `Rise`, `Panels` — and a number box. Which of them is a
  length and which is a count, what unit it is in, and what changes when you move it were things
  a user had to already know. The hint carries the unit, so a value can be entered without
  guessing whether the box wants metres or millimetres.

  `id` is derived from the key so the input beside it can point at the hint with
  `aria-describedby`: a screen reader then reads the explanation with the field, rather than the
  reader having to go looking for it.
-->
{#snippet fieldHead(key: string)}
  <span class="fname">{t(`generator.ui.${key}`)}</span>
  <span class="fhint" id={`gen-hint-${key}`}>{t(`generator.hint.${key}`)}</span>
{/snippet}

<div class="gen" data-testid="pro-generators-panel">
  <header>
    <h3>{t('generator.ui.title')}</h3>
    <p class="sub">{t('generator.ui.subtitle')}</p>
  </header>

  <div class="kinds" role="group" aria-label={t('generator.ui.title')}>
    {#each [['truss', 'kindTruss'], ['column', 'kindColumn'], ['shed', 'kindShed']] as [k, key] (k)}
      <button
        type="button"
        class:active={kind === k}
        data-testid={`gen-kind-${k}`}
        aria-pressed={kind === k}
        onclick={() => { kind = k as Kind; }}
      >{t(`generator.ui.${key}`)}</button>
    {/each}
  </div>

  <!-- ── Parameters ── -->
  <div class="fields">
    {#if kind === 'truss'}
      <label><span>{t('generator.ui.kindTruss')}</span>
        <select bind:value={truss.kind}>
          {#each TRUSS_KINDS as k (k)}<option value={k}>{t(`generator.truss.${k}`)}</option>{/each}
        </select></label>
      <label>{@render fieldHead('span')}<input type="number" min="0.5" step="0.5" bind:value={truss.spanM} aria-describedby="gen-hint-span" /></label>
      <label>{@render fieldHead('rise')}<input type="number" min="0" step="0.1" bind:value={truss.riseM} aria-describedby="gen-hint-rise" /></label>
      {#if truss.kind === 'trapezoidal' || truss.kind === 'arch'}
        <label>{@render fieldHead('endDepth')}<input type="number" min="0" step="0.1" bind:value={truss.endDepthM} aria-describedby="gen-hint-endDepth" /></label>
      {/if}
      {#if truss.kind === 'parallelChord' || truss.kind === 'pratt'}
        <label>{@render fieldHead('depth')}<input type="number" min="0.1" step="0.1" bind:value={truss.depthM} aria-describedby="gen-hint-depth" /></label>
      {/if}
      {#if truss.kind === 'trapezoidal'}
        <label>{@render fieldHead('plateau')}<input type="number" min="0" step="0.1" bind:value={truss.plateauM} aria-describedby="gen-hint-plateau" /></label>
      {/if}
      {#if truss.kind === 'arch'}
        <label><span>{t('generator.ui.archCurve')}</span>
          <select bind:value={truss.archCurve}>
            {#each ARCH_CURVES as c (c)}<option value={c}>{t(`generator.archCurve.${c}`)}</option>{/each}
          </select></label>
      {/if}
      {#if truss.kind !== 'rolledPortal'}
        <label>{@render fieldHead('panels')}<input type="number" min="1" step="1" bind:value={truss.panelsPerHalf} aria-describedby="gen-hint-panels" /></label>
        <label><span>{t('generator.ui.webPattern')}</span>
          <select bind:value={truss.webPattern}>
            {#each WEB_PATTERNS as w (w)}<option value={w}>{t(`generator.webPattern.${w}`)}</option>{/each}
          </select></label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={truss.halfTruss} /><span>{t('generator.ui.halfTruss')}</span></label>

    {:else if kind === 'column'}
      <label>{@render fieldHead('height')}<input type="number" min="0.5" step="0.5" bind:value={column.heightM} aria-describedby="gen-hint-height" /></label>
      <label>{@render fieldHead('width')}<input type="number" min="0.1" step="0.05" bind:value={column.widthM} aria-describedby="gen-hint-width" /></label>
      <label>{@render fieldHead('divisions')}<input type="number" min="1" step="1" bind:value={column.divisions} aria-describedby="gen-hint-divisions" /></label>
      <label><span>{t('generator.ui.lacing')}</span>
        <select bind:value={column.lacing}>
          {#each LACING_PATTERNS as l (l)}<option value={l}>{t(`generator.lacing.${l}`)}</option>{/each}
        </select></label>
      <label class="check"><input type="checkbox" bind:checked={column.fixedBase} /><span>{t('generator.ui.fixedBase')}</span></label>

    {:else}
      <label><span>{t('generator.ui.spanVT')}</span><input type="number" min="1" step="0.5" bind:value={shed.spanM} /></label>
      <label>{@render fieldHead('bayVP')}<input type="number" min="1" step="0.5" bind:value={shed.bayM} aria-describedby="gen-hint-bayVP" /></label>
      <label>{@render fieldHead('frames')}<input type="number" min="2" step="1" bind:value={shed.frames} aria-describedby="gen-hint-frames" /></label>
      <label>{@render fieldHead('clearHeight')}<input type="number" min="1" step="0.5" bind:value={shed.clearHeightM} aria-describedby="gen-hint-clearHeight" /></label>
      <label><span>{t('generator.ui.columnKind')}</span>
        <select bind:value={shed.columnKind}>
          <option value="lattice">{t('generator.ui.columnLattice')}</option>
          <option value="solid">{t('generator.ui.columnSolid')}</option>
        </select></label>
      {#if shed.columnKind === 'lattice'}
        <label>{@render fieldHead('width')}<input type="number" min="0.1" step="0.05" bind:value={shed.column.widthM} aria-describedby="gen-hint-width" /></label>
        <label>{@render fieldHead('divisions')}<input type="number" min="1" step="1" bind:value={shed.column.divisions} aria-describedby="gen-hint-divisions" /></label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={shed.longitudinalBeams} /><span>{t('generator.ui.beams')}</span></label>
      <label class="check"><input type="checkbox" bind:checked={shed.roof} /><span>{t('generator.ui.roof')}</span></label>
      {#if shed.roof}
        <label><span>{t('generator.ui.kindTruss')}</span>
          <select bind:value={shed.truss.kind}>
            {#each TRUSS_KINDS as k (k)}<option value={k}>{t(`generator.truss.${k}`)}</option>{/each}
          </select></label>
        <label>{@render fieldHead('rise')}<input type="number" min="0" step="0.1" bind:value={shed.truss.riseM} aria-describedby="gen-hint-rise" /></label>
        <label>{@render fieldHead('panels')}<input type="number" min="1" step="1" bind:value={shed.truss.panelsPerHalf} aria-describedby="gen-hint-panels" /></label>
        <label class="check"><input type="checkbox" bind:checked={shed.truss.halfTruss} /><span>{t('generator.ui.halfTruss')}</span></label>
        <label class="check"><input type="checkbox" bind:checked={shed.purlins} /><span>{t('generator.ui.purlins')}</span></label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={shed.fixedBase} /><span>{t('generator.ui.fixedBase')}</span></label>

      <!--
        Bracing, as three switches rather than one.

        They are three different members doing three different jobs, and collapsing them into
        "Bracing" would hide the fact the measurement turned up: bracing the roof PLANE anchors
        nothing on its own. The path is roof plane → vertical bracing between trusses → eave line
        → eave beams → braced wall → ground, and a user who ticks one box and gets 10^11 m of
        displacement learns nothing from a single control.

        `shed-bracing.test.ts` measures each one's contribution by removing it.
      -->
      <label class="check"><input type="checkbox" bind:checked={shed.roofBracing} />
        <span>{t('generator.ui.roofBracing')}</span></label>
      <label class="check"><input type="checkbox" bind:checked={shed.trussBracing} />
        <span>{t('generator.ui.trussBracing')}</span></label>
      <label class="check"><input type="checkbox" bind:checked={shed.wallBracing} />
        <span>{t('generator.ui.wallBracing')}</span></label>
      {#if shed.roofBracing || shed.trussBracing || shed.wallBracing}
        <label><span>{t('generator.ui.bracingBays')}</span>
          <select bind:value={shed.bracingBays} data-testid="gen-bracing-bays">
            {#each BRACING_BAYS as b (b)}<option value={b}>{t(`generator.bracingBays.${b}`)}</option>{/each}
          </select></label>
      {/if}
    {/if}
  </div>

  {#if paramProblems.length > 0}
    <ul class="problems" id="gen-param-problems" role="alert" data-testid="gen-param-problems">
      {#each paramProblems as p, i (i)}<li>{t(p.key)}</li>{/each}
    </ul>
  {/if}

  <!--
    `status`, not `alert`: nothing is wrong yet and Generate stays available. It is announced
    when it appears, which is the moment the user unticks Purlins — before Generate, not after
    Solve refuses.
  -->
  {#if stabilityNotice}
    <p class="notice" role="status" data-testid="gen-stability-notice">{stabilityNotice}</p>
  {/if}
  {#if bracingNotice}
    <p class="notice" role="status" data-testid="gen-bracing-notice">{bracingNotice}</p>
  {/if}

  <!-- ── Profiles, only for the roles this topology actually places ── -->
  {#if roles.length > 0}
    <h4>{t('generator.ui.profiles')}</h4>
    {#each roles as role (role)}
      <ProfilePicker
        {role}
        spec={profiles[role]}
        onChange={(next) => { profiles = { ...profiles, [role]: next }; }}
      />
    {/each}
  {/if}

  <!--
    ── The material, once, for every member the generator places ──

    One grade rather than one per role. A generated frame is fabricated from one steel, and a
    per-role material would be a modelling capability the generator has no use for — while the
    role-by-role CONSEQUENCE of the single choice, which sections that steel is not ordinarily
    rolled in, is reported below.
  -->
  <h4>{t('generator.ui.material')}</h4>
  <div class="grade-line" data-testid="gen-grade-line">
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
  <p class="grade-note" data-testid="gen-grade-scope">{t('generator.ui.materialScope')}</p>

  {#if gradeOpen}
    <GradePickerPanel
      selected={gradeId}
      onPick={(id) => { gradeId = id; gradeOpen = false; }}
      onClose={() => (gradeOpen = false)}
    />
  {/if}

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

  <!--
    The drawing and the count, both from the same topology object Generate then emits — so
    the picture, the numbers and the model agree by construction rather than by care.
  -->
  {#if topology}
    <div class="previews" data-testid="gen-previews">
      {#if frameElevation}
        <TopologyPreview
          topology={frameElevation}
          view="elevation"
          label={t('generator.ui.previewFrame')}
          heightPx={120}
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
          heightPx={195}
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

  <p class="warn">{t('generator.ui.replacesModel')}</p>

  <!--
    A disabled Generate says WHY, and says it to a screen reader too.

    `aria-describedby` points at whichever problem list is on screen, so the refusal is read with
    the button instead of being a grey rectangle whose reason lives somewhere above it.
  -->
  <button
    class="go"
    type="button"
    data-testid="gen-generate"
    disabled={!canGenerate}
    aria-describedby={paramProblems.length > 0 ? 'gen-param-problems'
      : profileProblems.length > 0 ? 'gen-profile-problems' : undefined}
    onclick={generate}
  >
    {t('generator.ui.generate')}
  </button>

  {#if lastResult}
    <p class="result" data-testid="gen-result" role="status">{lastResult}</p>
  {/if}

  <p class="model-note">
    {tp('generator.ui.currentModel', {
      nodes: modelStore.nodes.size, elements: modelStore.elements.size,
    })}
  </p>
</div>

<style>
  .gen { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; height: 100%; overflow-y: auto; }
  h3 { margin: 0; font-size: 0.86rem; font-weight: 600; }
  h4 { margin: 6px 0 2px; font-size: 0.74rem; font-weight: 600; color: var(--st-text-2); }
  .sub { margin: 2px 0 0; font-size: 0.7rem; color: var(--st-text-2); }
  .kinds { display: flex; gap: 4px; }
  .kinds button {
    flex: 1; padding: 4px 8px; font-size: 0.72rem; font-weight: 600; cursor: pointer;
    background: var(--st-surface-3); border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text);
  }
  .kinds button.active { background: var(--st-hair-strong); border-color: var(--st-interactive); }
  .kinds button:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
  .fields { display: flex; flex-direction: column; gap: 3px; }
  .fields label { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: var(--st-text-2); }
  .fields label > span:first-child { min-width: 9rem; }
  .fields input[type='number'], .fields select {
    background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3);
    border-radius: 3px; padding: 2px 4px; font-size: 0.7rem; width: 6rem; text-align: right;
  }
  .fields select { text-align: left; width: auto; min-width: 8rem; }
  .fields label.check > span { min-width: 0; }
  .fields input:focus-visible, .fields select:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
  .problems { margin: 0; padding-left: 16px; font-size: 0.68rem; color: var(--st-danger); }
  /* Warn, not error: the model will generate. `--st-warn` is the token that means exactly
     "this is going to cost you something", which is what an unsolvable roof is. */
  .notice {
    margin: 6px 0 0; font-size: 0.68rem; line-height: 1.45; color: var(--st-warn);
    border-left: 2px solid var(--st-warn); padding-left: 8px;
  }
  .previews { display: flex; flex-direction: column; gap: 6px; }
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
  .grade-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px; }
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
  .grade-note { margin: 0 0 6px; font-size: 0.6rem; color: var(--st-text-3); line-height: 1.35; }

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

  /* Field head: the name, and the line that says what the number controls. */
  .fname { font-size: 0.7rem; color: var(--st-text); }
  .fhint {
    display: block;
    font-size: 0.64rem;
    line-height: 1.35;
    color: var(--st-text-3);
    margin: 0.05rem 0 0.15rem;
  }
</style>
