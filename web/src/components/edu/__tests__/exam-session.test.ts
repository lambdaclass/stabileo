import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/client';
import type { Attempt, Exam } from '../../../lib/api/assignments';
import { examLock, EXAM_GRACE_MS } from '../../../lib/store/exam-lock.svelte';
import { getExerciseSpecs } from '../exercise-data';
import { exerciseEnvelope } from '../exam-grading';
import { createExamSession, type ExamSessionDeps } from '../exam-session.svelte';
import type { SubmittedAnswer } from '../exercise-submission';

const T0 = Date.parse('2026-11-12T13:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const spec = () => getExerciseSpecs().find((s) => s.id === 'frame-varying-supports')!;

const EXAM: Exam = {
  code: 'K7Q2M9XWPA', title: 'TP 3', owner_name: 'Prof. Pérez', duration_minutes: 60,
  opens_at: iso(T0 - 60_000), closes_at: null, reveal: 'on_submit', status: 'open', attempt: null, now: iso(T0),
};

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    id: 'att-1', code: EXAM.code, title: EXAM.title, seed: 3141592653, started_at: iso(T0), deadline_at: iso(T0 + 3_600_000),
    submitted_at: null, answers: {}, client_score: null, closed: false, reveal: 'on_submit', closes_at: null, reveal_allowed: false,
    exercise: exerciseEnvelope(spec()), now: iso(Date.now()), ...over,
  };
}

const answer = (value: string): SubmittedAnswer[] => [{ key: 'r:0:Rx', label: 'A — Rx', answer: value, outcome: 'pending' }];

function deps(over: Partial<ExamSessionDeps['api']> = {}, auth: Partial<ExamSessionDeps['auth']> = {}) {
  const api = {
    get: vi.fn(async () => EXAM),
    start: vi.fn(async () => attempt()),
    attempt: vi.fn(async () => attempt()),
    saveAnswers: vi.fn(async (_id: string, answers: Record<string, unknown>) => attempt({ answers })),
    submit: vi.fn(async (_id: string, body: { answers?: Record<string, unknown> }) =>
      attempt({ answers: body.answers ?? {}, submitted_at: iso(Date.now()), closed: true, reveal_allowed: true })),
    ...over,
  } as unknown as Record<'get' | 'start' | 'attempt' | 'saveAnswers' | 'submit', ReturnType<typeof vi.fn>>;
  const d: ExamSessionDeps = {
    api: api as unknown as ExamSessionDeps['api'],
    lock: examLock,
    auth: { ready: async () => {}, isAuthenticated: true, assignmentsEnabled: true, userLoginEnabled: true, ...auth },
    score: () => 0.5,
    debounceMs: 1000,
  };
  return { api, d };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  examLock.reset();
});
afterEach(() => {
  examLock.reset();
  vi.useRealTimers();
});

