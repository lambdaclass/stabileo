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
    revision: 0, id: 'att-1', code: EXAM.code, title: EXAM.title, seed: 3141592653, started_at: iso(T0), deadline_at: iso(T0 + 3_600_000),
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
    retryMs: 5000,
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

  it('known wrong result: #1927 — lost acknowledgement recovers the committed revision and saves the latest edit', async () => {
    const { s, api } = await running();
    api.saveAnswers.mockRejectedValueOnce(new Error('lost acknowledgement'));
    s.update(answer('old'));
    await s.flush();
    const committed = api.saveAnswers.mock.calls[0]![1];
    api.saveAnswers.mockRejectedValueOnce(new ApiError(409, 'stale_revision', ''));
    api.attempt.mockResolvedValueOnce(attempt({ revision: 1, answers: committed }));
    s.update(answer('new'));
    await s.flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.phase).toBe('running');
    expect(api.saveAnswers.mock.calls.at(-1)).toMatchObject({ 1: { answers: answer('new') }, 2: 1 });
  });

  it('known wrong result: #1927 — final answers remain unavailable until read from the server', async () => {
    const { s, api } = await running();
    s.update(answer('unsaved'));
    api.submit.mockRejectedValueOnce(new ApiError(409, 'attempt_closed', ''));
    api.attempt.mockRejectedValueOnce(new Error('offline'));
    await s.submit();
    expect(s.phase).toBe('unavailable');
    expect(s.answers).toEqual(answer('unsaved'));
    api.attempt.mockResolvedValueOnce(attempt({ closed: true, answers: {} }));
    await s.refresh();
    expect(s.phase).toBe('closed');
    expect(s.answers).toEqual([]);
  });

  it('known wrong result: #1927 — a second exam gets its own editable answer sheet', async () => {
    const { s, api } = await running();
    s.update(answer('first'));
    await s.submit();
    await s.load('SECOND');
    api.start.mockResolvedValueOnce(attempt({ id: 'att-2', code: 'SECOND' }));
    await s.start();
    s.update(answer('second'));
    await s.submit();
    expect(api.submit.mock.calls.at(-1)).toMatchObject({ 0: 'att-2', 1: { answers: { answers: answer('second') } } });
  });

  it('known wrong result: #1927 — edits at the deadline cannot enter the grace payload', async () => {
    const { s, api } = await running();
    s.update(answer('on time'));
    examLock.syncClock(s.attempt!.deadline_at);
    s.update(answer('late'));
    await s.submit();
    expect(api.submit.mock.calls[0]![1].answers.answers).toEqual(answer('on time'));
  });

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

  it('known wrong result: #1927 — a failed autosave keeps the lock, keeps the answers and is sent again later', async () => {
    const save = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network_error', '')).mockImplementation(async (_id, answers) => attempt({ answers }));
    const { s } = await running({ saveAnswers: save });
    s.update(answer('3'));
    await s.flush();
    expect(s.saveState).toBe('failed');
    expect(examLock.locked).toBe(true);
    expect(s.phase).toBe('running');
    await s.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(s.saveState).toBe('saved');
    expect(examLock.locked).toBe(true);
  });

  it('a failed autosave is sent again on its own, without another edit', async () => {
    const save = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network_error', '')).mockImplementation(async (_id, answers) => attempt({ answers }));
    const { s } = await running({ saveAnswers: save });
    s.update(answer('4'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(s.saveState).toBe('failed');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(s.saveState).toBe('saved');
    expect(examLock.locked).toBe(true);
  });

  it('a save asked for while the hand-in is on its way is not sent', async () => {
    let finish!: () => void;
    const { s, api } = await running({
      submit: vi.fn((_id: string, body: { answers?: Record<string, unknown> }) => new Promise<Attempt>((resolve) => {
        finish = () => resolve(attempt({ answers: body.answers ?? {}, submitted_at: iso(Date.now()), closed: true, reveal_allowed: true }));
      })),
    });
    s.update(answer('8'));
    const handIn = s.submit();
    await vi.advanceTimersByTimeAsync(0);
    await s.flush();
    finish();
    await handIn;
    expect(api.saveAnswers).not.toHaveBeenCalled();
    expect([s.phase, s.note]).toEqual(['closed', null]);
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

  it('a hand-in at the deadline that cannot reach the server is tried again within the grace', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network_error', ''))
      .mockImplementation(async (_id: string, body: { answers?: Record<string, unknown> }) =>
        attempt({ answers: body.answers ?? {}, submitted_at: iso(Date.now()), closed: true }));
    const { s } = await running({ submit });
    s.update(answer('9'));
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(s.note).toBe('submitFailed');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(submit).toHaveBeenCalledTimes(2);
    expect([s.phase, s.note]).toEqual(['closed', 'autoSubmitted']);
  });

  it.each([false, true])('known wrong result: #1927 — review retries early manual hand-in with the exact frozen body after refresh %s', async refresh => {
    const { s, api } = await running();
    api.submit.mockRejectedValueOnce(new Error('network'));
    s.update(answer('final'));
    await s.submit();
    if (refresh) await s.refresh();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.submit).toHaveBeenCalledTimes(2);
    expect(api.submit.mock.calls[1]).toEqual(api.submit.mock.calls[0]);
    expect(s.phase).toBe('closed');
  });

  it('known wrong result: #1927 — review ignores unreadable refresh times during an active attempt', async () => {
    const { s, api } = await running();
    s.update(answer('mine'));
    api.attempt.mockResolvedValueOnce(attempt({ deadline_at: 'invalid', now: iso(T0 + 4_000_000) }));
    await s.refresh();
    expect.soft(s.phase).toBe('running');
    expect.soft(s.attempt?.deadline_at).toBe(iso(T0 + 3_600_000));
    expect.soft(s.answers).toEqual(answer('mine'));
    expect(examLock.remainingMs()).toBe(3_600_000);
  });

  it('known wrong result: #1927 — keeps the valid deadline on an autosave acknowledgement with unreadable timing', async () => {
    const { s, api } = await running();
    s.update(answer('saved'));
    api.saveAnswers.mockImplementationOnce(async (_id, answers) => attempt({ answers, revision: 1, now: iso(T0 + 4_000_000), deadline_at: 'invalid' }));
    await s.flush();
    expect.soft(s.phase).toBe('running');
    expect.soft(s.saveState).toBe('saved');
    expect.soft(s.attempt?.deadline_at).toBe(iso(T0 + 3_600_000));
    expect(examLock.remainingMs()).toBe(3_600_000);
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

  it('known wrong result: #1927 — a submit that cannot reach the server stays locked and can be tried again', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network_error', ''))
      .mockImplementation(async () => attempt({ closed: true, submitted_at: iso(T0) }));
    const { s } = await running({ submit });
    await s.submit();
    expect([s.phase, s.note]).toEqual(['running', 'submitFailed']);
    expect(examLock.locked).toBe(true);
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

  it('known wrong result: #1927 — submit freezes the final answers while an autosave is still in flight', async () => {
    let finish!: (a: Attempt) => void;
    const { s, api } = await running({ saveAnswers: vi.fn(() => new Promise<Attempt>(resolve => { finish = resolve; })) });
    s.update(answer('old'));
    const save = s.flush();
    await vi.advanceTimersByTimeAsync(0);
    s.update(answer('final'));
    const handIn = s.submit();
    s.update(answer('too late'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(api.submit.mock.calls[0]![1].answers.answers).toEqual(answer('final'));
    expect(s.answers).toEqual(answer('final'));
    finish(attempt());
    await Promise.all([save, handIn]);
    expect(s.attempt?.closed).toBe(true);
  });

  it.each(['save', 'start'])('known wrong result: #1927 — disposal during %s cannot reengage the lock', async operation => {
    let finish!: (a: Attempt) => void;
    const pending = vi.fn(() => new Promise<Attempt>(resolve => { finish = resolve; }));
    const { d } = deps(operation === 'start' ? { start: pending } : { saveAnswers: pending });
    const s = createExamSession(d);
    await s.load('K7Q2M9XWPA');
    let action;
    if (operation === 'start') action = s.start();
    else {
      await s.start();
      s.update(answer('last'));
      action = s.flush();
    }
    await vi.advanceTimersByTimeAsync(0);
    s.dispose();
    finish(attempt());
    await action;
    expect(examLock.locked).toBe(false);
    expect(examLock.releaseReason).toBe('left');
  });

  it('known wrong result: #1927 — a failed manual hand-in crossing the deadline retries the frozen payload', async () => {
    let fail!: (e: Error) => void;
    const submit = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }))
      .mockResolvedValueOnce(attempt({ closed: true }));
    const { s } = await running({ submit });
    await vi.advanceTimersByTimeAsync(3_599_999);
    s.update(answer('final'));
    const done = s.submit();
    await vi.advanceTimersByTimeAsync(2);
    fail(new Error('interrupted'));
    await done;
    s.update(answer('too late'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]);
  });

  it.each([true, false])('only acknowledges a competing save carrying this session’s own payload (%s)', async own => {
    let saved!: (a: Attempt) => void;
    let writing: Record<string, unknown> = {};
    const { s, api } = await running({ saveAnswers: vi.fn((_id, body) => {
      writing = body;
      return new Promise<Attempt>(resolve => { saved = resolve; });
    }) });
    s.update(answer('old'));
    const save = s.flush();
    await vi.advanceTimersByTimeAsync(0);
    s.update(answer('final'));
    api.submit.mockRejectedValueOnce(new ApiError(409, 'stale_revision', ''));
    const current = attempt({ revision: 1, answers: own ? writing : { ...writing, answers: answer('different device') } });
    api.attempt.mockResolvedValueOnce(current);
    await s.submit();
    expect(api.submit).toHaveBeenCalledTimes(own ? 2 : 1);
    if (own) {
      expect(api.submit.mock.calls[1]![1]).toMatchObject({ revision: 1, answers: { answers: answer('final') } });
      expect(s.phase).toBe('closed');
    } else expect(s.unavailable).toBe('conflict');
    saved(current);
    await save;
  });

  it('refresh picks up results that open later', async () => {
    const { s, api } = await running();
    api.submit.mockResolvedValueOnce(attempt({ closed: true, reveal_allowed: false }));
    await s.submit();
    expect(s.attempt?.reveal_allowed).toBe(false);
    api.attempt.mockResolvedValueOnce(attempt({ closed: true, reveal_allowed: true }));
    await s.refresh();
    expect(s.attempt?.reveal_allowed).toBe(true);
  });
});

it('known wrong result: #1927 — an open attempt returned beyond grace submits its saved answers', async () => {
  const { api, d } = deps();
  api.start.mockResolvedValueOnce(attempt({ deadline_at: iso(T0 - EXAM_GRACE_MS - 1) }));
  const session = createExamSession(d);
  await session.load(EXAM.code);
  await session.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(session.phase).toBe('closed');
});
