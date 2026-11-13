<script lang="ts">
  import { resultsStore } from '../../lib/store';
  import type { EduExercise, DiagramShape } from './exercises';
  import { t } from '../../lib/i18n';
  import { eduStore } from './edu-store.svelte';
  import { reactionDofLabel, readSupportReaction, type ReactionDof } from './edu-reactions';
  import type { SolveTimings } from '../../lib/engine/types';
  import {
    toSubmissionFile, toSubmissionCode,
    type Submission, type SubmittedAnswer,
  } from './exercise-submission';
  import DiagramSketch from './DiagramSketch.svelte';
  import SubmissionReview from './SubmissionReview.svelte';
  import {
    emptySketch, gradeSketch, type Sketch, type SketchVerdict,
  } from './diagram-sketch';
  import { computeDisplacementAt } from '../../lib/engine/diagrams';
  import { diagramValueAsShown } from './exercise-spec';
  import { modelStore } from '../../lib/store';
  import { effectiveBendingInertia } from '../../lib/engine/solver-service';
  import { get2DDisplayDisplacementVertical } from '../../lib/geometry/coordinate-system';

  // Cubic included: a linearly varying load makes the moment cubic, and the
  // answer has to be on the list for the question to be answerable.
  const SHAPE_OPTIONS: DiagramShape[] = ['zero', 'constant', 'linear', 'quadratic', 'cubic'];

  interface Props {
    exercise: EduExercise;
  }

  let { exercise }: Props = $props();

  // ─── Student answers ───────────────────────────────────────
  type ReactionAnswer = Record<string, string>;
  let reactionAnswers = $state<ReactionAnswer[]>(
    exercise.supports.map(s => {
      const ans: ReactionAnswer = {};
      for (const dof of s.dofs) ans[dof] = '';
      return ans;
    })
  );
  let charAnswers = $state<string[]>(exercise.characteristics.map(() => ''));
  let diagramAnswers = $state<string[]>(exercise.diagramQuestions.map(() => ''));

  // ─── Kinematic + diagram shape answers ───────────────────────
  let kinematicAnswer = $state<'isostatic' | 'hyperstatic' | ''>('');
  let kinematicDegreeAnswer = $state('');
  let shapeAnswers = $state<(DiagramShape | '')[]>(
    (exercise.diagramShapeQuestions ?? []).map(() => '' as (DiagramShape | ''))
  );

  // ─── Verification state ────────────────────────────────────
  type VerifState = 'pending' | 'correct' | 'incorrect';
  let reactionVerif = $state<Array<Record<string, VerifState>>>(
    exercise.supports.map(s => {
      const v: Record<string, VerifState> = {};
      for (const dof of s.dofs) v[dof] = 'pending';
      return v;
    })
  );
  let charVerif = $state<VerifState[]>(exercise.characteristics.map(() => 'pending'));
  let diagramVerif = $state<VerifState[]>(exercise.diagramQuestions.map(() => 'pending'));
  let kinematicVerif = $state<VerifState>('pending');
  let kinematicDegreeVerif = $state<VerifState>('pending');
  let shapeVerif = $state<VerifState[]>((exercise.diagramShapeQuestions ?? []).map(() => 'pending'));
  let hints = $state<string[]>([]);
  let diagramHints = $state<string[]>([]);
  let charHints = $state<string[]>([]);

  // ─── Reveal state ──────────────────────────────────────────
  let revealedReactions = $state<Array<Record<string, boolean>>>(
    exercise.supports.map(s => {
      const r: Record<string, boolean> = {};
      for (const dof of s.dofs) r[dof] = false;
      return r;
    })
  );
  let revealedChars = $state<boolean[]>(exercise.characteristics.map(() => false));
  let revealedDiagrams = $state<boolean[]>(exercise.diagramQuestions.map(() => false));

  const TOLERANCE = 0.05;

  // ─── Drawn diagrams ────────────────────────────────────────
  //
  // One sketch per question, and the real diagram sampled at the same
  // stations the marker uses. The samples come from the solve, so an exercise
  // never stores a "correct drawing" that could drift from its own structure.
  const SKETCH_STATIONS = 41;
  const sketchQuestions = $derived(exercise.diagramSketchQuestions ?? []);
  let sketches = $state<Sketch[]>((exercise.diagramSketchQuestions ?? []).map(() => emptySketch()));
  let sketchVerdicts = $state<Array<SketchVerdict | null>>((exercise.diagramSketchQuestions ?? []).map(() => null));

  /** Whether the student may reveal an answer. Absent means yes, so every
   *  exercise written before the teacher could choose keeps working. */
  const canReveal = $derived(exercise.allowReveal !== false);

  /** The three the diagram sampler knows. `D` is the deflected shape and is
   *  read from the displacement field instead, further down. */
  const DIAGRAM_KIND: Record<'N' | 'V' | 'M', 'axial' | 'shear' | 'moment'> =
    { N: 'axial', V: 'shear', M: 'moment' };

  /** The real diagram for a question, sampled along the member. */
  function trueSamplesFor(i: number): number[] | null {
    const q = sketchQuestions[i];
    const res = eduStore.results;
    const forces = res?.elementForces;
    if (!q || !forces?.length) return null;
    const ef = forces[q.elementIndex ?? 0];
    if (!ef) return null;

    // Read once into a local: narrowing a property of a reactive object does
    // not survive the closure below.
    const which = q.diagram;
    if (which !== 'D') {
      // The same funnel every other answer goes through, so the drawing and
      // the typed value can never disagree about which way is positive.
      return Array.from({ length: SKETCH_STATIONS }, (_, k) =>
        diagramValueAsShown(DIAGRAM_KIND[which], k / (SKETCH_STATIONS - 1), ef as never));
    }

    /*
     * The deflected shape, sampled the same way — through the same Hermite
     * interpolation the viewport draws, so the curve a student is marked
     * against is the curve the app would have drawn them. In mm, because a
     * deflection in metres is four zeros and a digit.
     */
    const elem = modelStore.elements.get(ef.elementId);
    if (!elem) return null;
    const ni = modelStore.nodes.get(elem.nodeI);
    const nj = modelStore.nodes.get(elem.nodeJ);
    const di = res?.displacements.find(d => d.nodeId === elem.nodeI);
    const dj = res?.displacements.find(d => d.nodeId === elem.nodeJ);
    if (!ni || !nj || !di || !dj) return null;

    const mat = modelStore.materials.get(elem.materialId);
    const sec = modelStore.sections.get(elem.sectionId);
    const EI = mat && sec ? mat.e * 1000 * effectiveBendingInertia(sec) : undefined;

    return Array.from({ length: SKETCH_STATIONS }, (_, k) => {
      const disp = computeDisplacementAt(
        k / (SKETCH_STATIONS - 1),
        ni.x, ni.y, nj.x, nj.y,
        di.ux, di.uz, di.ry,
        dj.ux, dj.uz, dj.ry,
        ef.length, ef.hingeStart, ef.hingeEnd,
        EI, ef.qI, ef.qJ, ef.pointLoads, ef.distributedLoads,
      );
      return get2DDisplayDisplacementVertical(disp) * 1000;
    });
  }

  function verifySketches() {
    sketchVerdicts = sketchQuestions.map((_, i) => {
      const truth = trueSamplesFor(i);
      return truth ? gradeSketch(sketches[i], truth) : null;
    });
  }

  const sketchesComplete = $derived(
    sketchQuestions.length === 0 ||
    sketchVerdicts.every(v => v !== null && v.curveOk && v.powersOk),
  );

  // Solver insight for educational display
  const timings = $derived<SolveTimings | undefined>(eduStore.results?.timings);

  // ─── Step completion ───────────────────────────────────────
  const kinematicComplete = $derived(
    !exercise.kinematicQuestion || (
      kinematicVerif === 'correct' &&
      (exercise.kinematicQuestion.classification !== 'hyperstatic' || kinematicDegreeVerif === 'correct')
    )
  );
  const step1Complete = $derived(
    reactionVerif.every(v => Object.values(v).every(s => s === 'correct')) && kinematicComplete
  );
  const shapesComplete = $derived(
    !exercise.diagramShapeQuestions || exercise.diagramShapeQuestions.length === 0 ||
    shapeVerif.every(s => s === 'correct')
  );
  const step2Complete = $derived(
    (exercise.diagramQuestions.length === 0 || diagramVerif.every(s => s === 'correct'))
    && shapesComplete && sketchesComplete
  );
  const step3Complete = $derived(
    charVerif.every(s => s === 'correct')
  );
  const allCorrect = $derived(step1Complete && step2Complete && step3Complete);

  // ─── Which step is on screen ───────────────────────────────
  //
  // One at a time. The three steps are a sequence — you cannot check a shear
  // diagram before you know the reactions — and showing them stacked made a
  // beam exercise a page of thirty inputs that all look equally urgent.
  let activeStep = $state(1);

  const STEPS = $derived([
    { n: 1, label: t('edu.reactions'), done: step1Complete, prevDone: false },
    { n: 2, label: t('edu.diagrams'), done: step2Complete, prevDone: step1Complete },
    { n: 3, label: t('edu.values'), done: step3Complete, prevDone: step2Complete },
  ]);

  /*
   * Finishing a step moves the student on, once.
   *
   * Tracked per step rather than off the completion flag alone: a student who
   * goes back to step 1 after finishing it must not be thrown forward again on
   * the next keystroke.
   */
  let advancedFrom = $state<Set<number>>(new Set());
  $effect(() => {
    const done = [step1Complete, step2Complete, step3Complete];
    const i = activeStep - 1;
    if (!done[i] || advancedFrom.has(activeStep) || activeStep === 3) return;
    advancedFrom = new Set([...advancedFrom, activeStep]);
    activeStep = activeStep + 1;
  });

  // ─── Handing it in ─────────────────────────────────────────
  //
  // The submission is assembled from the same state the panel is showing:
  // every field the student was asked for, what they typed, the verdict the
  // app gave it, and whether they revealed it instead of solving it.
  let studentName = $state('');
  let showFeedback = $state(false);
  let submissionCode = $state('');
  let handinNote = $state('');

  function collectAnswers(): SubmittedAnswer[] {
    const out: SubmittedAnswer[] = [];
    exercise.supports.forEach((sup, i) => {
      for (const dof of sup.dofs) {
        out.push({
          label: `${sup.label} — ${reactionDofLabel(dof)}`,
          answer: reactionAnswers[i][dof] ?? '',
          unit: dof === 'M' ? 'kN·m' : 'kN',
          outcome: reactionVerif[i][dof],
          revealed: revealedReactions[i][dof],
        });
      }
    });
    if (exercise.kinematicQuestion) {
      out.push({
        label: t('edu.kinematicQuestion'),
        answer: kinematicAnswer,
        outcome: kinematicVerif,
      });
    }
    (exercise.diagramShapeQuestions ?? []).forEach((q, i) => {
      out.push({
        label: `${t('edu.shapeQuestion')} — ${q.diagram}`,
        answer: shapeAnswers[i] ?? '',
        outcome: shapeVerif[i],
      });
    });
    exercise.diagramQuestions.forEach((q, i) => {
      out.push({
        label: q.question,
        answer: diagramAnswers[i] ?? '',
        unit: q.unit,
        outcome: diagramVerif[i],
        revealed: revealedDiagrams[i],
      });
    });
    sketchQuestions.forEach((q, i) => {
      const v = sketchVerdicts[i];
      out.push({
        label: `${t('edu.sketch.span')} ${q.diagram}`,
        // The drawing itself, as the ordinates and powers that produced it —
        // a teacher reading the record can see what was drawn, not only
        // whether it passed.
        // The powers read as words, in the language the student worked in —
        // the record is for a person, and `constant` in the middle of a
        // Portuguese table is neither the student's answer nor the app's.
        answer: sketches[i].points
          .map(pt => `${pt.t.toFixed(2)}:${pt.value.toFixed(2)}`)
          .join(' ') + ' · ' + sketches[i].powers.map(p => t('edu.sketch.power.' + p)).join('/'),
        outcome: v ? (v.curveOk && v.powersOk ? 'correct' : 'incorrect') : 'pending',
      });
    });
    exercise.characteristics.forEach((c, i) => {
      out.push({
        label: c.label,
        answer: charAnswers[i] ?? '',
        unit: c.unit,
        outcome: charVerif[i],
        revealed: revealedChars[i],
      });
    });
    return out;
  }

  function buildSubmission(): Submission {
    return {
      stabileoSubmission: 1,
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      student: studentName.trim(),
      submittedAt: new Date().toISOString(),
      answers: collectAnswers(),
    };
  }

  const answeredCount = $derived(collectAnswers().filter(a => a.outcome !== 'pending').length);
  const totalCount = $derived(collectAnswers().length);

  function downloadSubmission() {
    const sub = buildSubmission();
    const blob = new Blob([toSubmissionFile(sub)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const who = sub.student ? sub.student.replace(/[^\w\-]+/g, '-').toLowerCase() : 'entrega';
    a.download = `${who}-${sub.exerciseId}.stabileo-entrega.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    handinNote = t('edu.handin.downloaded');
  }

  function copySubmissionCode() {
    submissionCode = toSubmissionCode(buildSubmission());
    navigator.clipboard?.writeText(submissionCode).catch(() => {});
    handinNote = t('edu.handin.codeCopied');
  }

  // ─── Reaction verification ─────────────────────────────────
  /**
   * The expected value for one support/DOF, in the convention the app SHOWS.
   *
   * Delegates to `edu-reactions.ts`: the support's declared `nodeIndex` is
   * resolved through the model's actual node ids (never by array position),
   * and the component is read through the shared display helpers — so a
   * student is graded against exactly what the results table prints.
   *
   * `null` means "cannot be graded" (no results, or no reaction at that node).
   */
  function getCorrectReaction(supportIndex: number, dof: string): number | null {
    const support = exercise.supports[supportIndex];
    if (!support) return null;
    return readSupportReaction(
      eduStore.results,
      support.nodeIndex,
      eduStore.nodeIdsByIndex,
      dof as ReactionDof,
    );
  }

  function checkTolerance(student: number, correct: number): VerifState {
    const abs = Math.abs(correct);
    const tol = abs > 0.01 ? abs * TOLERANCE : 0.1;
    return Math.abs(student - correct) <= tol ? 'correct' : 'incorrect';
  }

  function generateHint(student: number, correct: number, label: string, dof: string): string | null {
    const abs = Math.abs(correct);
    const tol = abs > 0.01 ? abs * TOLERANCE : 0.1;
    if (Math.abs(student - correct) <= tol) return null;

    const prefix = dof ? `${label}, ${reactionDofLabel(dof)}` : label;
    if (Math.abs(Math.abs(student) - Math.abs(correct)) < tol && Math.sign(student) !== Math.sign(correct)) {
      return `${prefix}: ${t('edu.hintSign')}`;
    } else if (Math.abs(Math.abs(student) - Math.abs(correct)) / (abs || 1) > 0.5) {
      return `${prefix}: ${t('edu.hintFarOff')}`;
    }
    return `${prefix}: ${t('edu.hintClose')}`;
  }

  function verifyReactions() {
    hints = [];
    const newVerif = reactionVerif.map(v => ({ ...v }));

    for (let i = 0; i < exercise.supports.length; i++) {
      const sup = exercise.supports[i];
      for (const dof of sup.dofs) {
        if (revealedReactions[i][dof]) { newVerif[i][dof] = 'correct'; continue; }
        const studentVal = parseFloat(reactionAnswers[i][dof].replace(',', '.'));
        const correct = getCorrectReaction(i, dof);
        // `correct` is null when the reaction cannot be read at all. Grading
        // against a fabricated value is how the old code marked every right
        // answer wrong, so refuse instead and leave the field pending.
        if (correct === null || !Number.isFinite(correct) || isNaN(studentVal)) {
          newVerif[i][dof] = 'pending';
          continue;
        }

        newVerif[i][dof] = checkTolerance(studentVal, correct);
        if (newVerif[i][dof] === 'incorrect') {
          const hint = generateHint(studentVal, correct, sup.label, dof);
          if (hint) hints.push(hint);
        }
      }
    }
    reactionVerif = newVerif;
  }

  function verifyKinematic() {
    const kq = exercise.kinematicQuestion;
    if (!kq) return;
    kinematicVerif = kinematicAnswer === kq.classification ? 'correct' : (kinematicAnswer ? 'incorrect' : 'pending');
    if (kinematicAnswer === 'hyperstatic' && kq.classification === 'hyperstatic' && kq.degree !== undefined) {
      const deg = parseInt(kinematicDegreeAnswer);
      kinematicDegreeVerif = !isNaN(deg) && deg === kq.degree ? 'correct' : (kinematicDegreeAnswer ? 'incorrect' : 'pending');
    } else if (kinematicAnswer === 'hyperstatic' && kq.classification !== 'hyperstatic') {
      // Wrong classification — degree is irrelevant
      kinematicDegreeVerif = 'pending';
    }
  }

  function verifyShapes() {
    const qs = exercise.diagramShapeQuestions;
    if (!qs) return;
    shapeVerif = qs.map((q, i) => shapeAnswers[i] === q.correct ? 'correct' : (shapeAnswers[i] ? 'incorrect' : 'pending'));
  }

  function revealReaction(supIdx: number, dof: string) {
    const correct = getCorrectReaction(supIdx, dof);
    // Guard on finiteness, not just `null`: the previous `=== null` check let
    // `undefined` through and the reveal button threw on `.toFixed(2)`.
    if (correct === null || !Number.isFinite(correct)) return;
    // Clone and reassign all arrays to force Svelte 5 reactivity
    const newRevealed = revealedReactions.map(r => ({ ...r }));
    newRevealed[supIdx][dof] = true;
    revealedReactions = newRevealed;

    const newAnswers = reactionAnswers.map(a => ({ ...a }));
    newAnswers[supIdx][dof] = correct.toFixed(2);
    reactionAnswers = newAnswers;

    const newVerif = reactionVerif.map(v => ({ ...v }));
    newVerif[supIdx][dof] = 'correct';
    reactionVerif = newVerif;

    hints = hints.filter(h => !h.startsWith(`${exercise.supports[supIdx].label}, ${reactionDofLabel(dof)}`));
  }

  // ─── Diagram question verification ─────────────────────────
  function verifyDiagrams() {
    const results = eduStore.results;
    if (!results) return;
    diagramHints = [];
    const newVerif = [...diagramVerif];

    for (let i = 0; i < exercise.diagramQuestions.length; i++) {
      if (revealedDiagrams[i]) { newVerif[i] = 'correct'; continue; }
      const dq = exercise.diagramQuestions[i];
      const studentVal = parseFloat(diagramAnswers[i].replace(',', '.'));
      if (isNaN(studentVal)) { newVerif[i] = 'pending'; continue; }

      const correct = dq.getCorrect(results.elementForces);
      newVerif[i] = checkTolerance(Math.abs(studentVal), Math.abs(correct));
      if (newVerif[i] === 'incorrect') {
        const hint = generateHint(studentVal, correct, dq.question, '');
        if (hint) diagramHints.push(hint);
      }
    }
    diagramVerif = newVerif;
  }

  function revealDiagram(idx: number) {
    const results = eduStore.results;
    if (!results) return;
    const correct = exercise.diagramQuestions[idx].getCorrect(results.elementForces);
    revealedDiagrams = revealedDiagrams.map((v, j) => j === idx ? true : v);
    diagramAnswers = diagramAnswers.map((v, j) => j === idx ? Math.abs(correct).toFixed(2) : v);
    diagramVerif = diagramVerif.map((v, j) => j === idx ? 'correct' as VerifState : v);
    diagramHints = diagramHints.filter(h => !h.startsWith(exercise.diagramQuestions[idx].question));
  }

  // ─── Characteristic verification ───────────────────────────
  function verifyCharacteristics() {
    const results = eduStore.results;
    if (!results) return;
    charHints = [];
    const newVerif = [...charVerif];

    for (let i = 0; i < exercise.characteristics.length; i++) {
      if (revealedChars[i]) { newVerif[i] = 'correct'; continue; }
      const ch = exercise.characteristics[i];
      const studentVal = parseFloat(charAnswers[i].replace(',', '.'));
      if (isNaN(studentVal)) { newVerif[i] = 'pending'; continue; }

      const correct = ch.getCorrect(results.elementForces);
      newVerif[i] = checkTolerance(Math.abs(studentVal), Math.abs(correct));
      if (newVerif[i] === 'incorrect') {
        const hint = generateHint(studentVal, correct, ch.label, '');
        if (hint) charHints.push(hint);
      }
    }
    charVerif = newVerif;
  }

  function revealChar(idx: number) {
    const results = eduStore.results;
    if (!results) return;
    const correct = exercise.characteristics[idx].getCorrect(results.elementForces);
    revealedChars = revealedChars.map((v, j) => j === idx ? true : v);
    charAnswers = charAnswers.map((v, j) => j === idx ? Math.abs(correct).toFixed(2) : v);
    charVerif = charVerif.map((v, j) => j === idx ? 'correct' as VerifState : v);
    charHints = charHints.filter(h => !h.startsWith(exercise.characteristics[idx].label));
  }

  function verifClass(state: VerifState): string {
    if (state === 'correct') return 'verif-correct';
    if (state === 'incorrect') return 'verif-incorrect';
    return '';
  }

  // When step 1 completes, show reactions in the viewport
  $effect(() => {
    if (step1Complete) {
      resultsStore.showReactions = true;
    }
  });

  // When all steps complete, show moment diagram as a reward
  $effect(() => {
    if (allCorrect) {
      resultsStore.diagramType = 'moment';
    }
  });
</script>

<!--
  `data-solved` states, in the DOM, whether the results the marking needs have
  arrived. Every answer here is graded against the solve, so "not solved yet"
  and "wrong" look identical from outside — this is what tells them apart, for
  a spec and for anyone debugging a verdict that will not appear.
-->
<div class="exercise-view" data-solved={eduStore.results ? 'yes' : 'no'}>
  <!--
    The stepper is navigation, not decoration.
    \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    It always drew three numbered dots and a tick for each finished step, and
    then the panel showed all three steps stacked in one scroll anyway. So it
    told the student where they were in something they could already see all
    of, which is the one thing a progress indicator should not do.

    Now it moves. One step is on screen at a time, the dots switch between
    them, and a finished step stays reachable \u2014 a student rereading their
    reactions while answering the diagrams is doing structural analysis, not
    going backwards.
  -->
  <div class="progress-bar" role="tablist">
    {#each STEPS as s (s.n)}
      {#if s.n > 1}<div class="progress-line" class:done={s.prevDone}></div>{/if}
      <button
        class="progress-step"
        class:done={s.done}
        class:current={activeStep === s.n}
        role="tab"
        aria-selected={activeStep === s.n}
        onclick={() => (activeStep = s.n)}
        data-testid="edu-step-{s.n}"
      >
        <span class="step-check">{s.done ? '\u2713' : s.n}</span>
        <span class="step-label">{s.label}</span>
      </button>
    {/each}
  </div>

  <!-- An exercise with no statement draws no card: an empty bordered box
       reads as something that failed to load. -->
  {#if exercise.description?.trim()}
    <div class="exercise-description">
      <p>{exercise.description}</p>
    </div>
  {/if}

  <!-- Section data (given info for strength/advanced exercises) -->
  {#if exercise.sectionData && exercise.sectionData.length > 0}
    <div class="section-data-card">
      <span class="section-data-title">{t('edu.sectionDataTitle')}</span>
      <div class="section-data-grid">
        {#each exercise.sectionData as item}
          <div class="section-data-item">
            <span class="section-data-label">{item.label}</span>
            <span class="section-data-value">{item.value}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Solver insight (educational) -->
  {#if timings}
    <div class="solver-insight">
      <span class="solver-insight-icon">{'\u2139'}</span>
      <span>
        {t('edu.solverInsight')
          .replace('{dofs}', String(timings.nFree))
          .replace('{total}', String(timings.nTotal))
          .replace('{solver}', timings.solverType === 'cholesky' ? 'Cholesky' : 'LU')
          .replace('{time}', timings.totalMs.toFixed(1))}
      </span>
    </div>
  {/if}

  <!-- Step 1: Reactions -->
  {#if activeStep === 1}
  <section class="step-section" class:completed={step1Complete}>
    <h3 class="step-title">
      {t('edu.step1Title')}
      {#if step1Complete}<span class="step-done">✓</span>{/if}
    </h3>

    {#each exercise.supports as sup, i}
      <div class="support-row">
        <span class="support-label">{sup.label}</span>
        <div class="dof-inputs">
          {#each sup.dofs as dof}
            <div class="input-group {verifClass(reactionVerif[i][dof])}">
              <label class="dof-input">
                <span class="dof-name">{reactionDofLabel(dof)} =</span>
                <input
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  value={reactionAnswers[i][dof]}
                  oninput={(e) => { reactionAnswers[i][dof] = (e.target as HTMLInputElement).value; }}
                  class={verifClass(reactionVerif[i][dof])}
                  class:revealed={revealedReactions[i][dof]}
                  readonly={revealedReactions[i][dof]}
                />
                <span class="dof-unit">{dof === 'M' ? 'kN·m' : 'kN'}</span>
              </label>
              {#if canReveal && reactionVerif[i][dof] === 'incorrect' && !revealedReactions[i][dof]}
                <button class="reveal-btn" onclick={() => revealReaction(i, dof)} title={t('edu.reveal')}>
                  {t('edu.reveal')}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Kinematic classification -->
    {#if exercise.kinematicQuestion}
      <div class="kinematic-section">
        <span class="kinematic-label">{t('edu.kinematicQuestion')}</span>
        <div class="kinematic-options">
          <label class="radio-option" class:verif-correct={kinematicVerif === 'correct' && kinematicAnswer === 'isostatic'} class:verif-incorrect={kinematicVerif === 'incorrect' && kinematicAnswer === 'isostatic'}>
            <input type="radio" name="kinematic" value="isostatic" bind:group={kinematicAnswer} disabled={kinematicVerif === 'correct'} />
            {t('edu.isostatic')}
          </label>
          <label class="radio-option" class:verif-correct={kinematicVerif === 'correct' && kinematicAnswer === 'hyperstatic'} class:verif-incorrect={kinematicVerif === 'incorrect' && kinematicAnswer === 'hyperstatic'}>
            <input type="radio" name="kinematic" value="hyperstatic" bind:group={kinematicAnswer} disabled={kinematicVerif === 'correct'} />
            {t('edu.hyperstatic')}
          </label>
        </div>
        {#if kinematicAnswer === 'hyperstatic'}
          <div class="kinematic-degree">
            <span class="dof-name">{t('edu.hyperstaticDegree')}</span>
            <input
              type="text"
              inputmode="numeric"
              placeholder="0"
              bind:value={kinematicDegreeAnswer}
              class={verifClass(kinematicDegreeVerif)}
              readonly={kinematicDegreeVerif === 'correct'}
            />
          </div>
        {/if}
      </div>
    {/if}

    <button class="verify-btn" onclick={() => { verifyReactions(); verifyKinematic(); }} disabled={step1Complete}>
      {step1Complete ? '\u2713 ' + t('edu.verified') : t('edu.verifyReactions')}
    </button>

    {#if hints.length > 0}
      <div class="hints">
        {#each hints as hint}
          <p class="hint">{hint}</p>
        {/each}
      </div>
    {/if}
  </section>
  {/if}

  <!-- Step 2: Diagram questions -->
  {#if activeStep === 2}
  <section class="step-section" class:completed={step2Complete}>
    <h3 class="step-title">
      {t('edu.step2Title')}
      {#if step2Complete}<span class="step-done">✓</span>{/if}
    </h3>

    <!-- Diagram shape questions -->
    {#if exercise.diagramShapeQuestions && exercise.diagramShapeQuestions.length > 0}
      <p class="step-info">{t('edu.shapeQuestion')}</p>
      <div class="shape-questions">
        {#each exercise.diagramShapeQuestions as sq, i}
          <div class="shape-row" class:verif-correct={shapeVerif[i] === 'correct'} class:verif-incorrect={shapeVerif[i] === 'incorrect'}>
            <span class="shape-diagram-label">{t('edu.diagram')} {sq.diagram}:</span>
            <div class="shape-options">
              {#each SHAPE_OPTIONS as opt}
                <label class="radio-option radio-small" class:selected={shapeAnswers[i] === opt}>
                  <input type="radio" name={`shape-${i}`} value={opt} bind:group={shapeAnswers[i]} disabled={shapeVerif[i] === 'correct'} />
                  {t(`edu.shape.${opt}`)}
                </label>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <button class="verify-btn verify-btn-small" onclick={verifyShapes} disabled={shapesComplete}>
        {shapesComplete ? '\u2713 ' + t('edu.verified') : t('edu.verifyShapes')}
      </button>
    {/if}

    <!--
      Drawing it.
      ───────────
      Naming a shape checks recognition; drawing checks whether the student can
      say where it jumps, which way it goes and what power each piece has. The
      two verdicts are reported separately because they are separate mistakes,
      and the real diagram is only drawn behind the answer once it has been
      marked — before that it would be the answer key.
    -->
    {#each sketchQuestions as sq, i (i)}
      <div class="sketch-block">
        <p class="step-info">
          {t('edu.sketch.prompt').replace('{diagram}', sq.diagram)}
        </p>
        <DiagramSketch
          bind:sketch={sketches[i]}
          unit={sq.diagram === 'M' ? 'kN·m' : sq.diagram === 'D' ? 'mm' : 'kN'}
          positiveDown={sq.diagram === 'M'}
          reference={sketchVerdicts[i] ? trueSamplesFor(i) : null}
        />
        {#if sketchVerdicts[i]}
          {@const v = sketchVerdicts[i]!}
          <div class="sketch-verdict">
            <span class={v.curveOk ? 'sv-ok' : 'sv-bad'}>
              {v.curveOk ? '✓' : '✗'} {t('edu.sketch.curve')}
            </span>
            <span class={v.powersOk ? 'sv-ok' : 'sv-bad'}>
              {v.powersOk ? '✓' : '✗'} {t('edu.sketch.powers')}
            </span>
          </div>
          {#if !v.curveOk && v.worst}
            <p class="sketch-worst">
              {t('edu.sketch.worst')
                .replace('{t}', v.worst.t.toFixed(2))
                .replace('{side}', t('edu.sketch.side.' + v.worst.side))}
            </p>
          {/if}
          {#if !v.powersOk}
            <ul class="sketch-notes">
              {#each v.powers as p, k}
                {#if !p.ok}
                  <li>
                    {t('edu.sketch.spanWrong')
                      .replace('{n}', String(k + 1))
                      .replace('{chose}', t('edu.sketch.power.' + p.chose))
                      .replace('{correct}', t('edu.sketch.power.' + p.correct))}
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/each}
    {#if sketchQuestions.length > 0}
      <button class="verify-btn verify-btn-small" onclick={verifySketches} disabled={sketchesComplete}>
        {sketchesComplete ? '\u2713 ' + t('edu.verified') : t('edu.sketch.verify')}
      </button>
    {/if}

    {#if exercise.diagramQuestions.length > 0}
      <p class="step-info">{t('edu.step2DescNew')}</p>

      <div class="diagram-questions">
        {#each exercise.diagramQuestions as dq, i}
          <div class="input-group {verifClass(diagramVerif[i])}">
            <label class="char-input">
              <span class="char-name">{dq.question}</span>
              <input
                type="text"
                inputmode="decimal"
                placeholder="0.00"
                value={diagramAnswers[i]}
                oninput={(e) => { diagramAnswers[i] = (e.target as HTMLInputElement).value; }}
                class={verifClass(diagramVerif[i])}
                class:revealed={revealedDiagrams[i]}
                readonly={revealedDiagrams[i]}
              />
              <span class="char-unit">{dq.unit}</span>
            </label>
            {#if canReveal && diagramVerif[i] === 'incorrect' && !revealedDiagrams[i]}
              <button class="reveal-btn" onclick={() => revealDiagram(i)} title={t('edu.reveal')}>
                {t('edu.reveal')}
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <button class="verify-btn" onclick={verifyDiagrams} disabled={step2Complete}>
        {step2Complete ? '\u2713 ' + t('edu.verified') : t('edu.verifyDiagrams')}
      </button>

      {#if diagramHints.length > 0}
        <div class="hints">
          {#each diagramHints as hint}
            <p class="hint">{hint}</p>
          {/each}
        </div>
      {/if}
    {:else}
      <p class="step-info step-info-auto">{t('edu.noDiagramQuestions')}</p>
    {/if}
  </section>
  {/if}

  <!-- Step 3: Characteristic values -->
  {#if activeStep === 3}
  <section class="step-section" class:completed={step3Complete}>
    <h3 class="step-title">
      {t('edu.step3Title')}
      {#if step3Complete}<span class="step-done">✓</span>{/if}
    </h3>

    <div class="char-inputs">
      {#each exercise.characteristics as ch, i}
        <div class="input-group {verifClass(charVerif[i])}">
          <label class="char-input">
            <span class="char-name">{ch.label} =</span>
            <input
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              value={charAnswers[i]}
              oninput={(e) => { charAnswers[i] = (e.target as HTMLInputElement).value; }}
              class={verifClass(charVerif[i])}
              class:revealed={revealedChars[i]}
              readonly={revealedChars[i]}
            />
            <span class="char-unit">{ch.unit}</span>
          </label>
          {#if canReveal && charVerif[i] === 'incorrect' && !revealedChars[i]}
            <button class="reveal-btn" onclick={() => revealChar(i)} title={t('edu.reveal')}>
              {t('edu.reveal')}
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <button class="verify-btn" onclick={verifyCharacteristics} disabled={step3Complete}>
      {step3Complete ? '\u2713 ' + t('edu.verified') : t('edu.verifyValues')}
    </button>

    {#if charHints.length > 0}
      <div class="hints">
        {#each charHints as hint}
          <p class="hint">{hint}</p>
        {/each}
      </div>
    {/if}
  </section>
  {/if}

  {#if allCorrect}
    <div class="success-banner">
      {t('edu.exerciseSolved')}
    </div>
  {/if}

  <!--
    Handing it in.
    ──────────────
    Available from the first answer, not only once everything is right: a
    student who ran out of time hands in what they have, and a teacher marking
    partial work needs it. The name field is optional because the app has no
    accounts and pretending otherwise would be a lie about what this is.
  -->
  <section class="handin" data-testid="edu-handin">
    <!-- Its own class: handing in is not one of the three steps, and a
         selector for "the step you are on" must not also match it. -->
    <h3 class="handin-title">{t('edu.handin.title')}</h3>
    <label class="handin-name">
      {t('edu.handin.name')}
      <input type="text" bind:value={studentName} placeholder={t('edu.handin.namePlaceholder')} />
    </label>
    <p class="step-info">
      {t('edu.handin.summary')
        .replace('{answered}', String(answeredCount))
        .replace('{total}', String(totalCount))}
    </p>
    <div class="handin-actions">
      <button class="handin-btn" onclick={downloadSubmission} data-testid="edu-handin-file">
        {t('edu.handin.download')}
      </button>
      <button class="handin-btn" onclick={copySubmissionCode} data-testid="edu-handin-code">
        {t('edu.handin.copyCode')}
      </button>
    </div>
    <!--
      What the teacher will see, from here.
      ─────────────────────────────────────
      "Hand it in" ended at a downloaded file, and neither side could picture
      what happened next. This is the same table the teacher opens, built from
      the answers as they stand — so the loop is visible in any exercise,
      including the built-in ones, without anyone having to send anything.
    -->
    <button class="handin-btn preview-btn" onclick={() => (showFeedback = !showFeedback)} data-testid="edu-feedback-preview">
      {showFeedback ? t('edu.handin.hideFeedback') : t('edu.handin.showFeedback')}
    </button>
    {#if showFeedback}
      <div class="handin-feedback">
        <SubmissionReview submission={buildSubmission()} onclose={() => (showFeedback = false)} />
      </div>
    {/if}
    {#if handinNote}<p class="handin-note">{handinNote}</p>{/if}
    {#if submissionCode}
      <textarea class="handin-code" readonly rows="3" value={submissionCode}></textarea>
    {/if}
  </section>
</div>

<style>
  .exercise-view {
    padding: 12px 14px;
    overflow-y: auto;
    flex: 1;
  }

  /* ─── The stepper ───────────────────────────────────────────────────
     Three states, and each one has to be legible on its own: the step you
     are on (accent), a step you finished (ok), and one you have not
     reached (text-3). It is a row of buttons now, so it also has to reset
     the button chrome the browser supplies.
     ─────────────────────────────────────────────────────────────────── */
  .progress-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 16px;
    padding: 10px 0;
  }

  .progress-step {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    padding: 2px 4px;
    font-family: inherit;
    cursor: pointer;
    border-radius: var(--st-radius);
  }

  .progress-step:hover .step-label { color: var(--st-text); }

  .step-check {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    background: var(--st-surface-3);
    color: var(--st-text-3);
    border: 1.5px solid var(--st-hair);
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }

  .progress-step.done .step-check {
    background: color-mix(in srgb, var(--st-ok) 12%, transparent);
    color: var(--st-ok);
    border-color: var(--st-ok);
  }

  .progress-step.current .step-check {
    background: var(--st-accent);
    color: var(--st-text-on-accent);
    border-color: var(--st-accent);
  }

  .step-label {
    font-size: 0.65rem;
    color: var(--st-text-3);
    transition: color 0.2s;
  }

  .progress-step.done .step-label { color: var(--st-ok); }
  .progress-step.current .step-label { color: var(--st-text); font-weight: 600; }

  .progress-line {
    width: 30px;
    height: 2px;
    background: var(--st-hair);
    margin: 0 6px;
    transition: background 0.2s;
  }

  .progress-line.done { background: var(--st-ok); }

  /* ─── Exercise description ─── */
  .exercise-description {
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
    padding: 10px 14px;
    margin-bottom: 16px;
  }

  .exercise-description p {
    font-size: 0.78rem;
    color: var(--st-text-2);
    margin: 0;
    line-height: 1.5;
  }

  /* ─── Solver insight ─── */
  .solver-insight {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
    padding: 8px 12px;
    margin-bottom: 16px;
    font-size: 0.72rem;
    color: var(--st-text-2);
    line-height: 1.4;
  }

  .solver-insight-icon {
    font-size: 1rem;
    color: var(--st-value);
    flex-shrink: 0;
  }

  /* ─── Steps ─── */
  .step-section {
    margin-bottom: 20px;
  }

  /* A finished step is no longer dimmed: it is the only thing on screen
     when you navigate back to it, and reading your own answers through
     70% opacity is not a reward. */
  .step-section.completed { opacity: 1; }

  .step-title {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
    margin: 0 0 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--st-hair);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .step-done {
    color: var(--st-ok);
    font-size: 0.9rem;
  }

  .step-info {
    font-size: 0.72rem;
    color: var(--st-text-3);
    margin: 0 0 10px;
    line-height: 1.4;
  }

  .step-info-auto {
    color: var(--st-ok);
    font-style: italic;
  }

  /* ─── Inputs ─── */
  .support-row { margin-bottom: 10px; }

  .support-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--st-text-2);
    display: block;
    margin-bottom: 4px;
  }

  .dof-inputs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dof-input, .char-input {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
  }

  .dof-name, .char-name {
    color: var(--st-text-2);
    font-weight: 500;
    min-width: 28px;
  }

  .dof-input input, .char-input input {
    width: 70px;
    padding: 4px 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.75rem;
    font-family: var(--st-mono);
    text-align: right;
  }

  .dof-input input:focus, .char-input input:focus {
    outline: none;
    border-color: var(--st-focus);
  }

  .dof-unit, .char-unit {
    color: var(--st-text-3);
    font-size: 0.65rem;
  }

  /* ─── Verification ───────────────────────────────────────────────────
     Right, wrong and revealed are three OUTCOMES, so they are the three
     semantic tokens — never colour alone: correct and incorrect also carry
     a tick and a cross in the markup, and a revealed value is italic.
     ─────────────────────────────────────────────────────────────────── */
  .verif-correct input, input.verif-correct {
    border-color: var(--st-ok) !important;
    background: color-mix(in srgb, var(--st-ok) 10%, transparent);
  }

  .verif-incorrect input, input.verif-incorrect {
    border-color: var(--st-danger) !important;
    background: color-mix(in srgb, var(--st-danger) 10%, transparent);
  }

  input.revealed {
    color: var(--st-warn) !important;
    font-style: italic;
    cursor: default;
    background: color-mix(in srgb, var(--st-warn) 10%, transparent) !important;
    border-color: var(--st-warn) !important;
  }

  /* ─── Buttons ────────────────────────────────────────────────────────
     Verifying is the action of the step, so it is the one thing on the
     accent. Revealing the answer is the opposite of what the exercise is
     for: hairline, quiet, and it never competes.
     ─────────────────────────────────────────────────────────────────── */
  .verify-btn {
    margin-top: 8px;
    padding: 6px 16px;
    background: var(--st-accent);
    border: 1px solid var(--st-accent);
    border-radius: var(--st-radius);
    color: var(--st-text-on-accent);
    font-family: var(--st-sans);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .verify-btn:hover:not(:disabled) {
    background: var(--st-accent-hover);
    border-color: var(--st-accent-hover);
  }

  .verify-btn:disabled {
    background: none;
    color: var(--st-ok);
    border-color: var(--st-ok);
    cursor: default;
  }

  .reveal-btn {
    padding: 2px 8px;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-3);
    font-family: var(--st-sans);
    font-size: 0.6rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .reveal-btn:hover {
    color: var(--st-warn);
    border-color: var(--st-warn);
  }

  /* ─── Hints ─── */
  .hints { margin-top: 8px; }

  .hint {
    font-size: 0.7rem;
    color: var(--st-warn);
    margin: 2px 0;
    line-height: 1.4;
  }

  /* ─── Question groups ─── */
  .diagram-questions, .char-inputs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ─── Section data card ─── */
  .section-data-card {
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
    padding: 10px 14px;
    margin-bottom: 16px;
  }

  .section-data-title {
    font-family: var(--st-mono);
    font-size: 0.66rem;
    font-weight: 400;
    color: var(--st-text-2);
    text-transform: uppercase;
    letter-spacing: 0.11em;
    display: block;
    margin-bottom: 8px;
  }

  .section-data-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
  }

  .section-data-item {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 0.72rem;
  }

  .section-data-label {
    color: var(--st-text-3);
    font-weight: 500;
  }

  /* Given data IS a computed number — the one job of the value token. */
  .section-data-value {
    color: var(--st-value);
    font-family: var(--st-mono);
  }

  /* ─── Kinematic classification ─── */
  .kinematic-section {
    margin: 12px 0;
    padding: 10px 12px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
  }

  .kinematic-label {
    font-size: 0.72rem;
    color: var(--st-text-2);
    font-weight: 600;
    display: block;
    margin-bottom: 8px;
  }

  .kinematic-options {
    display: flex;
    gap: 12px;
    margin-bottom: 4px;
  }

  .kinematic-degree {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.72rem;
  }

  .kinematic-degree input {
    width: 50px;
    padding: 4px 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.75rem;
    font-family: var(--st-mono);
    text-align: center;
  }

  .kinematic-degree input:focus {
    outline: none;
    border-color: var(--st-focus);
  }

  /* ─── Radio options ─── */
  .radio-option {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--st-text-2);
    cursor: pointer;
    padding: 3px 8px;
    border-radius: var(--st-radius);
    border: 1px solid transparent;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .radio-option:hover { background: var(--st-surface-3); }

  .radio-option input[type="radio"] {
    accent-color: var(--st-accent);
    margin: 0;
  }

  .radio-option.verif-correct {
    border-color: var(--st-ok);
    background: color-mix(in srgb, var(--st-ok) 10%, transparent);
    color: var(--st-ok);
  }

  .radio-option.verif-incorrect {
    border-color: var(--st-danger);
    background: color-mix(in srgb, var(--st-danger) 10%, transparent);
    color: var(--st-danger);
  }

  .radio-small {
    font-size: 0.65rem;
    padding: 2px 6px;
  }

  /* ─── Shape questions ─── */
  .shape-questions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }

  .shape-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 4px 8px;
    border-radius: var(--st-radius);
    border: 1px solid transparent;
    transition: background 0.15s, border-color 0.15s;
  }

  .shape-row.verif-correct {
    border-color: var(--st-ok);
    background: color-mix(in srgb, var(--st-ok) 8%, transparent);
  }

  .shape-row.verif-incorrect {
    border-color: var(--st-danger);
    background: color-mix(in srgb, var(--st-danger) 8%, transparent);
  }

  .shape-diagram-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--st-text-2);
    min-width: 60px;
  }

  .shape-options {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .verify-btn-small {
    font-size: 0.68rem;
    padding: 4px 12px;
    margin-bottom: 12px;
  }

  /* ─── The drawn diagram ─── */
  .sketch-block { margin: 10px 0 6px; }

  .sketch-verdict {
    display: flex;
    gap: 12px;
    font-size: 0.7rem;
    margin-top: 6px;
  }

  .sv-ok { color: var(--st-ok); }
  .sv-bad { color: var(--st-danger); }

  .sketch-worst {
    margin: 4px 0 0;
    font-size: 0.68rem;
    color: var(--st-warn);
    line-height: 1.4;
  }

  .sketch-notes {
    margin: 4px 0 0;
    padding-left: 16px;
    font-size: 0.68rem;
    color: var(--st-warn);
    line-height: 1.4;
  }

  /* ─── Handing it in ─── */
  /* Same treatment as a step heading — it is a heading in the same panel —
     without pretending to be one. */
  .handin-title {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
    margin: 0 0 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--st-hair);
  }

  .handin {
    margin-top: 22px;
    padding-top: 14px;
    border-top: 1px solid var(--st-hair);
  }

  .handin-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.72rem;
    color: var(--st-text-2);
    margin-bottom: 8px;
  }

  .handin-name input {
    flex: 1;
    padding: 4px 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: var(--st-sans);
    font-size: 0.75rem;
  }

  .handin-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /*
     Hairline, not accent. "Verify" is the action of the step on screen and
     owns the accent; handing in is available from the first answer and would
     otherwise sit beside it claiming to be equally what you came to do.
  */
  .handin-btn {
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.72rem;
    padding: 5px 12px;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }

  .handin-btn:hover { border-color: var(--st-hair-strong); color: var(--st-text); }

  .preview-btn { margin-top: 8px; }

  .handin-feedback {
    margin-top: 10px;
    padding: 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
  }

  .handin-code {
    width: 100%;
    margin-top: 8px;
    padding: 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-mono);
    font-size: 0.6rem;
    resize: vertical;
  }

  /* Its own name: `.hint` is the pedagogical hint — "check the sign" — and it
     is deliberately warn-coloured. A second rule with the same selector at the
     bottom of the file quietly repainted every one of them the colour of
     incidental text. */
  .handin-note {
    font-size: 0.68rem;
    color: var(--st-text-3);
    margin: 6px 0 0;
  }

  /* ─── Success banner ─── */
  .success-banner {
    background: color-mix(in srgb, var(--st-ok) 12%, transparent);
    border: 1px solid var(--st-ok);
    border-radius: var(--st-radius-lg);
    padding: 12px 16px;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--st-ok);
  }
</style>