describe('opening an exam', () => {
  it('asks for sign-in first, and says so plainly when sign-in is off', async () => {
    const a = createExamSession(deps({}, { isAuthenticated: false }).d);
    await a.load('k7q2m9xwpa');
    expect(a.phase).toBe('signin');
    const b = createExamSession(deps({}, { isAuthenticated: false, userLoginEnabled: false }).d);
    await b.load('K7Q2M9XWPA');
    expect([b.phase, b.unavailable]).toEqual(['unavailable', 'signinOff']);
  });

  it('never calls the backend with the flag off', async () => {
    const { api, d } = deps({}, { assignmentsEnabled: false });
    const s = createExamSession(d);
    await s.load('K7Q2M9XWPA');
    expect([s.phase, s.unavailable]).toEqual(['unavailable', 'disabled']);
    expect(api.get).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError(404, 'not_found', ''), 'notFound'],
    [new ApiError(403, 'assignments_disabled', ''), 'disabled'],
    [new ApiError(0, 'network_error', ''), 'error'],
  ] as const)('maps %s to a message', async (err, why) => {
    const s = createExamSession(deps({ get: vi.fn(async () => { throw err; }) }).d);
    await s.load('K7Q2M9XWPA');
    expect([s.phase, s.unavailable]).toEqual(['unavailable', why]);
  });

  it('shows the lobby, upper-cases the code, and starts into a locked attempt', async () => {
    const { api, d } = deps();
    const s = createExamSession(d);
    await s.load(' k7q2m9xwpa ');
    expect(api.get).toHaveBeenCalledWith('K7Q2M9XWPA');
    expect(s.phase).toBe('lobby');
    expect(examLock.locked).toBe(false);
    await s.start();
    expect(api.start).toHaveBeenCalledWith('K7Q2M9XWPA');
    expect(s.phase).toBe('running');
    expect(s.spec?.id).toBe('frame-varying-supports');
    expect(examLock.locked).toBe(true);
  });

  it('a start refused because the window closed is a message, not a lock', async () => {
    const s = createExamSession(deps({ start: vi.fn(async () => { throw new ApiError(409, 'assignment_closed', ''); }) }).d);
    await s.load('K7Q2M9XWPA');
    await s.start();
    expect([s.phase, s.unavailable]).toEqual(['unavailable', 'closed']);
    expect(examLock.locked).toBe(false);
  });

  it('resumes an attempt already started, with the answers it saved', async () => {
    const saved = { stabileoSubmission: 1, exerciseId: 'frame-varying-supports', exerciseTitle: 'x', student: '', submittedAt: iso(T0), answers: answer('12'), seed: 3141592653 };
    const { api, d } = deps({ attempt: vi.fn(async () => attempt({ answers: saved })) });
    api.get.mockResolvedValueOnce({ ...EXAM, attempt: { id: 'att-1', started_at: iso(T0), deadline_at: iso(T0 + 3_600_000), submitted_at: null } });
    const s = createExamSession(d);
    await s.load('K7Q2M9XWPA');
    expect(api.attempt).toHaveBeenCalledWith('att-1');
    expect(api.start).not.toHaveBeenCalled();
    expect(s.phase).toBe('running');
    expect(s.answers[0]!.answer).toBe('12');
  });

  it('a closed attempt opens on its result, unlocked', async () => {
    const { api, d } = deps({ attempt: vi.fn(async () => attempt({ closed: true, submitted_at: iso(T0), reveal_allowed: true })) });
    api.get.mockResolvedValueOnce({ ...EXAM, attempt: { id: 'att-1', started_at: iso(T0), deadline_at: iso(T0), submitted_at: iso(T0) } });
    const s = createExamSession(d);
    await s.load('K7Q2M9XWPA');
    expect(s.phase).toBe('closed');
    expect(examLock.locked).toBe(false);
  });
});

