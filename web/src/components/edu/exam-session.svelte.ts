import { ApiError } from '../../lib/api/client';
import { examsApi, type Attempt, type Exam } from '../../lib/api/assignments';
import { canonicalJson } from '../../lib/store/design-fingerprint';
import { examLock, EXAM_GRACE_MS } from '../../lib/store/exam-lock.svelte';
import type { EduExerciseSpec } from './exercise-spec';
import type { SubmittedAnswer } from './exercise-submission';
import { examSubmission, exerciseFromEnvelope, gradeAttempt, storedSubmission } from './exam-grading';

export type ExamPhase = 'loading' | 'signin' | 'lobby' | 'running' | 'closed' | 'unavailable';
export type ExamUnavailable = 'disabled' | 'notFound' | 'upcoming' | 'closed' | 'signinOff' | 'badExercise' | 'conflict' | 'error';
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';
export type ExamNote = 'autoSubmitted' | 'lateSubmit' | 'submitFailed' | null;

export interface ExamSessionDeps {
  api: Pick<typeof examsApi, 'get' | 'start' | 'attempt' | 'saveAnswers' | 'submit'>;
  lock: Pick<typeof examLock, 'engage' | 'release' | 'syncClock' | 'remainingMs' | 'locked' | 'serverNow'>;
  auth: { ready(): Promise<void>; readonly isAuthenticated: boolean; readonly assignmentsEnabled: boolean; readonly userLoginEnabled: boolean };
  score?: (spec: EduExerciseSpec, seed: number, answers: unknown) => number | null;
  debounceMs?: number;
  retryMs?: number;
}

const defaultScore = (spec: EduExerciseSpec, seed: number, answers: unknown) => gradeAttempt(spec, seed, answers)?.fraction ?? null;

function unavailableFor(e: unknown): ExamUnavailable | 'signin' {
  if (!(e instanceof ApiError)) return 'error';
  if (e.code === 'stale_revision') return 'conflict';
  if (e.status === 401) return 'signin';
  if (e.status === 403) return 'disabled';
  if (e.status === 404) return 'notFound';
  if (e.code === 'assignment_not_open') return 'upcoming';
  if (e.code === 'assignment_closed') return 'closed';
  return 'error';
}

const closedByServer = (e: unknown) => e instanceof ApiError && e.status === 409 && (e.code === 'attempt_closed' || e.code === 'attempt_submitted');

