<script lang="ts">
  import { t } from '../../lib/i18n';
  let {
    matrix = [],
    rowLabels = [],
    colLabels = [],
    highlightRows = new Set<number>(),
    highlightCols = new Set<number>(),
    precision = 3,
    compact = false,
    title = '',
    editable = false,
  }: {
    matrix: number[][];
    rowLabels?: string[];
    colLabels?: string[];
    highlightRows?: Set<number>;
    highlightCols?: Set<number>;
    precision?: number;
    compact?: boolean;
    title?: string;
    editable?: boolean;
  } = $props();

  // Quiz state: user answers per cell [row][col]
  let answers = $state<(string | null)[][]>([]);
  let feedback = $state<('correct' | 'wrong' | null)[][]>([]);

  // Reset answers when matrix changes
  $effect(() => {
    if (editable && matrix.length > 0) {
      answers = matrix.map(row => row.map(() => null));
      feedback = matrix.map(row => row.map(() => null));
    }
  });

  function fmt(val: number): string {
    if (compact && Math.abs(val) < 1e-10) return '·';
    if (Math.abs(val) < 1e-10) return '0';
    // Use scientific notation for very large/small numbers
    if (Math.abs(val) >= 1e6 || (Math.abs(val) < 0.001 && Math.abs(val) > 0)) {
      return val.toExponential(precision - 1);
    }
    return val.toFixed(precision);
  }

  function cellClass(val: number, row: number, col: number): string {
    const classes: string[] = [];
    if (highlightRows.has(row) || highlightCols.has(col)) classes.push('hl');
    if (highlightRows.has(row) && highlightCols.has(col)) classes.push('hl-both');
    if (val > 1e-10) classes.push('pos');
    else if (val < -1e-10) classes.push('neg');
    else classes.push('zero');
    return classes.join(' ');
  }

  function checkAnswer(row: number, col: number, inputVal: string): void {
    const expected = matrix[row][col];
    const parsed = parseFloat(inputVal);
    if (isNaN(parsed)) {
      feedback[row][col] = null;
      return;
    }
    answers[row][col] = inputVal;
    // Tolerance: within 1% or absolute 0.01
    const tol = Math.max(Math.abs(expected) * 0.01, 0.01);
    feedback[row][col] = Math.abs(parsed - expected) <= tol ? 'correct' : 'wrong';
  }

  // Count stats
  const quizStats = $derived.by(() => {
    if (!editable) return null;
    let total = 0;
    let answered = 0;
    let correct = 0;
    for (let i = 0; i < feedback.length; i++) {
      for (let j = 0; j < (feedback[i]?.length ?? 0); j++) {
        total++;
        if (feedback[i][j] !== null) {
          answered++;
          if (feedback[i][j] === 'correct') correct++;
        }
      }
    }
    return { total, answered, correct };
  });
</script>

{#if title}
  <div class="matrix-title">
    {title}
    {#if editable && quizStats}
      <span class="quiz-stats">
        {quizStats.correct}/{quizStats.answered} correctas
        {#if quizStats.answered > 0}
          ({Math.round(quizStats.correct / quizStats.answered * 100)}%)
        {/if}
      </span>
    {/if}
  </div>
{/if}
<div class="matrix-scroll">
  <table class="matrix-table">
    {#if colLabels.length > 0}
      <thead>
        <tr>
          <th class="corner"></th>
          {#each colLabels as label, j}
            <th class:hl={highlightCols.has(j)}>{label}</th>
          {/each}
        </tr>
      </thead>
    {/if}
    <tbody>
      {#each matrix as row, i}
        <tr>
          {#if rowLabels.length > 0}
            <th class="row-label" class:hl={highlightRows.has(i)}>{rowLabels[i] ?? ''}</th>
          {/if}
          {#each row as cell, j}
            {#if editable}
              <td
                class="quiz-cell"
                class:quiz-correct={feedback[i]?.[j] === 'correct'}
                class:quiz-wrong={feedback[i]?.[j] === 'wrong'}
                class:quiz-zero={compact && Math.abs(cell) < 1e-10 && feedback[i]?.[j] === null}
              >
                {#if compact && Math.abs(cell) < 1e-10}
                  <!-- Zero cells auto-filled in quiz mode -->
                  <span class="quiz-auto">·</span>
                {:else if feedback[i]?.[j] !== null}
                  <span class="quiz-answer">{answers[i]?.[j]}</span>
                  <span class="quiz-expected" title="{t('dsm.expectedValue')}: {fmt(cell)}">{feedback[i]?.[j] === 'correct' ? '' : fmt(cell)}</span>
                {:else}
                  <input
                    type="text"
                    class="quiz-input"
                    placeholder="?"
                    onblur={(e) => checkAnswer(i, j, (e.target as HTMLInputElement).value)}
                    onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                {/if}
              </td>
            {:else}
              <td class={cellClass(cell, i, j)}>{fmt(cell)}</td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .matrix-title {
    font-size: 0.7rem;
    color: #888;
    margin-bottom: 0.25rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .quiz-stats {
    font-weight: 400;
    color: #4ecdc4;
    font-size: 0.65rem;
  }
  .matrix-scroll {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 300px;
  }
  .matrix-table {
    border-collapse: collapse;
    font-family: 'Courier New', monospace;
    font-size: 0.65rem;
    white-space: nowrap;
  }
  .matrix-table th {
    padding: 0.15rem 0.3rem;
    background: #16213e;
    color: #888;
    font-weight: 500;
    font-size: 0.6rem;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .matrix-table th.corner {
    z-index: 2;
    left: 0;
  }
  .matrix-table th.row-label {
    position: sticky;
    left: 0;
    z-index: 1;
    text-align: right;
  }
  .matrix-table th.hl {
    background: rgba(78, 205, 196, 0.2);
    color: #4ecdc4;
  }
  .matrix-table td {
    padding: 0.15rem 0.3rem;
    text-align: right;
    border: 1px solid #1a1a2e;
    background: #0f0f1e;
  }
  .matrix-table td.pos { color: #4ecdc4; }
  .matrix-table td.neg { color: #e94560; }
  .matrix-table td.zero { color: #444; }
  .matrix-table td.hl {
    background: rgba(78, 205, 196, 0.08);
  }
  .matrix-table td.hl-both {
    background: rgba(78, 205, 196, 0.2);
    font-weight: 600;
  }

  /* Quiz mode styles */
  .quiz-cell {
    padding: 0.1rem 0.15rem;
    min-width: 48px;
  }
  .quiz-cell.quiz-correct {
    background: rgba(78, 205, 196, 0.2) !important;
    border-color: #4ecdc4 !important;
  }
  .quiz-cell.quiz-wrong {
    background: rgba(233, 69, 96, 0.2) !important;
    border-color: #e94560 !important;
  }
  .quiz-cell.quiz-zero {
    background: #0f0f1e;
  }
  .quiz-input {
    width: 48px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed #444;
    border-radius: 2px;
    color: #ddd;
    font-family: 'Courier New', monospace;
    font-size: 0.62rem;
    text-align: right;
    padding: 1px 3px;
  }
  .quiz-input:focus {
    outline: none;
    border-color: #4ecdc4;
    background: rgba(78, 205, 196, 0.08);
  }
  .quiz-input::placeholder {
    color: #555;
    text-align: center;
  }
  .quiz-answer {
    font-weight: 600;
  }
  .quiz-expected {
    font-size: 0.55rem;
    color: #e94560;
    display: block;
    opacity: 0.7;
  }
  .quiz-auto {
    color: #444;
  }
</style>
