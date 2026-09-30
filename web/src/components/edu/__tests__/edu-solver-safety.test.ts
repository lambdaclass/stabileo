/**
 * Education solver safety — regression tests.
 *
 * Education deliberately hides reactions and diagrams until the student has
 * answered. It was also hiding things it must not hide:
 *
 *  - it never ran the non-finite displacement gate that all three Basic solve
 *    paths run, so a degenerate result could be used to grade a student;
 *  - it discarded every severity-`warning` solver diagnostic.
 *
 * And it dispatched through a window listener registered on `EducativePanel`
 * mount, so a solve fired before mount silently did nothing.
 *
 * These tests pin all four behaviours, plus the requirement that surfacing a
 * warning must never reveal the answer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../../lib/store';
import { eduStore } from '../edu-store.svelte';
import { solveForEdu } from '../edu-solver';
import { runGlobalSolve } from '../../../lib/engine/live-calc';

type Toast = { message: string; type: string };
let toasts: Toast[] = [];

/** A minimal well-formed 2D result. */
function fakeResult(overrides: Record<string, unknown> = {}) {
  return {
    displacements: [
      { nodeId: 1, ux: 0, uz: 0, ry: 0 },
      { nodeId: 2, ux: 0, uz: -0.001, ry: -0.0005 },
    ],
    reactions: [{ nodeId: 1, rx: 0, rz: 10, my: 40 }],
    elementForces: [
      {
        elementId: 1, nStart: 0, nEnd: 0, vStart: 10, vEnd: 10,
        mStart: 40, mEnd: 0, length: 4, qI: 0, qJ: 0,
        pointLoads: [], distributedLoads: [],
      },
    ],
    diagnostics: [],
    solverDiagnostics: [],
    ...overrides,
  } as any;
}

beforeEach(() => {
  // `edu-solver` dispatches a completion event; Node has no window.
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), addEventListener: vi.fn() });

  modelStore.clear();
  resultsStore.clear();
  eduStore.clearExercise();
  uiStore.analysisMode = 'edu';

  const n1 = modelStore.addNode(0, 0);
  const n2 = modelStore.addNode(4, 0);
  modelStore.addElement(n1, n2);
  modelStore.addSupport(n1, 'fixed');
  modelStore.addNodalLoad(n2, 0, -10, 0);

  toasts = [];
  vi.spyOn(uiStore, 'toast').mockImplementation(((message: string, type: string) => {
    toasts.push({ message, type });
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  eduStore.clearExercise();
  resultsStore.clear();
  modelStore.clear();
  uiStore.analysisMode = '2d';
});

describe('invalid numerical results', () => {
  it('refuses to publish or grade a result with non-finite displacements', () => {
    vi.spyOn(modelStore, 'solve').mockReturnValue(
      fakeResult({
        displacements: [
          { nodeId: 1, ux: 0, uz: 0, ry: 0 },
          { nodeId: 2, ux: NaN, uz: -1e9, ry: 0 },
        ],
      }),
    );

    solveForEdu();

    expect(eduStore.results).toBeNull();
    expect(resultsStore.results).toBeNull();
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });

  it('refuses on an Infinity rotation as well', () => {
    vi.spyOn(modelStore, 'solve').mockReturnValue(
      fakeResult({
        displacements: [{ nodeId: 1, ux: 0, uz: 0, ry: Infinity }],
      }),
    );

    solveForEdu();
    expect(eduStore.results).toBeNull();
  });
});

describe('hard errors', () => {
  it('propagates a solver/validation error string as an error toast', () => {
    vi.spyOn(modelStore, 'solve').mockReturnValue(
      'Mecanismo en nodo 2 (1 modo de mecanismo).' as never,
    );

    solveForEdu();

    expect(eduStore.results).toBeNull();
    expect(toasts).toContainEqual({
      message: 'Mecanismo en nodo 2 (1 modo de mecanismo).',
      type: 'error',
    });
  });

  it('propagates an empty model as an error toast', () => {
    vi.spyOn(modelStore, 'solve').mockReturnValue(null as never);

    solveForEdu();

    expect(eduStore.results).toBeNull();
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });
});

describe('solver warnings', () => {
  it('surfaces severity-warning diagnostics that used to be discarded', () => {
    vi.spyOn(modelStore, 'solve').mockReturnValue(
      fakeResult({
        solverDiagnostics: [
          { severity: 'warning', message: 'Large displacement detected' },
        ],
      }),
    );

    solveForEdu();

    expect(toasts.some((t) => t.message === 'Large displacement detected')).toBe(true);
    // A warning is not a failure: the result is still published for grading.
    expect(eduStore.results).not.toBeNull();
  });

  it('does NOT reveal answers just because a warning was shown', () => {
    vi.spyOn(modelStore, 'solve').mockReturnValue(
      fakeResult({
        solverDiagnostics: [
          { severity: 'warning', message: 'Large displacement detected' },
        ],
      }),
    );

    solveForEdu();

    expect(toasts.some((t) => t.message === 'Large displacement detected')).toBe(true);
    expect(resultsStore.diagramType).toBe('none');
    expect(resultsStore.showReactions).toBe(false);
  });
});

describe('valid solve', () => {
  it('publishes results while keeping the answer-bearing output hidden', () => {
    vi.spyOn(modelStore, 'solve').mockReturnValue(fakeResult());

    solveForEdu();

    expect(eduStore.results).not.toBeNull();
    expect(resultsStore.results).not.toBeNull();
    expect(resultsStore.diagramType).toBe('none');
    expect(resultsStore.showReactions).toBe(false);
  });
});

describe('dispatch does not depend on listener registration order', () => {
  it('runGlobalSolve drives the Education solve directly in edu mode', async () => {
    const solveSpy = vi.spyOn(modelStore, 'solve').mockReturnValue(fakeResult());

    // No listener has been registered by any component here — the old design
    // returned early and relied on `EducativePanel` having mounted first.
    await runGlobalSolve();

    expect(solveSpy).toHaveBeenCalled();
    expect(eduStore.results).not.toBeNull();
    expect(resultsStore.diagramType).toBe('none');
  });
});

describe('a P-Δ exercise on a model the solver refuses', () => {
  it('says why, as the linear exercises do, instead of throwing', async () => {
    await new Promise((r) => setTimeout(r, 0));
    eduStore.loadExercise({ id: 'pd', solverType: 'pdelta' } as never);
    // The student leaves a stray node: the static solve refuses the model.
    modelStore.addNode(9, 9);
    expect(() => solveForEdu()).not.toThrow();
    expect(eduStore.results).toBeNull();
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });
});
