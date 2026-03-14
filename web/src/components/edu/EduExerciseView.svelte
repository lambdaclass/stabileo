<script lang="ts">
  import { resultsStore } from '../../lib/store';
  import type { EduExercise, DiagramShape } from './exercises';
  import { t } from '../../lib/i18n';
  import { eduStore } from './edu-store.svelte';
  import type { SolveTimings } from '../../lib/engine/types';

  const SHAPE_OPTIONS: DiagramShape[] = ['zero', 'constant', 'linear', 'quadratic'];

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
    (exercise.diagramQuestions.length === 0 || diagramVerif.every(s => s === 'correct')) && shapesComplete
  );
  const step3Complete = $derived(
    charVerif.every(s => s === 'correct')
  );
  const allCorrect = $derived(step1Complete && step2Complete && step3Complete);

  // ─── Reaction verification ─────────────────────────────────
  function getCorrectReaction(supportIndex: number, dof: string): number | null {
    const results = eduStore.results;
    if (!results) return null;
    const reactions = results.reactions;
    if (supportIndex >= reactions.length) return null;
    const r = reactions[supportIndex];
    switch (dof) {
      case 'Rx': return r.rx;
      case 'Ry': return r.ry;
      case 'M': return r.mz ?? 0;
      default: return null;
    }
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

    const prefix = dof ? `${label}, ${dof}` : label;
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
        if (correct === null || isNaN(studentVal)) { newVerif[i][dof] = 'pending'; continue; }

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
    if (correct === null) return;
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

    hints = hints.filter(h => !h.startsWith(`${exercise.supports[supIdx].label}, ${dof}`));
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

<div class="exercise-view">
  <!-- Progress bar -->
  <div class="progress-bar">
    <div class="progress-step" class:done={step1Complete}>
      <span class="step-check">{step1Complete ? '\u2713' : '1'}</span>
      <span class="step-label">{t('edu.reactions')}</span>
    </div>
    <div class="progress-line" class:done={step1Complete}></div>
    <div class="progress-step" class:done={step2Complete}>
      <span class="step-check">{step2Complete ? '\u2713' : '2'}</span>
      <span class="step-label">{t('edu.diagrams')}</span>
    </div>
    <div class="progress-line" class:done={step2Complete}></div>
    <div class="progress-step" class:done={step3Complete}>
      <span class="step-check">{step3Complete ? '\u2713' : '3'}</span>
      <span class="step-label">{t('edu.values')}</span>
    </div>
  </div>

  <div class="exercise-description">
    <p>{exercise.description}</p>
  </div>

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
                <span class="dof-name">{dof} =</span>
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
              {#if reactionVerif[i][dof] === 'incorrect' && !revealedReactions[i][dof]}
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

  <!-- Step 2: Diagram questions -->
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
            {#if diagramVerif[i] === 'incorrect' && !revealedDiagrams[i]}
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

  <!-- Step 3: Characteristic values -->
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
          {#if charVerif[i] === 'incorrect' && !revealedChars[i]}
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

  {#if allCorrect}
    <div class="success-banner">
      {t('edu.exerciseSolved')}
    </div>
  {/if}
</div>

<style>
  .exercise-view {
    padding: 12px 14px;
    overflow-y: auto;
    flex: 1;
  }

  /* ─── Progress bar ─── */
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
    gap: 4px;
  }

  .step-check {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    background: #1a2a44;
    color: #666;
    border: 1.5px solid #334;
    transition: all 0.3s;
  }

  .progress-step.done .step-check {
    background: #1a3a2a;
    color: #4caf50;
    border-color: #4caf50;
  }

  .step-label {
    font-size: 0.65rem;
    color: #666;
    transition: color 0.3s;
  }

  .progress-step.done .step-label {
    color: #4caf50;
  }

  .progress-line {
    width: 30px;
    height: 2px;
    background: #334;
    margin: 0 6px;
    transition: background 0.3s;
  }

  .progress-line.done {
    background: #4caf50;
  }

  /* ─── Exercise description ─── */
  .exercise-description {
    background: #0f2840;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 16px;
  }

  .exercise-description p {
    font-size: 0.78rem;
    color: #bbb;
    margin: 0;
    line-height: 1.5;
  }

  /* ─── Solver insight ─── */
  .solver-insight {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 16px;
    font-size: 0.72rem;
    color: #8cc;
    line-height: 1.4;
  }

  .solver-insight-icon {
    font-size: 1rem;
    color: #4ecdc4;
    flex-shrink: 0;
  }

  /* ─── Steps ─── */
  .step-section {
    margin-bottom: 20px;
    transition: opacity 0.3s;
  }

  .step-section.completed {
    opacity: 0.7;
  }

  .step-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #4ecdc4;
    margin: 0 0 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #1a3a5a;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .step-done {
    color: #4caf50;
    font-size: 0.9rem;
  }

  .step-info {
    font-size: 0.72rem;
    color: #888;
    margin: 0 0 10px;
    line-height: 1.4;
  }

  .step-info-auto {
    color: #4caf50;
    font-style: italic;
  }

  /* ─── Inputs ─── */
  .support-row {
    margin-bottom: 10px;
  }

  .support-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: #aaa;
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
    color: #aaa;
    font-weight: 500;
    min-width: 28px;
  }

  .dof-input input, .char-input input {
    width: 70px;
    padding: 4px 6px;
    background: #0a1628;
    border: 1px solid #334;
    border-radius: 4px;
    color: #eee;
    font-size: 0.75rem;
    font-family: monospace;
    text-align: right;
  }

  .dof-input input:focus, .char-input input:focus {
    outline: none;
    border-color: #4ecdc4;
  }

  .dof-unit, .char-unit {
    color: #666;
    font-size: 0.65rem;
  }

  /* ─── Verification colors ─── */
  .verif-correct input, input.verif-correct {
    border-color: #4caf50 !important;
    background: #0a200a;
  }

  .verif-incorrect input, input.verif-incorrect {
    border-color: #e94560 !important;
    background: #200a0a;
  }

  input.revealed {
    color: #f0a500 !important;
    font-style: italic;
    cursor: default;
    background: #1a1a0a !important;
    border-color: #f0a500 !important;
  }

  /* ─── Buttons ─── */
  .verify-btn {
    margin-top: 8px;
    padding: 6px 16px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #4ecdc4;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .verify-btn:hover:not(:disabled) {
    background: #1a4a7a;
  }

  .verify-btn:disabled {
    opacity: 0.6;
    cursor: default;
    color: #4caf50;
    border-color: #4caf50;
  }

  .reveal-btn {
    padding: 2px 8px;
    background: none;
    border: 1px solid #555;
    border-radius: 3px;
    color: #888;
    font-size: 0.6rem;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .reveal-btn:hover {
    color: #f0a500;
    border-color: #f0a500;
  }

  /* ─── Hints ─── */
  .hints {
    margin-top: 8px;
  }

  .hint {
    font-size: 0.7rem;
    color: #f0a500;
    margin: 2px 0;
    line-height: 1.4;
  }

  /* ─── Diagram questions ─── */
  .diagram-questions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .char-inputs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ─── Section data card ─── */
  .section-data-card {
    background: #0f1a2e;
    border: 1px solid #2a4a6a;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 16px;
  }

  .section-data-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: #f0a500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
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
    color: #888;
    font-weight: 500;
  }

  .section-data-value {
    color: #ddd;
    font-family: monospace;
  }

  /* ─── Kinematic classification ─── */
  .kinematic-section {
    margin: 12px 0;
    padding: 10px 12px;
    background: #0f1a2e;
    border: 1px solid #1a3a5a;
    border-radius: 6px;
  }

  .kinematic-label {
    font-size: 0.72rem;
    color: #aaa;
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
    background: #0a1628;
    border: 1px solid #334;
    border-radius: 4px;
    color: #eee;
    font-size: 0.75rem;
    font-family: monospace;
    text-align: center;
  }

  .kinematic-degree input:focus {
    outline: none;
    border-color: #4ecdc4;
  }

  /* ─── Radio options ─── */
  .radio-option {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: #bbb;
    cursor: pointer;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .radio-option:hover {
    background: rgba(78, 205, 196, 0.08);
  }

  .radio-option input[type="radio"] {
    accent-color: #4ecdc4;
    margin: 0;
  }

  .radio-option.verif-correct {
    border-color: #4caf50;
    background: #0a200a;
    color: #4caf50;
  }

  .radio-option.verif-incorrect {
    border-color: #e94560;
    background: #200a0a;
    color: #e94560;
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
    border-radius: 4px;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .shape-row.verif-correct {
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.05);
  }

  .shape-row.verif-incorrect {
    border-color: #e94560;
    background: rgba(233, 69, 96, 0.05);
  }

  .shape-diagram-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: #aaa;
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

  /* ─── Success banner ─── */
  .success-banner {
    background: #1a3a2a;
    border: 1px solid #4caf50;
    border-radius: 6px;
    padding: 12px 16px;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    color: #4caf50;
  }
</style>