function createAttemptSession(deps: ExamSessionDeps) {
  const { api, lock, auth } = deps;
  const score = deps.score ?? defaultScore;
  const debounceMs = deps.debounceMs ?? 1500;
  const retryMs = deps.retryMs ?? 5000;

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
  let submitting: Promise<void> | null = null;
  let disposed = false;
  let frozen = $state.raw<{ answers: Record<string, unknown>; client_score?: number } | null>(null);
  let pendingSave: { revision: number; answers: Record<string, unknown> } | null = null;
  let revision = 0;

  function stopTimers(): void {
    if (saveTimer !== null) clearTimeout(saveTimer);
    if (deadlineTimer !== null) clearTimeout(deadlineTimer);
    saveTimer = deadlineTimer = null;
  }

  function fail(e: unknown): void {
    if (disposed) return;
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
    if (disposed) return;
    revision = a.revision;
    attempt = a;
    lock.syncClock(a.now);
    const parsed = exerciseFromEnvelope(a.exercise);
    if (!parsed) {
      fail(null);
      unavailable = 'badExercise';
      return;
    }
    spec = parsed;
    if (!dirty && (!frozen || canonicalJson(a.answers) !== canonicalJson(frozen.answers))) answers = storedSubmission(a.answers)?.answers ?? [];
    if (a.closed) {
      stopTimers();
      lock.release(a.submitted_at ? 'submitted' : 'deadline');
      phase = 'closed';
      return;
    }
    if (!lock.engage({ deadlineAt: a.deadline_at, serverNow: a.now })) {
      if (!Number.isFinite(Date.parse(a.deadline_at)) || !Number.isFinite(Date.parse(a.now))) {
        fail(null);
        return;
      }
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
      if (disposed) return;
      attempt = a;
      answers = storedSubmission(a.answers)?.answers ?? [];
    } catch {
      if (disposed) return;
      note = 'lateSubmit';
      phase = 'unavailable';
      unavailable = 'error';
      return;
    }
    phase = 'closed';
  }

  async function write(): Promise<void> {
    if (!dirty || frozen || phase !== 'running' || !attempt || !spec) return;
    dirty = false;
    saveState = 'saving';
    try {
      const sent = pendingSave ?? { revision, answers: JSON.parse(JSON.stringify(payload())) as Record<string, unknown> };
      pendingSave = sent;
      let a: Attempt;
      try {
        a = await api.saveAnswers(attempt.id, sent.answers, sent.revision);
      } catch (e) {
        if (disposed || !(e instanceof ApiError) || e.code !== 'stale_revision') throw e;
        a = await api.attempt(attempt.id);
        if (a.revision !== sent.revision + 1 || canonicalJson(a.answers) !== canonicalJson(sent.answers)) throw e;
      }
      revision = Math.max(revision, a.revision);
      if (disposed || frozen || phase !== 'running') return;
      pendingSave = null;
      attempt = a;
      lock.syncClock(a.now);
      if (a.closed) {
        dirty = false;
        adopt(a);
        return;
      }
      dirty ||= canonicalJson(answers) !== canonicalJson(sent.answers.answers);
      saveState = dirty ? 'pending' : 'saved';
      if (dirty && saveTimer === null) saveTimer = setTimeout(() => { saveTimer = null; void session.flush(); }, debounceMs);
      if (!lock.locked && phase === 'running') lock.engage({ deadlineAt: a.deadline_at, serverNow: a.now });
    } catch (e) {
      if (disposed || frozen) return;
      if (e instanceof ApiError && e.code === 'stale_revision') {
        fail(e);
        return;
      }
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
      if (saveTimer === null) saveTimer = setTimeout(() => { saveTimer = null; void session.flush(); }, retryMs);
    }
  }

  async function submitOnce(auto: boolean): Promise<void> {
    if (phase !== 'running' || !attempt || !spec) return;
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
    busy = true;
    dirty = false;
    if (!frozen) {
      const body = JSON.parse(JSON.stringify(payload())) as Record<string, unknown>;
      let clientScore: number | null = null;
      try { if (attempt.exercise.questionsOnly !== true) clientScore = score(spec, attempt.seed, body); } catch { clientScore = null; }
      frozen = clientScore === null ? { answers: body } : { answers: body, client_score: clientScore };
    }
    const final = frozen;
    const sentRevision = revision;
    const competing = pendingSave;
    const id = attempt.id;
    try {
      let a: Attempt;
      try {
        a = await api.submit(id, { ...final, revision: sentRevision });
      } catch (e) {
        if (disposed || !(e instanceof ApiError) || e.code !== 'stale_revision' || competing?.revision !== sentRevision) throw e;
        const current = await api.attempt(id);
        if (disposed) return;
        if (current.revision !== sentRevision + 1 || canonicalJson(current.answers) !== canonicalJson(competing.answers)) throw e;
        revision = current.revision;
        a = await api.submit(id, { ...final, revision });
      }
      if (disposed) return;
      stopTimers();
      dirty = false;
      adopt(a);
      if (!spec || unavailable === 'badExercise') return;
      saveState = 'saved';
      note = auto ? 'autoSubmitted' : null;
      phase = 'closed';
    } catch (e) {
      if (disposed) return;
      if (closedByServer(e)) {
        note = 'lateSubmit';
        await closeFromServer();
      } else if (e instanceof ApiError && (e.status === 403 || e.code === 'stale_revision')) {
        fail(e);
      } else {
        dirty = true;
        saveState = 'failed';
        note = 'submitFailed';
        const untilDeadline = Date.parse(attempt.deadline_at) - lock.serverNow();
        if (untilDeadline <= 0 || auto) {
          const grace = untilDeadline + EXAM_GRACE_MS;
          if (deadlineTimer !== null) clearTimeout(deadlineTimer);
          if (grace > 0) deadlineTimer = setTimeout(() => void session.submit(true), Math.min(retryMs, grace));
          else await closeFromServer();
        }
      }
    } finally {
      busy = false;

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
    get frozen() { return frozen !== null; },
    get code() { return code; },

    async load(next: string): Promise<void> {
      code = next.trim().toUpperCase();
      phase = 'loading';
      unavailable = null;
      note = null;
      await auth.ready();
      if (disposed) return;
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
        const opened = await api.get(code);
        if (disposed) return;
        exam = opened;
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
      if (disposed || frozen || phase !== 'running') return;
      if (attempt && lock.serverNow() >= Date.parse(attempt.deadline_at)) { void session.submit(true); return; }
      if (JSON.stringify(next) === JSON.stringify(answers)) return;
      answers = next;
      dirty = true;
      saveState = 'pending';
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; void session.flush(); }, debounceMs);
    },

    /** Saves now whatever is waiting; chained, so two flushes never send out of order. */
    flush(): Promise<void> {
      if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
      const run = (inFlight ?? Promise.resolve()).then(write).finally(() => { if (inFlight === run) inFlight = null; });
      inFlight = run;
      return run;
    },

    submit(auto = false): Promise<void> {
      if (submitting) return submitting;
      submitting = submitOnce(auto).finally(() => { submitting = null; });
      return submitting;
    },
    /** Reads the attempt again: results open up later for `after_close`. */
    async refresh(): Promise<void> {
      if (!attempt) return;
      busy = true;
      try {
        const a = await api.attempt(attempt.id);
        if (disposed) return;
        adopt(a);
      } catch {
        return;
      } finally {
        busy = false;
      }
    },

    dispose(): void {
      disposed = true;
      stopTimers();
      lock.release('left');
    },
  };
  return session;
}

export function createExamSession(deps: ExamSessionDeps) {
  let current = $state.raw(createAttemptSession(deps));
  let disposed = false;
  return {
    get phase() { return current.phase; },
    get unavailable() { return current.unavailable; },
    get exam() { return current.exam; },
    get attempt() { return current.attempt; },
    get spec() { return current.spec; },
    get answers() { return current.answers; },
    get saveState() { return current.saveState; },
    get note() { return current.note; },
    get busy() { return current.busy; },
    get frozen() { return current.frozen; },
    get code() { return current.code; },
    async load(code: string) {
      if (disposed) return;
      if (current.code) current.dispose();
      current = createAttemptSession(deps);
      await current.load(code);
    },
    start: () => current.start(),
    update: (answers: SubmittedAnswer[]) => current.update(answers),
    flush: () => current.flush(),
    submit: (auto = false) => current.submit(auto),
    refresh: () => current.refresh(),
    dispose() { disposed = true; current.dispose(); },
  };
}

export type ExamSession = ReturnType<typeof createExamSession>;
