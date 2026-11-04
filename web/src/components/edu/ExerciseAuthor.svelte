<script lang="ts">
  /**
   * Authoring an exercise from inside Stabileo.
   *
   * A teacher draws the structure with the tools that already exist, then says
   * here what to ask about it. Nothing is typed into a file and nothing is
   * written in a programming language.
   *
   * The structure gets no editor in this panel on purpose: the app IS a
   * structural editor, and building a second, worse one inside a sidebar would
   * be the wrong instinct. This reads the canvas.
   */
  import { modelStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { captureModel, toFile, fromFile, type CaptureWarning } from './exercise-capture';
  import {
    lintExercise, evaluateAnswer,
    type AnswerSpec, type DiagramShape, type EduExerciseSpec, type ForceKind, type StressMeasure,
  } from './exercise-spec';
  import { stressContext } from './exercise-stress';
  import { saveToLibrary, toShareLink } from './exercise-library';
  import { solveForEdu } from './edu-solver';
  import { ALL_PROFILES } from '../../lib/data/steel-profiles';
  import { EXERCISE_EXAMPLES, fromExample, fromFileDed, fromShareUrl, hasDrawnModel, detectKinematics } from './exercise-source';
  import FieldHelp from './FieldHelp.svelte';
  import {
    STEEL_GRADES, DEFAULT_GRADE, CHARACTERISTIC_PRESETS, STATIONS, suggestShapes,
  } from './exercise-presets';

  interface Props {
    onclose: () => void;
    onsaved: (ex: EduExerciseSpec) => void;
    /** Open the draft the way a student will see it, and come back after. */
    onpreview: (ex: EduExerciseSpec) => void;
    /** An exercise being edited, or null when starting fresh. */
    editing?: EduExerciseSpec | null;
  }
  let { onclose, onsaved, onpreview, editing = null }: Props = $props();

  // ── Metadata ───────────────────────────────────────────────
  let title = $state(editing?.title ?? '');
  let description = $state(editing?.description ?? '');
  let difficulty = $state<'easy' | 'medium' | 'hard'>(editing?.difficulty ?? 'easy');
  let category = $state<'statics' | 'strength' | 'advanced'>(editing?.category ?? 'statics');
  // Whether to ASK the classification — not what it is. The app works that out.
  let askKinematic = $state(!!editing?.kinematicQuestion);
  let detected = $state<{ classification: 'isostatic' | 'hyperstatic'; degree: number } | null>(
    editing?.kinematicQuestion
      ? { classification: editing.kinematicQuestion.classification, degree: editing.kinematicQuestion.degree ?? 0 }
      : null,
  );
  let profile = $state(editing?.model.profile ?? '');
  // Named grades rather than a bare number: 235 looked arbitrary and, in an
  // Argentine classroom, is not what anyone reaches for first.
  let gradeId = $state(
    STEEL_GRADES.find((g) => g.fy === editing?.model.fy)?.id ?? DEFAULT_GRADE.id,
  );
  let customFy = $state(editing?.model.fy ?? DEFAULT_GRADE.fy);
  const grade = $derived(STEEL_GRADES.find((g) => g.id === gradeId) ?? DEFAULT_GRADE);
  const fy = $derived(grade.id === 'custom' ? customFy : grade.fy);

  // ── Profile picker: family, then size ──────────────────────
  //
  // A datalist over seven hundred profiles was unusable. Choosing the family
  // first cuts it to a couple of dozen, which is how a catalogue is read.
  const families = $derived([...new Set(ALL_PROFILES.map((p) => p.family))]);
  let profileFamily = $state(
    ALL_PROFILES.find((p) => p.name === editing?.model.profile)?.family ?? '',
  );
  const familyProfiles = $derived(
    profileFamily ? ALL_PROFILES.filter((p) => p.family === profileFamily) : [],
  );

  // ── The structure ──────────────────────────────────────────
  let captured = $state<ReturnType<typeof captureModel> | null>(
    editing ? { spec: editing.model, warnings: [] } : null,
  );
  let warnings = $state<CaptureWarning[]>([]);

  // ── Where the structure comes from ─────────────────────────
  //
  // Four routes, because switching from Basic to Educational does not carry
  // the model across: a teacher who just built a frame arrives here with an
  // empty canvas. All four end with a model in the store, which `capture()`
  // then reads.
  let sourceTab = $state<'draw' | 'example' | 'file' | 'link'>('draw');
  let exampleId = $state(EXERCISE_EXAMPLES[0].id);
  let shareUrl = $state('');
  let sourceError = $state('');
  let sourceBusy = $state(false);
  let modelFileInput = $state<HTMLInputElement | undefined>();
  let exerciseFileInput = $state<HTMLInputElement | undefined>();

  async function useExample() {
    sourceBusy = true;
    const r = await fromExample(exampleId);
    sourceBusy = false;
    sourceError = r.ok ? '' : t('edu.author.errExample');
    if (r.ok) capture();
  }

  async function useFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    sourceBusy = true;
    const r = await fromFileDed(file);
    sourceBusy = false;
    sourceError = r.ok ? '' : sourceMessage(r.error);
    if (r.ok) capture();
  }

  function useLink() {
    const r = fromShareUrl(shareUrl);
    sourceError = r.ok ? '' : sourceMessage(r.error);
    if (r.ok) capture();
  }

  /** Error codes to sentences, exhaustively, so none can reach a teacher raw. */
  function sourceMessage(code: string): string {
    switch (code) {
      case 'errFileRead': return t('edu.author.errFileRead');
      case 'errNotDed': return t('edu.author.errNotDed');
      case 'errEmptyLink': return t('edu.author.errEmptyLink');
      case 'errNotShareLink': return t('edu.author.errNotShareLink');
      case 'errLinkBroken': return t('edu.author.errLinkBroken');
      default: return t('edu.author.errExample');
    }
  }

  function capture() {
    const r = captureModel(modelStore.model);
    captured = r;
    warnings = r.warnings;
    if (r.spec && askReactions.length === 0) {
      // One reaction question per support, pre-filled from that support's own
      // degrees of freedom — what a statics exercise asks first. Removable.
      askReactions = r.spec.supports.map((s, i) => ({
        node: s.node,
        label: `${t('edu.author.reactionAt')} ${String.fromCharCode(65 + i)}`,
        dofs: s.type === 'fixed' ? ['Rx', 'Ry', 'M'] : s.type === 'pinned' ? ['Rx', 'Ry'] : ['Ry'],
      }));
    }
    // Whatever the structure is, the app can say how it is classified — so it
    // does, instead of asking the teacher for the answer to their own question.
    detected = detectKinematics();
    if (r.spec && shapeQs.length === 0) {
      /*
       * Suggested, not imposed — and the suggestion now reads the KIND of
       * distributed load, not merely whether there is one. A load that varies
       * along the member (qI ≠ qJ) raises the whole chain a further power:
       * quadratic shear, cubic moment. Offering "quadratic moment" there was
       * inviting the mistake the question exists to catch.
       */
      const dist = r.spec.distributedLoads ?? [];
      const varying = dist.some((d) => Math.abs((d.qJ ?? d.qI) - d.qI) > 1e-9);
      shapeQs = suggestShapes(varying ? 'varying' : dist.length ? 'uniform' : 'none') as never;
    }
  }

  /** Add a preset question in one click, with its label and unit already right. */
  function addPreset(id: string) {
    const p = CHARACTERISTIC_PRESETS.find((x) => x.id === id);
    if (!p) return;
    characteristics = [...characteristics, fromAnswer(p.label, p.unit, p.answer)];
  }

  // ── Questions ──────────────────────────────────────────────
  type CharRow = { label: string; unit: string; source: 'force' | 'stress'; force: ForceKind; measure: StressMeasure; scope: 'all' | 'element'; element: number; t: number };

  let askReactions = $state<Array<{ node: number; label: string; dofs: Array<'Rx' | 'Ry' | 'M'> }>>(
    editing?.supports.map((s) => ({ node: s.nodeIndex, label: s.label, dofs: [...s.dofs] })) ?? [],
  );
  let characteristics = $state<CharRow[]>(
    editing?.characteristics.map((c) => fromAnswer(c.label, c.unit, c.answer)) ?? [],
  );
  let diagramQs = $state<Array<{ question: string; unit: string; force: ForceKind; element: number; t: number }>>(
    editing?.diagramQuestions.map((q) => ({
      question: q.question, unit: q.unit,
      force: q.answer.kind === 'at' ? q.answer.force : 'moment',
      element: q.answer.kind === 'at' ? q.answer.element : 0,
      t: q.answer.kind === 'at' ? q.answer.t : 0,
    })) ?? [],
  );
  // The shape list is spelled once, in the spec — repeating it here is how it
  // came to be missing `cubic` on one side of the boundary.
  let shapeQs = $state<Array<{ diagram: 'N' | 'V' | 'M'; correct: DiagramShape }>>(
    editing?.diagramShapeQuestions?.map((q) => ({ ...q })) ?? [],
  );
  let givens = $state<Array<{ label: string; value: string }>>(
    editing?.sectionData?.map((d) => ({ ...d })) ?? [],
  );

  /** Reverse the answer→row mapping so editing an exercise shows what it says. */
  function fromAnswer(label: string, unit: string, a: AnswerSpec): CharRow {
    const base: CharRow = { label, unit, source: 'force', force: 'moment', measure: 'sigmaMax', scope: 'all', element: 0, t: 0 };
    if (a.kind === 'maxAbs') return { ...base, force: a.force, scope: a.elements ? 'element' : 'all', element: a.elements?.[0] ?? 0 };
    if (a.kind === 'stress') return { ...base, source: 'stress', measure: a.measure, element: a.element, t: a.t };
    return base;
  }

  function answerOf(c: CharRow): AnswerSpec {
    if (c.source === 'stress') {
      return { kind: 'stress', measure: c.measure, element: c.element, t: c.t };
    }
    return c.scope === 'all'
      ? { kind: 'maxAbs', force: c.force }
      : { kind: 'maxAbs', force: c.force, elements: [c.element] };
  }

  const addDiagram = () => (diagramQs = [...diagramQs, { question: '', unit: 'kN·m', force: 'moment', element: 0, t: 0 }]);
  const addShape = () => (shapeQs = [...shapeQs, { diagram: 'M', correct: 'linear' }]);

  /*
   * Diagrams the student DRAWS rather than names.
   *
   * Nothing to configure but which one: the answer is the solve, so there is
   * no correct sketch to store and no way for a teacher to state it wrongly.
   */
  let sketchQs = $state<Array<{ diagram: 'N' | 'V' | 'M' | 'D' }>>(
    (editing?.diagramSketchQuestions ?? []).map((q) => ({ diagram: q.diagram })),
  );
  const addSketch = () => (sketchQs = [...sketchQs, { diagram: 'M' }]);

  /** Practice lets a stuck student see the value; an assessment does not. */
  let allowReveal = $state(editing?.allowReveal !== false);
  const addGiven = () => (givens = [...givens, { label: '', value: '' }]);

  /** Everything declared, assembled into one exercise. */
  const draft = $derived.by((): EduExerciseSpec | null => {
    if (!captured?.spec) return null;
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      // Editing keeps the original id, so saving replaces rather than clones.
      id: editing?.id ?? (slug || `exercise-${Date.now()}`),
      title: title.trim() || t('edu.author.untitled'),
      description: description.trim(),
      difficulty,
      category,
      model: {
        ...captured.spec,
        profile: profile.trim() || undefined,
        fy: profile.trim() ? fy : undefined,
      },
      supports: askReactions.map((r) => ({ label: r.label, nodeIndex: r.node, dofs: r.dofs })),
      characteristics: characteristics.map((c) => ({ label: c.label, unit: c.unit, answer: answerOf(c) })),
      diagramQuestions: diagramQs.map((q) => ({
        question: q.question, unit: q.unit,
        answer: { kind: 'at', force: q.force, element: q.element, t: q.t },
      })),
      kinematicQuestion: askKinematic && detected
        ? { classification: detected.classification, degree: detected.degree || undefined }
        : undefined,
      diagramShapeQuestions: shapeQs.length ? shapeQs : undefined,
      diagramSketchQuestions: sketchQs.length ? sketchQs : undefined,
      allowReveal,
      sectionData: givens.filter((g) => g.label.trim()).length ? givens.filter((g) => g.label.trim()) : undefined,
    };
  });

  const problems = $derived(draft ? lintExercise(draft) : []);
  const hasQuestions = $derived(
    (draft?.supports.length ?? 0) + (draft?.characteristics.length ?? 0) +
    (draft?.diagramQuestions.length ?? 0) + (draft?.diagramShapeQuestions?.length ?? 0) > 0,
  );

  // ── Preview ────────────────────────────────────────────────
  //
  // The most useful thing an authoring tool can show: what a class will be
  // marked against. A teacher who sees a wrong number catches it now.
  let previewed = $state<Array<{ label: string; value: number | null; unit: string }> | null>(null);
  let previewNote = $state('');

  function preview() {
    if (!draft) return;
    solveForEdu();
    const forces = resultsStore.results?.elementForces ?? null;
    if (!forces) {
      previewed = null;
      previewNote = t('edu.author.solveFailed');
      return;
    }
    const ctx = stressContext(draft.model.profile, draft.model.fy);
    previewNote = '';
    previewed = [
      ...draft.characteristics.map((c) => ({ label: c.label, value: evaluateAnswer(c.answer, forces, ctx), unit: c.unit })),
      ...draft.diagramQuestions.map((q) => ({
        label: q.question || t('edu.author.diagramQuestion'),
        value: evaluateAnswer(q.answer, forces, ctx),
        unit: q.unit,
      })),
    ];
  }

  // ── Saving ─────────────────────────────────────────────────
  let saveMsg = $state('');
  let shareLink = $state('');

  function save() {
    if (!draft) return;
    const { ok } = saveToLibrary(draft);
    saveMsg = ok ? t('edu.author.saved') : t('edu.author.saveFailed');
    if (ok) onsaved(draft);
  }

  function download() {
    if (!draft) return;
    const blob = new Blob([toFile(draft)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.id}.stabileo-ej.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function share() {
    if (!draft) return;
    shareLink = toShareLink(draft, location.origin + location.pathname);
    navigator.clipboard?.writeText(shareLink).catch(() => {});
  }

  let importError = $state('');
  function openFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const r = fromFile(text);
      if (!r.ok) { importError = r.error; return; }
      importError = '';
      onsaved(r.exercise);
    });
  }

  const elementCount = $derived(captured?.spec?.elements.length ?? 0);
