import { ApiError } from '../../lib/api/client';
import { examsApi, type Attempt, type Exam } from '../../lib/api/assignments';
import { examLock } from '../../lib/store/exam-lock.svelte';
import type { EduExerciseSpec } from './exercise-spec';
import type { SubmittedAnswer } from './exercise-submission';
import { examSubmission, exerciseFromEnvelope, gradeAttempt, storedSubmission } from './exam-grading';

export type ExamPhase = 'loading' | 'signin' | 'lobby' | 'running' | 'closed' | 'unavailable';
export type ExamUnavailable = 'disabled' | 'notFound' | 'upcoming' | 'closed' | 'signinOff' | 'badExercise' | 'error';
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';
export type ExamNote = 'autoSubmitted' | 'lateSubmit' | 'submitFailed' | null;

export interface ExamSessionDeps {
  api: Pick<typeof examsApi, 'get' | 'start' | 'attempt' | 'saveAnswers' | 'submit'>;
  lock: Pick<typeof examLock, 'engage' | 'release' | 'syncClock' | 'remainingMs' | 'locked'>;
  auth: { ready(): Promise<void>; readonly isAuthenticated: boolean; readonly assignmentsEnabled: boolean; readonly userLoginEnabled: boolean };
  score?: (spec: EduExerciseSpec, seed: number, answers: unknown) => number | null;
  debounceMs?: number;
}

const defaultScore = (spec: EduExerciseSpec, seed: number, answers: unknown) => gradeAttempt(spec, seed, answers)?.fraction ?? null;

function unavailableFor(e: unknown): ExamUnavailable | 'signin' {
  if (!(e instanceof ApiError)) return 'error';
  if (e.status === 401) return 'signin';
  if (e.status === 403) return 'disabled';
  if (e.status === 404) return 'notFound';
  if (e.code === 'assignment_not_open') return 'upcoming';
  if (e.code === 'assignment_closed') return 'closed';
  return 'error';
}

const closedByServer = (e: unknown) => e instanceof ApiError && e.status === 409 && (e.code === 'attempt_closed' || e.code === 'attempt_submitted');