describe('during the attempt', () => {
  async function running(over: Partial<ExamSessionDeps['api']> = {}) {
    const { api, d } = deps(over);
    const s = createExamSession(d);
    await s.load('K7Q2M9XWPA');
    await s.start();
    return { s, api };
  }

  it('does not save answers that did not change', async () => {
    const { s, api } = await running();
    s.update(answer('1'));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(api.saveAnswers).toHaveBeenCalledTimes(1);
    s.update(answer('1'));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(api.saveAnswers).toHaveBeenCalledTimes(1);
    expect(s.saveState).toBe('saved');
  });

  it('autosaves once after a pause, as a submission against the server seed', async () => {
    const { s, api } = await running();
    s.update(answer('1'));
    s.update(answer('12'));
    expect(s.saveState).toBe('pending');
    await vi.advanceTimersByTimeAsync(999);
    expect(api.saveAnswers).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.saveAnswers).toHaveBeenCalledTimes(1);
    const [id, body] = api.saveAnswers.mock.calls[0]!;
    expect(id).toBe('att-1');
    expect(body).toMatchObject({ stabileoSubmission: 1, exerciseId: 'frame-varying-supports', seed: 3141592653, answers: answer('12') });
    expect(s.saveState).toBe('saved');
  });

  it('a flush saves at once (leaving the page) and never twice for the same answers', async () => {
    const { s, api } = await running();
    s.update(answer('7'));
    await s.flush();
    await s.flush();
    expect(api.saveAnswers).toHaveBeenCalledTimes(1);
  });

  it('a failed autosave lifts the lock, keeps the answers and is sent again later', async () => {
    const save = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network_error', '')).mockImplementation(async (_id, answers) => attempt({ answers }));
    const { s } = await running({ saveAnswers: save });
    s.update(answer('3'));
    await s.flush();
    expect(s.saveState).toBe('failed');
    expect(examLock.locked).toBe(false);
    expect(s.phase).toBe('running');
    await s.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(s.saveState).toBe('saved');
    expect(examLock.locked, 'the lock comes back once the server answers again').toBe(true);
  });

  it('submits with the answers and the browser score, then unlocks', async () => {
    const { s, api } = await running();
    s.update(answer('5'));
    await s.submit();
    expect(api.submit).toHaveBeenCalledTimes(1);
    const [, body] = api.submit.mock.calls[0]!;
    expect(body).toMatchObject({ client_score: 0.5, answers: { answers: answer('5'), seed: 3141592653 } });
    expect(s.phase).toBe('closed');
    expect(examLock.locked).toBe(false);
    expect(examLock.releaseReason).toBe('submitted');
  });

  it('a hand-in still on its way when the deadline fires is sent once, and stays on time', async () => {
    let finish!: () => void;
    const { s, api } = await running({
      submit: vi.fn((_id: string, body: { answers?: Record<string, unknown> }) => new Promise<Attempt>((resolve) => {
        finish = () => resolve(attempt({ answers: body.answers ?? {}, submitted_at: iso(T0 + 3_599_000), closed: true, reveal_allowed: true }));
      })),
    });
    await vi.advanceTimersByTimeAsync(3_599_000);
    const manual = s.submit();
    await vi.advanceTimersByTimeAsync(2_000);
    finish();
    await manual;
    await vi.runOnlyPendingTimersAsync();
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(s.note).toBeNull();
    expect(s.phase).toBe('closed');
  });

  it('hands itself in at the deadline', async () => {
    const { s, api } = await running();
    s.update(answer('9'));
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(s.phase).toBe('closed');
    expect(s.note).toBe('autoSubmitted');
  });

  it('a submit after the grace keeps the last autosave and closes gracefully', async () => {
    const saved = { stabileoSubmission: 1, exerciseId: 'frame-varying-supports', exerciseTitle: 'x', student: '', submittedAt: iso(T0), answers: answer('last-saved'), seed: 1 };
    const { s, api } = await running({
      submit: vi.fn(async () => { throw new ApiError(409, 'attempt_closed', ''); }),
      attempt: vi.fn(async () => attempt({ answers: saved, closed: true, reveal_allowed: true })),
    });
    s.update(answer('typed-too-late'));
    await s.submit();
    expect(api.attempt).toHaveBeenCalledWith('att-1');
    expect(s.phase).toBe('closed');
    expect(s.note).toBe('lateSubmit');
    expect(s.answers[0]!.answer).toBe('last-saved');
    expect(examLock.locked).toBe(false);
  });

  it('a 409 on autosave closes too', async () => {
    const { s } = await running({ saveAnswers: vi.fn(async () => { throw new ApiError(409, 'attempt_submitted', ''); }) });
    s.update(answer('1'));
    await s.flush();
    expect(s.phase).toBe('closed');
  });

  it('a submit that cannot reach the server unlocks and can be tried again', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network_error', ''))
      .mockImplementation(async () => attempt({ closed: true, submitted_at: iso(T0) }));
    const { s } = await running({ submit });
    await s.submit();
    expect([s.phase, s.note]).toEqual(['running', 'submitFailed']);
    expect(examLock.locked).toBe(false);
    await s.submit();
    expect(s.phase).toBe('closed');
  });

  it('the flag turned off mid-attempt ends it with a message and no lock', async () => {
    const { s } = await running({ saveAnswers: vi.fn(async () => { throw new ApiError(403, 'assignments_disabled', ''); }) });
    s.update(answer('1'));
    await s.flush();
    expect([s.phase, s.unavailable]).toEqual(['unavailable', 'disabled']);
    expect(examLock.locked).toBe(false);
  });

  it('even with nothing answering, the lock never outlasts the deadline plus the grace', async () => {
    const { s } = await running({ submit: vi.fn(() => new Promise<never>(() => {})) });
    await vi.advanceTimersByTimeAsync(3_600_000 + EXAM_GRACE_MS);
    expect(s.phase).toBe('running');
    expect(examLock.locked).toBe(false);
  });

  it('refresh picks up results that open later', async () => {
    const { s, api } = await running();
    await s.submit();
    api.attempt.mockResolvedValueOnce(attempt({ closed: true, reveal_allowed: true }));
    await s.refresh();
    expect(s.attempt?.reveal_allowed).toBe(true);
  });
});