</script>

<div class="author">
  <div class="author-head">
    <h3>{editing ? t('edu.author.editTitle') : t('edu.author.title')}</h3>
    <button class="author-close" onclick={onclose} aria-label={t('edu.back')}>&#x2715;</button>
  </div>
  <p class="author-intro">{t('edu.author.intro')}</p>

  <!-- 1 · Where the structure comes from -->
  <section>
    <h4>1 · {t('edu.author.structure')}</h4>

    <!-- Written out rather than looped over a key list: a translation key
         assembled by concatenation cannot be found by searching for it. -->
    <div class="source-tabs">
      <button class="src-tab" class:active={sourceTab === 'draw'}
        onclick={() => { sourceTab = 'draw'; sourceError = ''; }}>{t('edu.author.srcDraw')}</button>
      <button class="src-tab" class:active={sourceTab === 'example'}
        onclick={() => { sourceTab = 'example'; sourceError = ''; }}>{t('edu.author.srcExample')}</button>
      <button class="src-tab" class:active={sourceTab === 'file'}
        onclick={() => { sourceTab = 'file'; sourceError = ''; }}>{t('edu.author.srcFile')}</button>
      <button class="src-tab" class:active={sourceTab === 'link'}
        onclick={() => { sourceTab = 'link'; sourceError = ''; }}>{t('edu.author.srcLink')}</button>
    </div>

    {#if sourceTab === 'draw'}
      <p class="hint">{t('edu.author.drawHint')}</p>
      <button class="btn-primary" onclick={capture} disabled={!hasDrawnModel()}>
        {t('edu.author.capture')}
      </button>
      <!-- Only when there is nothing at all: a captured structure with an
           empty canvas is a state this panel reaches on its own, and saying
           "nothing drawn yet" underneath its own summary of what was drawn
           reads as a contradiction. -->
      {#if !hasDrawnModel() && !captured}<p class="hint">{t('edu.author.nothingDrawn')}</p>{/if}
    {:else if sourceTab === 'example'}
      <p class="hint">{t('edu.author.exampleHint')}</p>
      <div class="row">
        <select bind:value={exampleId}>
          {#each EXERCISE_EXAMPLES as ex}<option value={ex.id}>{t(ex.nameKey)}</option>{/each}
        </select>
        <button class="btn-primary" onclick={useExample} disabled={sourceBusy}>
          {t('edu.author.load')}
        </button>
      </div>
    {:else if sourceTab === 'file'}
      <p class="hint">{t('edu.author.fileHint')}</p>
      <!-- A native file input renders as a white system button that belongs
           to no design system, labelled "Choose File" — which says nothing
           about which file. Hidden behind a button that names it. -->
      <div class="row">
        <button class="btn-ghost" onclick={() => modelFileInput?.click()}>{t('edu.author.chooseModelFile')}</button>
        <FieldHelp what={t('edu.author.helpModelFileWhat')} example={t('edu.author.helpModelFileEx')} />
      </div>
      <input bind:this={modelFileInput} type="file" accept=".ded,.json" style="display:none" onchange={useFile} />
    {:else}
      <p class="hint">{t('edu.author.linkHint')}</p>
      <div class="row">
        <input type="text" bind:value={shareUrl} placeholder="https://stabileo.com/#data=..." />
        <button class="btn-primary" onclick={useLink}>{t('edu.author.load')}</button>
      </div>
    {/if}

    {#if sourceError}<p class="warn">⚠ {sourceError}</p>{/if}

    {#if captured?.spec}
      <p class="summary">
        {captured.spec.nodes.length} {t('edu.author.nodes')} ·
        {captured.spec.elements.length} {t('edu.author.elements')} ·
        {captured.spec.supports.length} {t('edu.author.supports')}
      </p>
    {/if}
    {#each warnings as w}<p class="warn">⚠ {w.detail}</p>{/each}
  </section>

  {#if captured?.spec}
    <!-- 2 · What it is -->
    <section>
      <h4>2 · {t('edu.author.about')}</h4>
      <label>{t('edu.author.exTitle')}<input type="text" bind:value={title} /></label>
      <label>{t('edu.author.exDesc')}<textarea rows="2" bind:value={description}></textarea></label>
      <div class="row">
        <label>{t('edu.author.difficulty')}
          <select bind:value={difficulty}>
            <option value="easy">{t('edu.easy')}</option>
            <option value="medium">{t('edu.medium')}</option>
            <option value="hard">{t('edu.hard')}</option>
          </select>
        </label>
        <label>{t('edu.author.category')}
          <select bind:value={category}>
            <option value="statics">{t('edu.sectionStatics')}</option>
            <option value="strength">{t('edu.sectionStrength')}</option>
            <option value="advanced">{t('edu.sectionAdvanced')}</option>
          </select>
        </label>
      </div>
      <div class="field-head">
        <span class="field-label">{t('edu.author.profile')}</span>
        <FieldHelp
          what={t('edu.author.helpProfileWhat')}
          example={t('edu.author.helpProfileEx')}
        />
      </div>
      <div class="row">
        <select bind:value={profileFamily} onchange={() => (profile = '')}>
          <option value="">{t('edu.author.profileNone')}</option>
          {#each families as f}<option value={f}>{f}</option>{/each}
        </select>
        {#if profileFamily}
          <select bind:value={profile}>
            <option value="">{t('edu.author.pickSize')}</option>
            {#each familyProfiles as p}<option value={p.name}>{p.name}</option>{/each}
          </select>
        {/if}
      </div>
      {#if profile.trim()}
        <div class="field-head">
          <span class="field-label">{t('edu.author.steel')}</span>
          <FieldHelp what={t('edu.author.helpSteelWhat')} example={t(grade.noteKey)} />
        </div>
        <div class="row">
          <select bind:value={gradeId}>
            {#each STEEL_GRADES as g}
              <option value={g.id}>{g.label}{g.fy ? ` — fy ${g.fy} MPa` : ''}</option>
            {/each}
          </select>
          {#if grade.id === 'custom'}
            <input type="number" class="num" bind:value={customFy} /> <span class="unit-lbl">MPa</span>
          {/if}
        </div>
      {:else}
        <p class="hint">{t('edu.author.profileHint')}</p>
      {/if}
    </section>

    <!-- 3 · The data the student is given -->
    <section>
      <h4>3 · {t('edu.author.givens')}</h4>
      {#each givens as g, i}
        <div class="row">
          <input type="text" bind:value={g.label} placeholder="E" />
          <input type="text" bind:value={g.value} placeholder="200 000 MPa" />
          <button class="btn-del" onclick={() => (givens = givens.filter((_, k) => k !== i))} aria-label="✕">✕</button>
        </div>
      {/each}
      <button class="btn-add" onclick={addGiven}>+ {t('edu.author.add')}</button>
    </section>

    <!-- 4 · What to ask -->
    <section>
      <h4>4 · {t('edu.author.questions')}</h4>

      <!--
        Practice or assessment, decided here rather than assumed.
        ────────────────────────────────────────────────────────
        A stuck student being able to ask for the value is the right default
        for homework and exactly wrong for a test. It sits at the top of the
        questions because it applies to all of them.
      -->
      <div class="qgroup">
        <div class="field-head">
          <span class="qlabel">{t('edu.author.marking')}</span>
          <FieldHelp what={t('edu.author.allowRevealHelpWhat')} example={t('edu.author.allowRevealHelpEx')} />
        </div>
        <label class="chk wide">
          <input type="checkbox" bind:checked={allowReveal} data-testid="author-allow-reveal" />
          {t('edu.author.allowReveal')}
        </label>
      </div>

      <div class="qgroup">
        <span class="qlabel">{t('edu.author.reactions')}</span>
        {#each askReactions as r, i}
          <div class="row">
            <input type="text" bind:value={r.label} />
            {#each ['Rx', 'Ry', 'M'] as dof}
              <label class="chk">
                <input type="checkbox" checked={r.dofs.includes(dof as never)}
                  onchange={(e) => {
                    r.dofs = e.currentTarget.checked
                      ? [...r.dofs, dof as never]
                      : r.dofs.filter((d) => d !== dof);
                    askReactions = [...askReactions];
                  }} />{dof}
              </label>
            {/each}
            <button class="btn-del" onclick={() => (askReactions = askReactions.filter((_, k) => k !== i))} aria-label="✕">✕</button>
          </div>
        {/each}
      </div>

      <div class="qgroup">
        <div class="field-head">
          <span class="qlabel">{t('edu.author.characteristics')}</span>
          <FieldHelp what={t('edu.author.helpCharWhat')} example={t('edu.author.helpCharEx')} />
        </div>
        <!-- One click for the questions that are actually asked. The full form
             stays underneath for anything unusual. -->
        <div class="presets">
          {#each CHARACTERISTIC_PRESETS as p}
            <button class="preset" disabled={p.needsProfile && !profile.trim()}
              title={p.needsProfile && !profile.trim() ? t('edu.author.needsProfile') : ''}
              onclick={() => addPreset(p.id)}>+ {p.label}</button>
          {/each}
        </div>
        {#each characteristics as c, i}
          <div class="qrow">
            <div class="row">
              <input type="text" bind:value={c.label} placeholder="Mmax" />
              <input type="text" class="unit" bind:value={c.unit} />
              <button class="btn-del" onclick={() => (characteristics = characteristics.filter((_, k) => k !== i))} aria-label="✕">✕</button>
            </div>
            <div class="row sub">
              <select bind:value={c.source}>
                <option value="force">{t('edu.author.internalForce')}</option>
                <option value="stress" disabled={!profile.trim()}>{t('edu.author.stress')}</option>
              </select>
              {#if c.source === 'force'}
                <select bind:value={c.force}>
                  <option value="moment">{t('edu.author.moment')}</option>
                  <option value="shear">{t('edu.author.shear')}</option>
                  <option value="axial">{t('edu.author.axial')}</option>
                </select>
                <select bind:value={c.scope}>
                  <option value="all">{t('edu.author.wholeStructure')}</option>
                  <option value="element">{t('edu.author.oneMember')}</option>
                </select>
                {#if c.scope === 'element'}
                  <select value={c.element} onchange={(e) => (c.element = Number(e.currentTarget.value))}>
                    {#each Array(elementCount) as _, k}
                      <option value={k}>{t('edu.author.member')} {k + 1}</option>
                    {/each}
                  </select>
                {/if}
              {:else}
                <select bind:value={c.measure}>
                  <option value="sigmaMax">σmax</option>
                  <option value="sigmaMin">σmin</option>
                  <option value="tauMax">τmax</option>
                  <option value="vonMises">von Mises</option>
                </select>
                <select value={c.element} onchange={(e) => (c.element = Number(e.currentTarget.value))}>
                  {#each Array(elementCount) as _, k}
                    <option value={k}>{t('edu.author.member')} {k + 1}</option>
                  {/each}
                </select>
                <select bind:value={c.t}>
                  {#each STATIONS as st}<option value={st.t}>{t(st.key)}</option>{/each}
                </select>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="qgroup">
        <div class="field-head">
          <span class="qlabel">{t('edu.author.diagramQuestions')}</span>
          <FieldHelp what={t('edu.author.helpDiagWhat')} example={t('edu.author.helpDiagEx')} />
        </div>
        {#each diagramQs as q, i}
          <div class="qrow">
            <div class="row">
              <input type="text" bind:value={q.question} placeholder={t('edu.author.questionText')} />
              <input type="text" class="unit" bind:value={q.unit} />
              <button class="btn-del" onclick={() => (diagramQs = diagramQs.filter((_, k) => k !== i))} aria-label="✕">✕</button>
            </div>
            <div class="row sub">
              <select bind:value={q.force}>
                <option value="moment">{t('edu.author.moment')}</option>
                <option value="shear">{t('edu.author.shear')}</option>
                <option value="axial">{t('edu.author.axial')}</option>
              </select>
              <select value={q.element} onchange={(e) => (q.element = Number(e.currentTarget.value))}>
                {#each Array(elementCount) as _, k}
                  <option value={k}>{t('edu.author.member')} {k + 1}</option>
                {/each}
              </select>
              <select bind:value={q.t}>
                {#each STATIONS as st}<option value={st.t}>{t(st.key)}</option>{/each}
              </select>
            </div>
          </div>
        {/each}
        <button class="btn-add" onclick={addDiagram}>+ {t('edu.author.add')}</button>
      </div>

      <div class="qgroup">
        <div class="field-head">
          <span class="qlabel">{t('edu.author.shapes')}</span>
          <FieldHelp what={t('edu.author.helpShapeWhat')} example={t('edu.author.helpShapeEx')} />
        </div>
        {#each shapeQs as sq, i}
          <div class="row">
            <select bind:value={sq.diagram}>
              <option value="N">{t('edu.author.axial')} (N)</option>
              <option value="V">{t('edu.author.shear')} (V)</option>
              <option value="M">{t('edu.author.moment')} (M)</option>
            </select>
            <select bind:value={sq.correct}>
              <option value="zero">{t('edu.shape.zero')}</option>
              <option value="constant">{t('edu.shape.constant')}</option>
              <option value="linear">{t('edu.shape.linear')}</option>
              <option value="quadratic">{t('edu.shape.quadratic')}</option>
              <option value="cubic">{t('edu.shape.cubic')}</option>
            </select>
            <button class="btn-del" onclick={() => (shapeQs = shapeQs.filter((_, k) => k !== i))} aria-label="✕">✕</button>
          </div>
        {/each}
        <button class="btn-add" onclick={addShape}>+ {t('edu.author.add')}</button>
      </div>

      <!--
        Drawing the diagram sits directly under naming its shape, because it
        is the same question asked properly and a teacher looking for one will
        look here for the other.
      -->
      <div class="qgroup">
        <div class="field-head">
          <span class="qlabel">{t('edu.author.sketchTitle')}</span>
          <FieldHelp what={t('edu.author.sketchHelpWhat')} example={t('edu.author.sketchHelpEx')} />
        </div>
        {#each sketchQs as sq, i}
          <div class="row">
            <select bind:value={sq.diagram} data-testid="author-sketch-diagram-{i}">
              <option value="N">{t('edu.author.axial')} (N)</option>
              <option value="V">{t('edu.author.shear')} (V)</option>
              <option value="M">{t('edu.author.moment')} (M)</option>
              <!-- One power above the moment, every time. -->
              <option value="D">{t('edu.author.deflected')}</option>
            </select>
            <button class="btn-del" onclick={() => (sketchQs = sketchQs.filter((_, k) => k !== i))} aria-label="✕">✕</button>
          </div>
        {/each}
        <button class="btn-add" onclick={addSketch} data-testid="author-add-sketch">+ {t('edu.author.add')}</button>
      </div>

      <div class="qgroup">
        <div class="field-head">
          <span class="qlabel">{t('edu.author.kinematic')}</span>
          <FieldHelp what={t('edu.author.helpKinWhat')} example={t('edu.author.helpKinEx')} />
        </div>
        <!-- Detected, not typed. Asking a teacher to state the degree of
             indeterminacy is asking for the ANSWER to their own question, and
             a slip there marks a whole class against a mistake. -->
        {#if detected}
          <label class="chk wide">
            <input type="checkbox" bind:checked={askKinematic} />
            {t('edu.author.askKinematic')}
          </label>
          <p class="detected">
            {t('edu.author.detected')}:
            <strong>{detected.classification === 'isostatic' ? t('edu.isostatic') : t('edu.hyperstatic')}</strong>
            {#if detected.degree > 0}· {t('edu.author.degree')} {detected.degree}{/if}
          </p>
        {:else}
          <p class="hint">{t('edu.author.kinUnavailable')}</p>
        {/if}
      </div>
    </section>

    <!-- 5 · What the class will be marked against -->
    <section>
      <h4>5 · {t('edu.author.check')}</h4>
      <button class="btn-primary" onclick={preview}>{t('edu.author.solveAndShow')}</button>
      {#if previewNote}<p class="warn">⚠ {previewNote}</p>{/if}
      {#if previewed}
        {#if previewed.length === 0}
          <p class="hint">{t('edu.author.nothingToCheck')}</p>
        {:else}
          <table class="preview">
            <tbody>
              {#each previewed as p}
                <tr>
                  <td>{p.label}</td>
                  <td class="val" class:bad={p.value === null}>
                    {p.value === null ? t('edu.author.cannotEvaluate') : `${p.value.toFixed(3)} ${p.unit}`}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="hint">{t('edu.author.previewHint')}</p>
        {/if}
      {/if}
      {#each problems as p}<p class="warn">⚠ {p}</p>{/each}
      {#if !hasQuestions}<p class="warn">⚠ {t('edu.author.noQuestions')}</p>{/if}
    </section>

    <!-- 6 · Keep it -->
    <section>
      <h4>6 · {t('edu.author.save')}</h4>
      <div class="row">
        <button class="btn-primary" onclick={save} disabled={problems.length > 0 || !hasQuestions}>
          {t('edu.author.saveToLibrary')}
        </button>
        <!--
          Seeing it as a student is not the same as seeing the answers.
          `preview` above computes what the right values are — useful, but it
          is the teacher's view. This opens the exercise itself: the stepper,
          the empty inputs, the wording as it will be read.
        -->
        <button
          class="btn-ghost"
          onclick={() => draft && onpreview(draft)}
          disabled={problems.length > 0 || !hasQuestions}
          data-testid="edu-preview-student"
        >{t('edu.author.previewAsStudent')}</button>
        <button class="btn-ghost" onclick={download} disabled={problems.length > 0}>{t('edu.author.download')}</button>
        <button class="btn-ghost" onclick={share} disabled={problems.length > 0}>{t('edu.author.share')}</button>
      </div>
      {#if saveMsg}<p class="ok">{saveMsg}</p>{/if}
      {#if shareLink}
        <p class="hint">{t('edu.author.linkCopied')}</p>
        <input class="link" type="text" readonly value={shareLink} />
      {/if}
      {#if problems.length > 0 || !hasQuestions}
        <p class="hint">{t('edu.author.fixFirst')}</p>
      {/if}
    </section>
  {/if}

  <section class="open-section">
    <h4>{t('edu.author.openExisting')}</h4>
    <div class="row">
      <button class="btn-ghost" onclick={() => exerciseFileInput?.click()}>{t('edu.author.chooseExerciseFile')}</button>
      <FieldHelp what={t('edu.author.helpExerciseFileWhat')} example={t('edu.author.helpExerciseFileEx')} />
    </div>
    <input bind:this={exerciseFileInput} type="file" accept=".json" style="display:none" onchange={openFile} />
    {#if importError}<p class="warn">⚠ {importError}</p>{/if}
  </section>
</div>

<style>
  /*
    The authoring panel speaks the application's visual language.
    ────────────────────────────────────────────────────────────
    It was written before the design system landed and kept its own palette:
    near-black greys that belong to no surface in the app, and a turquoise
    doing four different jobs — a heading, an active tab, a primary button and
    a computed value. Here the turquoise means one thing (a value the app
    worked out), the accent means "the thing you are doing", and every grey is
    a named surface or a text tier.
  */
  .author {
    padding: 12px 14px;
    color: var(--st-text);
    font-family: var(--st-sans);
    font-size: 0.8rem;
    overflow-y: auto;
    height: 100%;
  }

  .author-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .author-head h3 {
    margin: 0;
    font-family: var(--st-display);
    font-size: 0.9rem;
    color: var(--st-text);
  }

  .author-close {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.9rem;
  }

  .author-close:hover { color: var(--st-text); }

  .author-intro {
    color: var(--st-text-3);
    font-size: 0.72rem;
    line-height: 1.45;
    margin: 0 0 12px;
  }

  /* Where the structure comes from: four routes, one selected. */
  .source-tabs { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }

  .src-tab {
    background: none;
    border: 1px solid var(--st-hair);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    padding: 3px 9px;
    border-radius: var(--st-radius);
    cursor: pointer;
    font-size: 0.71rem;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .src-tab:hover { border-color: var(--st-hair-strong); color: var(--st-text); }

  .src-tab.active {
    background: var(--st-accent);
    border-color: var(--st-accent);
    color: var(--st-text-on-accent);
    font-weight: 600;
  }

  section { border-top: 1px solid var(--st-hair); padding: 10px 0; }

  /* Numbered section headings, in the same mono the rest of the app uses. */
  h4 {
    margin: 0 0 8px;
    font-family: var(--st-mono);
    font-size: 0.66rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  label { display: block; margin-bottom: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  label input[type='text'], label input[type='number'], label textarea, label select { width: 100%; margin-top: 2px; }

  input[type='text'], input[type='number'], textarea, select {
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    color: var(--st-text);
    font-family: var(--st-sans);
    padding: 3px 6px;
    border-radius: var(--st-radius);
    font-size: 0.74rem;
  }

  input[type='text']:focus, input[type='number']:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--st-focus);
  }

  .row { display: flex; gap: 6px; align-items: center; margin-bottom: 5px; flex-wrap: wrap; }
  .row > label { margin: 0; flex: 1; }
  .row input[type='text'] { flex: 1; min-width: 80px; }
  .unit { width: 62px; flex: none !important; }
  .num { width: 52px; }
  .chk { display: flex; align-items: center; gap: 3px; margin: 0; font-size: 0.7rem; }
  .chk input[type='checkbox'] { accent-color: var(--st-accent); }
  .qgroup { margin-bottom: 12px; }
  .field-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
  .field-label { font-size: 0.72rem; color: var(--st-text-2); }

  .presets { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 7px; }

  .preset {
    background: none;
    border: 1px solid var(--st-hair);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    padding: 2px 8px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 0.7rem;
    transition: border-color 0.12s, color 0.12s;
  }

  .preset:hover:not(:disabled) { border-color: var(--st-hair-strong); color: var(--st-text); }
  .preset:disabled { color: var(--st-text-3); border-color: var(--st-hair); opacity: 0.5; cursor: not-allowed; }

  .qrow { border-left: 2px solid var(--st-hair); padding-left: 7px; margin-bottom: 7px; }
  .row.sub { margin-bottom: 0; }
  .row.sub select { font-size: 0.71rem; }
  .chk.wide { font-size: 0.73rem; color: var(--st-text-2); margin-bottom: 5px; }

  /* Something the app worked out from the drawing, not something typed. */
  .detected {
    margin: 0;
    padding: 5px 8px;
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    border-left: 2px solid var(--st-value);
    color: var(--st-text-2);
    font-size: 0.7rem;
  }

  .detected strong { color: var(--st-value); font-weight: 600; }

  .unit-lbl { color: var(--st-text-3); font-size: 0.7rem; }

  .qlabel {
    display: block;
    font-family: var(--st-mono);
    font-size: 0.62rem;
    color: var(--st-text-3);
    text-transform: uppercase;
    letter-spacing: 0.09em;
    margin-bottom: 4px;
  }

  /* The action of the step is on the accent; everything beside it is hairline. */
  .btn-primary {
    background: var(--st-accent);
    border: 1px solid var(--st-accent);
    color: var(--st-text-on-accent);
    font-family: var(--st-sans);
    font-weight: 600;
    padding: 5px 12px;
    border-radius: var(--st-radius);
    cursor: pointer;
    font-size: 0.75rem;
    transition: background 0.12s, border-color 0.12s;
  }

  .btn-primary:hover:not(:disabled) { background: var(--st-accent-hover); border-color: var(--st-accent-hover); }

  .btn-primary:disabled {
    background: none;
    border-color: var(--st-hair);
    color: var(--st-text-3);
    cursor: not-allowed;
  }

  .btn-ghost {
    background: none;
    border: 1px solid var(--st-hair);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    padding: 5px 10px;
    border-radius: var(--st-radius);
    cursor: pointer;
    font-size: 0.73rem;
    transition: border-color 0.12s, color 0.12s;
  }

  .btn-ghost:hover:not(:disabled) { border-color: var(--st-hair-strong); color: var(--st-text); }
  .btn-ghost:disabled { color: var(--st-text-3); border-color: var(--st-hair); opacity: 0.5; cursor: not-allowed; }

  .btn-add {
    background: none;
    border: 1px dashed var(--st-hair-strong);
    color: var(--st-text-3);
    font-family: var(--st-sans);
    padding: 3px 8px;
    border-radius: var(--st-radius);
    cursor: pointer;
    font-size: 0.7rem;
  }

  .btn-add:hover { color: var(--st-text); border-color: var(--st-text-3); }

  .btn-del {
    background: none;
    border: none;
    color: var(--st-danger);
    font-family: var(--st-sans);
    cursor: pointer;
    font-size: 0.7rem;
  }

  .summary {
    color: var(--st-value);
    font-family: var(--st-mono);
    font-size: 0.72rem;
    margin: 6px 0 0;
  }

  .warn { color: var(--st-warn); font-size: 0.7rem; line-height: 1.4; margin: 5px 0 0; }
  .ok { color: var(--st-ok); font-size: 0.72rem; margin: 6px 0 0; }
  .hint { color: var(--st-text-3); font-size: 0.68rem; margin: 5px 0 0; line-height: 1.4; }

  .link { width: 100%; margin-top: 4px; font-size: 0.65rem; font-family: var(--st-mono); }

  .preview { width: 100%; margin-top: 8px; border-collapse: collapse; }
  .preview td { padding: 3px 4px; border-bottom: 1px solid var(--st-hair); font-size: 0.72rem; }
  .preview .val { text-align: right; font-family: var(--st-mono); color: var(--st-value); }
  .preview .val.bad { color: var(--st-warn); }

  .open-section { border-top: 1px solid var(--st-hair); }
</style>
