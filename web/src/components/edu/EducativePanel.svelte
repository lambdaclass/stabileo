<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { returnBorrowedModel } from './exercise-session';
  import { getExerciseSections, type EduExercise } from './exercises';
  import EduExerciseView from './EduExerciseView.svelte';
  import { t } from '../../lib/i18n';
  import { solveForEdu } from './edu-solver';
  import { isSolverReady } from '../../lib/engine/wasm-solver';
  import { eduStore } from './edu-store.svelte';
  import ExerciseAuthor from './ExerciseAuthor.svelte';
  import { buildFromSpec, evaluateAnswer, type AnswerContext, type EduExerciseSpec } from './exercise-spec';
  import { stressContext } from './exercise-stress';
  import { loadLibrary, removeFromLibrary, saveToLibrary, fromShareLink } from './exercise-library';
  import SubmissionReview from './SubmissionReview.svelte';
  import FieldHelp from './FieldHelp.svelte';
  import { fromSubmissionCode, fromSubmissionFile, type Submission } from './exercise-submission';

  /** Teacher-authored exercises, restored from the library on mount.
   *  `authoring` lives in the store because the shell mounts the drawing
   *  tools off it — see edu-store. */
  let editingSpec = $state<EduExerciseSpec | null>(null);
  /** The draft a teacher is looking at as a student — going back returns to
   *  the form with the same draft, not to the exercise list. */
  let previewingSpec = $state<EduExerciseSpec | null>(null);
  let library = $state<EduExerciseSpec[]>([]);
  let linkNotice = $state('');

  // ── Collecting what students hand back ────────────────────────
  //
  // A file for a campus upload, a code for a chat window. Both end at the
  // same reader, so both land in `openedSubmission`.
  let openedSubmission = $state<Submission | null>(null);
  let submissionError = $state('');
  let pastedCode = $state('');
  let submissionFileInput = $state<HTMLInputElement | undefined>();

  /** Error codes to sentences, so a truncated download never reaches a
   *  teacher as a raw identifier. */
  function submissionMessage(code: string): string {
    switch (code) {
      case 'notJson': return t('edu.review.errNotJson');
      case 'notSubmission': return t('edu.review.errNotSubmission');
      case 'incomplete': return t('edu.review.errIncomplete');
      case 'emptyCode': return t('edu.review.errEmptyCode');
      case 'damagedCode': return t('edu.review.errDamagedCode');
      default: return t('edu.review.errNotSubmission');
    }
  }

  function openSubmissionFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const r = fromSubmissionFile(text);
      if (r.ok) { openedSubmission = r.submission; submissionError = ''; }
      else { openedSubmission = null; submissionError = submissionMessage(r.error); }
      input.value = '';
    });
  }

  function openSubmissionCode() {
    const r = fromSubmissionCode(pastedCode);
    if (r.ok) { openedSubmission = r.submission; submissionError = ''; pastedCode = ''; }
    else { openedSubmission = null; submissionError = submissionMessage(r.error); }
  }

  $effect(() => {
    library = loadLibrary();
    /*
     * A link hands over ONE exercise, so it opens it.
     *
     * It used to drop the exercise into the library and leave the student on
     * the list, looking for the thing they had just been sent among a dozen
     * built-in ones. The link is the teacher saying "solve this"; the window
     * says the same from the first frame, and `markHandout` is what tells the
     * rest of the shell that this is a student's workspace and not a browsing
     * session.
     */
    const shared = fromShareLink(location.hash);
    if (shared) {
      if (shared.ok) {
        const { library: next } = saveToLibrary(shared.exercise);
        library = next;
        history.replaceState(null, '', location.pathname + location.search);
        eduStore.markHandout();
        loadExercise(specToExercise(shared.exercise));
      } else {
        linkNotice = shared.error;
      }
    }
  });

  const customExercises = $derived(library.map(specToExercise));

  function handleAuthored(spec: EduExerciseSpec) {
    const { library: next } = saveToLibrary(spec);
    library = next;
    eduStore.authoring = false;
    editingSpec = null;
  }

  function editExercise(spec: EduExerciseSpec) {
    editingSpec = spec;
    eduStore.authoring = true;
  }

  function deleteExercise(id: string) {
    library = removeFromLibrary(id);
  }

  /** Adapt an authored spec to the shape the exercise view consumes. */
  function specToExercise(spec: EduExerciseSpec): EduExercise {
    // The stress resolver is built at most once per exercise — it meshes and
    // solves the section, which is far too costly to repeat per question or
    // per click. But it must stay LAZY: it only works once the WASM engine is
    // ready (the first verify happens after the solve pipeline has awaited
    // it), while specToExercise runs at panel mount, possibly before. An eager
    // call — or caching the empty context an early call returns — would mark
    // students against a fabricated 0 for the panel's whole lifetime.
    let ctx: AnswerContext | undefined;
    const stressCtx = (): AnswerContext => {
      if (ctx) return ctx;
      const built = stressContext(spec.model.profile, spec.model.fy);
      // Empty means "no profile / no geometry" (stable) or "engine not ready"
      // (must be retried). Only the stable cases get cached.
      if (built.stress || !spec.model.profile) ctx = built;
      return built;
    };
    return {
      id: spec.id,
      title: spec.title,
      description: spec.description,
      difficulty: spec.difficulty,
      category: spec.category,
      solverType: spec.solverType,
      build: (api) => buildFromSpec(spec.model, api),
      supports: spec.supports,
      characteristics: spec.characteristics.map((c) => ({
        label: c.label, unit: c.unit,
        getCorrect: (f) => evaluateAnswer(c.answer, f, stressCtx()) ?? 0,
      })),
      diagramQuestions: spec.diagramQuestions.map((q) => ({
        question: q.question, unit: q.unit,
        getCorrect: (f) => evaluateAnswer(q.answer, f, stressCtx()) ?? 0,
      })),
      kinematicQuestion: spec.kinematicQuestion,
      diagramShapeQuestions: spec.diagramShapeQuestions,
      diagramSketchQuestions: spec.diagramSketchQuestions,
      allowReveal: spec.allowReveal,
      sectionData: spec.sectionData,
    };
  }

  const sections = $derived(getExerciseSections());

  // No listener registration here any more: `live-calc.runGlobalSolve()` calls
  // `solveForEdu()` directly in edu mode, so a solve dispatched before this
  // panel mounts is no longer silently dropped.

  function loadExercise(ex: EduExercise) {
    /*
     * Set the reader's own model aside before taking the canvas.
     *
     * Inside Basic this panel is one command among twenty, and the model on
     * screen when it is pressed is work — possibly an hour of it. Loading an
     * exercise replaces that model, and replacing it without a way back is
     * the difference between a feature and a data-loss bug.
     *
     * Borrowed once, not on every exercise: moving from one exercise to the
     * next must not overwrite the snapshot with an exercise's own structure.
     * Education proper skips this — there the canvas was always the
     * exercise's, and there is nothing of the reader's to keep.
     */
    if (uiStore.appMode !== 'educativo'
        && eduStore.borrowedModel === null
        && modelStore.nodes.size > 0) {
      eduStore.borrowedModel = modelStore.snapshot();
    }
    modelStore.clear();
    resultsStore.clear();

    // Build the exercise structure via the shared model store.
    // Node ids are recorded in call order: `supports[].nodeIndex` indexes this
    // array, not the model's ids (the store's id counter is shared with
    // whatever was loaded before this exercise).
    const builtNodeIds: number[] = [];
    ex.build({
      addNode: (x, y) => {
        const id = modelStore.addNode(x, y);
        builtNodeIds.push(id);
        return id;
      },
      addElement: (nI, nJ) => modelStore.addElement(nI, nJ),
      addSupport: (nodeId, type) => modelStore.addSupport(nodeId, type),
      addNodalLoad: (nodeId, fx, fy, mz) => modelStore.addNodalLoad(nodeId, fx, fy, mz ?? 0),
      addDistributedLoad: (elementId, qI, qJ) => modelStore.addDistributedLoad(elementId, qI, qJ),
    });

    // Track in edu store
    eduStore.loadExercise(ex, builtNodeIds);

    /*
     * Solve once the engine can actually solve.
     *
     * This used to be a flat 100 ms timeout. Opening an exercise on a cold
     * page — a student following a link, which is the common case — fired it
     * while the WASM engine was still initialising, the solve failed, and
     * NOTHING retried: `eduStore.results` stayed null, so every answer the
     * student typed was graded against nothing and Verify appeared to do
     * nothing at all. Same failure main fixed for the stress context, one
     * layer up.
     */
    solveWhenReady();

    // Zoom to fit
    setTimeout(() => {
      const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
      if (canvas && modelStore.nodes.size > 0) {
        uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
      }
    }, 150);
  }

  /** Open a draft the way a student will get it, without saving it first. */
  function previewAsStudent(spec: EduExerciseSpec) {
    previewingSpec = spec;
    editingSpec = spec;
    eduStore.authoring = false;
    loadExercise(specToExercise(spec));
  }

  /** Poll for the engine, then solve. Bounded, and it gives up in the open
   *  rather than leaving a student wondering why nothing happens. */
  function solveWhenReady(attempt = 0) {
    if (isSolverReady() || attempt >= 60) {
      if (!isSolverReady()) uiStore.toast(t('edu.engineNotReady'), 'error');
      solveForEdu();
      return;
    }
    setTimeout(() => solveWhenReady(attempt + 1), 100);
  }

  function goBack() {
    eduStore.clearExercise();
    /*
     * Coming back from a preview returns to the form that opened it — and to
     * the structure it was written against. Clearing the canvas here left the
     * teacher looking at a form that said "2 nodes · 1 member · 2 supports"
     * above a hint telling them nothing was drawn yet: both true, and
     * together nonsense.
     */
    if (previewingSpec) {
      const spec = previewingSpec;
      previewingSpec = null;
      eduStore.authoring = true;
      resultsStore.clear();
      modelStore.clear();
      buildFromSpec(spec.model, {
        addNode: (x, y) => modelStore.addNode(x, y),
        addElement: (nI, nJ) => modelStore.addElement(nI, nJ),
        addSupport: (nodeId, type) => modelStore.addSupport(nodeId, type),
        addNodalLoad: (nodeId, fx, fy, mz) => modelStore.addNodalLoad(nodeId, fx, fy, mz ?? 0),
        addDistributedLoad: (elementId, qI, qJ) => modelStore.addDistributedLoad(elementId, qI, qJ),
      });
      return;
    }
    // Leaving the exercise ends the handout: from here the window is a normal
    // Education session again, with the list and the mode switcher back.
    eduStore.markBrowsing();
    resultsStore.clear();
    returnBorrowedModel();
  }