export function createExamSession(deps: ExamSessionDeps) {
  const { api, lock, auth } = deps;
  const score = deps.score ?? defaultScore;
  const debounceMs = deps.debounceMs ?? 1500;

  let phase = $state<ExamPhase>('loading');
  let unavailable = $state<ExamUnavailable | null>(null);
  let exam = $state.raw<Exam | null>(null);
  let attempt = $state.raw<Attempt | null>(null);
  let spec = $state.raw<EduExerciseSpec | null>(null);
  let answers = $state.raw<SubmittedAnswer[]>([]);
  let saveState = $state<SaveState>('idle');
  let note = $state<ExamNote>(null);
  let busy = $state(false);

  let code = '';
  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  function stopTimers(): void {
    if (saveTimer !== null) clearTimeout(saveTimer);
    if (deadlineTimer !== null) clearTimeout(deadlineTimer);
    saveTimer = deadlineTimer = null;
  }

  function fail(e: unknown): void {
    stopTimers();
    const why = unavailableFor(e);
    lock.release(why === 'disabled' ? 'disabled' : 'error');
    if (why === 'signin') {
      phase = 'signin';
      return;
    }
    unavailable = why;
    phase = 'unavailable';
  }

  function payload() {
    return examSubmission(spec!, attempt!.seed, answers) as unknown as Record<string, unknown>;
  }

  function adopt(a: Attempt): void {
    attempt = a;
    lock.syncClock(a.now);
    const parsed = exerciseFromEnvelope(a.exercise);
    if (!parsed) {
      fail(null);
      unavailable = 'badExercise';
      return;
    }
    spec = parsed;
    if (!dirty) answers = storedSubmission(a.answers)?.answers ?? [];
    if (a.closed) {
      stopTimers();
      lock.release(a.submitted_at ? 'submitted' : 'deadline');
      phase = 'closed';
      return;
    }
    if (!lock.engage({ deadlineAt: a.deadline_at, serverNow: a.now })) {
      phase = 'closed';
      return;
    }
    phase = 'running';
    if (deadlineTimer !== null) clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(() => void session.submit(true), lock.remainingMs() ?? 0);
  }

  async function openAttempt(fetch: () => Promise<Attempt>): Promise<void> {
    busy = true;
    try {
      adopt(await fetch());
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  async function closeFromServer(): Promise<void> {
    stopTimers();
    lock.release('deadline');
    dirty = false;
    try {
      const a = await api.attempt(attempt!.id);
      attempt = a;
      answers = storedSubmission(a.answers)?.answers ?? [];
    } catch {
      attempt = { ...attempt!, closed: true };
    }
    phase = 'closed';
  }

  async function write(): Promise<void> {
    if (!dirty || phase !== 'running' || !attempt || !spec) return;
    dirty = false;
    saveState = 'saving';
    try {
      const a = await api.saveAnswers(attempt.id, payload());
      attempt = { ...a, answers: a.answers };
      lock.syncClock(a.now);
      saveState = dirty ? 'pending' : 'saved';
      if (!lock.locked && phase === 'running') lock.engage({ deadlineAt: a.deadline_at, serverNow: a.now });
    } catch (e) {
      if (closedByServer(e)) {
        note = 'lateSubmit';
        await closeFromServer();
        return;
      }
      if (e instanceof ApiError && e.status === 403) {
        fail(e);
        return;
      }
      dirty = true;
      saveState = 'failed';
      lock.release('error');
    }
  }

  const session = {
    get phase() { return phase; },
    get unavailable() { return unavailable; },
    get exam() { return exam; },
    get attempt() { return attempt; },
    get spec() { return spec; },
    get answers() { return answers; },
    get saveState() { return saveState; },
    get note() { return note; },
    get busy() { return busy; },
    get code() { return code; },

    async load(next: string): Promise<void> {
      code = next.trim().toUpperCase();
      phase = 'loading';
      unavailable = null;
      note = null;
      await auth.ready();
      if (!auth.isAuthenticated) {
        if (auth.userLoginEnabled) phase = 'signin';
        else { unavailable = 'signinOff'; phase = 'unavailable'; }
        return;
      }
      if (!auth.assignmentsEnabled) {
        fail(new ApiError(403, 'assignments_disabled', ''));
        return;
      }
      try {
        exam = await api.get(code);
      } catch (e) {
        fail(e);
        return;
      }
      lock.syncClock(exam.now);
      if (exam.attempt) {
        await openAttempt(() => api.attempt(exam!.attempt!.id));
        return;
      }
      if (exam.status === 'closed') {
        unavailable = 'closed';
        phase = 'unavailable';
        return;
      }
      phase = 'lobby';
    },

    start(): Promise<void> {
      return openAttempt(() => api.start(code));
    },

    update(next: SubmittedAnswer[]): void {
      if (phase !== 'running') return;
      answers = next;
      dirty = true;
      saveState = 'pending';
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; void session.flush(); }, debounceMs);
    },

    /** Saves now whatever is waiting; chained, so two flushes never send out of order. */
    flush(): Promise<void> {
      if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
      const run = (inFlight ?? Promise.resolve()).then(write);
      inFlight = run.finally(() => { if (inFlight === run) inFlight = null; });
      return run;
    },

    async submit(auto = false): Promise<void> {
      if (phase !== 'running' || !attempt || !spec) return;
      if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
      await inFlight;
      if (phase !== 'running') return;
      busy = true;
      const body = payload();
      let clientScore: number | null = null;
      try { clientScore = score(spec, attempt.seed, body); } catch { clientScore = null; }
      try {
        const a = await api.submit(attempt.id, clientScore === null ? { answers: body } : { answers: body, client_score: clientScore });
        stopTimers();
        dirty = false;
        lock.release('submitted');
        attempt = a;
        saveState = 'saved';
        note = auto ? 'autoSubmitted' : null;
        phase = 'closed';
      } catch (e) {
        if (closedByServer(e)) {
          note = 'lateSubmit';
          await closeFromServer();
        } else if (e instanceof ApiError && e.status === 403) {
          fail(e);
        } else {
          dirty = true;
          saveState = 'failed';
          note = 'submitFailed';
          lock.release('error');
        }
      } finally {
        busy = false;
      }
    },

    /** Reads the attempt again: results open up later for `after_close`. */
    async refresh(): Promise<void> {
      if (!attempt) return;
      busy = true;
      try {
        const a = await api.attempt(attempt.id);
        attempt = a;
        lock.syncClock(a.now);
      } catch {
        return;
      } finally {
        busy = false;
      }
    },

    dispose(): void {
      stopTimers();
      lock.release('left');
    },
  };
  return session;
}

export type ExamSession = ReturnType<typeof createExamSession>;