</script>

<div class="edu-panel">
  {#if eduStore.authoring}
    <ExerciseAuthor
      onclose={() => { eduStore.authoring = false; editingSpec = null; }}
      onsaved={handleAuthored}
      onpreview={previewAsStudent}
      editing={editingSpec}
    />
  {:else if !eduStore.hasExercise}
    <div class="edu-welcome">
      <h2>{t('edu.title')}</h2>
      <p class="edu-subtitle">{t('edu.subtitle')}</p>

      {#each sections as section}
        {#if section.exercises.length > 0}
          <div class="exercise-section">
            <h3 class="section-title">{section.title}</h3>
            <div class="exercise-list">
              {#each section.exercises as ex}
                <button class="exercise-card" onclick={() => loadExercise(ex)}>
                  <div class="exercise-header">
                    <span class="exercise-title">{ex.title}</span>
                    <span class="difficulty difficulty-{ex.difficulty}">
                      {t('edu.' + ex.difficulty)}
                    </span>
                  </div>
                  <p class="exercise-desc">{ex.description}</p>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

      {#if linkNotice}
        <p class="edu-link-notice">{linkNotice}</p>
      {/if}

      {#if library.length > 0}
        <div class="exercise-section">
          <h3 class="section-title">{t('edu.author.mine')}</h3>
          <div class="exercise-list">
            {#each library as spec, i}
              <div class="exercise-card-wrap">
                <button class="exercise-card" onclick={() => loadExercise(customExercises[i])}>
                  <div class="exercise-header">
                    <span class="exercise-title">{spec.title}</span>
                    <span class="difficulty difficulty-{spec.difficulty}">{t('edu.' + spec.difficulty)}</span>
                  </div>
                  <p class="exercise-desc">{spec.description}</p>
                </button>
                <div class="card-actions">
                  <button class="card-act" onclick={() => editExercise(spec)}>{t('edu.author.edit')}</button>
                  <button class="card-act del" onclick={() => deleteExercise(spec.id)}>{t('edu.author.delete')}</button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!--
        The other half of handing out an exercise: getting one back. It sits
        with the teacher's own exercises rather than behind the authoring
        form, because collecting is not authoring — it happens weeks later
        and by someone who may not have written the exercise at all.
      -->
      <div class="exercise-section">
        <h3 class="section-title">{t('edu.review.open')}</h3>
        {#if openedSubmission}
          <SubmissionReview submission={openedSubmission} onclose={() => (openedSubmission = null)} />
        {:else}
          <p class="edu-subtitle">{t('edu.review.openHint')}</p>

          <!--
            Two ways in, and they are not interchangeable: a file is what a
            student downloaded, a code is what they pasted into a message. A
            native file input renders as a white system button that belongs to
            no design system at all, and its label ("Choose File") says nothing
            about which of the two this is — so the input is hidden behind a
            button that names the thing, and each route carries a `?`.
          -->
          <div class="submit-row">
            <button class="submit-btn" onclick={() => submissionFileInput?.click()} data-testid="edu-open-submission">
              {t('edu.review.chooseFile')}
            </button>
            <FieldHelp what={t('edu.review.helpFileWhat')} example={t('edu.review.helpFileEx')} />
          </div>
          <input
            bind:this={submissionFileInput}
            type="file"
            accept=".json"
            style="display:none"
            onchange={openSubmissionFile}
          />

          <div class="submit-row">
            <input
              type="text"
              class="submit-code"
              bind:value={pastedCode}
              placeholder={t('edu.review.pastePlaceholder')}
            />
            <button class="submit-btn" onclick={openSubmissionCode} data-testid="edu-open-code">
              {t('edu.review.openCode')}
            </button>
            <FieldHelp what={t('edu.review.helpCodeWhat')} example={t('edu.review.helpCodeEx')} />
          </div>

          {#if submissionError}<p class="edu-link-notice">{submissionError}</p>{/if}
        {/if}
      </div>

      <div class="edu-footer">
        <p>{t('edu.moreExercises')}</p>
        <!-- Authoring lives beside the exercise list, not behind a setting:
             a teacher looking for "how do I make one of these" looks here. -->
        <button class="edu-author-btn" onclick={() => (eduStore.authoring = true)}>
          {t('edu.author.open')}
        </button>
      </div>
    </div>
  {:else}
    <div class="edu-exercise-container">
      <div class="edu-topbar">
        <button class="edu-back-btn" onclick={goBack}>
          {t('edu.back')}
        </button>
        <span class="edu-exercise-name">{eduStore.exercise!.title}</span>
      </div>

      {#key eduStore.exerciseKey}
        <EduExerciseView exercise={eduStore.exercise!} />
      {/key}
    </div>
  {/if}
</div>

<style>
  .edu-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--st-surface-2);
    color: var(--st-text);
    overflow-y: auto;
  }

  .edu-welcome {
    padding: 24px 20px;
  }

  .edu-welcome h2 {
    font-size: 1.3rem;
    color: var(--st-text-2);
    margin: 0 0 4px;
  }

  .edu-subtitle {
    font-size: 0.82rem;
    color: var(--st-text-3);
    margin: 0 0 20px;
  }

  .exercise-section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--st-text-2);
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--st-hair);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .exercise-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .exercise-card {
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 8px;
    padding: 14px 16px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .exercise-card:hover {
    background: var(--st-surface-3);
    border-color: var(--st-text-2);
  }

  .exercise-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .exercise-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--st-text);
  }

  .difficulty {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .difficulty-easy {
    background: var(--st-surface-2);
    color: var(--st-ok);
  }

  .difficulty-medium {
    background: var(--st-surface-2);
    color: var(--st-warn);
  }

  .difficulty-hard {
    background: var(--st-surface-2);
    color: var(--st-danger);
  }

  .exercise-desc {
    font-size: 0.75rem;
    color: var(--st-text-2);
    margin: 0;
    line-height: 1.4;
  }

  .exercise-card-wrap { position: relative; }
  .card-actions {
    display: flex; gap: 6px; justify-content: flex-end;
    margin: -4px 4px 6px 0;
  }
  .card-act {
    background: none; border: none; color: var(--st-text-3);
    font-size: 0.66rem; cursor: pointer; padding: 2px 4px;
  }
  .card-act:hover { color: var(--st-text-2); }
  .card-act.del:hover { color: var(--st-danger); }
  /* Both routes into a submission read as one control family, and the file
     one is a real button rather than the browser's white system widget. */
  .submit-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }

  .submit-btn {
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.7rem;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.12s, color 0.12s;
  }

  .submit-btn:hover { border-color: var(--st-hair-strong); color: var(--st-text); }

  .submit-code {
    flex: 1;
    min-width: 0;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: var(--st-mono);
    font-size: 0.66rem;
    padding: 4px 6px;
  }

  .submit-code:focus { outline: none; border-color: var(--st-focus); }

  /* The last two washes of the old brand turquoise. This one carries an
     error about a link or a submission, so it is a surface with a warn rule
     rather than a tint of a colour the app no longer uses. */
  .edu-link-notice {
    background: var(--st-surface-2);
    border-left: 2px solid var(--st-warn);
    padding: 6px 9px;
    color: var(--st-text-2);
    font-size: 0.72rem;
    border-radius: var(--st-radius);
  }

  .edu-author-btn {
    background: none;
    border: 1px solid var(--st-hair);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    padding: 5px 14px;
    border-radius: var(--st-radius);
    cursor: pointer;
    font-size: 0.78rem;
    margin-top: 8px;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
  }

  .edu-author-btn:hover {
    background: var(--st-surface-3);
    border-color: var(--st-hair-strong);
    color: var(--st-text);
  }

  .edu-footer {
    margin-top: 24px;
    padding: 10px 16px;
  }

  .edu-footer p {
    font-size: 0.68rem;
    color: var(--st-hair);
    margin: 0;
    text-align: center;
    font-style: italic;
  }

  .edu-exercise-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .edu-topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--st-surface-3);
    border-bottom: 1px solid var(--st-hair-strong);
    flex-shrink: 0;
  }

  .edu-back-btn {
    background: none;
    border: 1px solid var(--st-hair);
    color: var(--st-text-3);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .edu-back-btn:hover {
    color: var(--st-text-2);
    border-color: var(--st-text-2);
  }

  .edu-exercise-name {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--st-text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
