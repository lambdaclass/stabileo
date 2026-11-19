import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { API_URL, ApiError, setAuthHooks } from '../client';
import { assignmentsApi, examsApi, listQuery, type Assignment, type Attempt, type AssignmentWithExercise } from '../assignments';

const ASSIGNMENTS = `${API_URL}/api/v1/assignments`;
const EXAMS = `${API_URL}/api/v1/exams`;

const ASSIGNMENT: Assignment = {
  id: '6f1c2c0e-0000-4000-8000-000000000001',
  code: 'K7Q2M9XWPA',
  title: 'TP 3: vigas',
  duration_minutes: 90,
  opens_at: '2026-11-12T13:00:00Z',
  closes_at: '2026-11-12T16:00:00Z',
  reveal: 'after_close',
  attempt_count: 0,
  submitted_count: 0,
  inserted_at: '2026-11-10T12:00:00Z',
  updated_at: '2026-11-10T12:00:00Z',
};

const WITH_EXERCISE: AssignmentWithExercise = { ...ASSIGNMENT, exercise: { id: 'beam-1' } };

const ATTEMPT: Attempt = {
  id: '6f1c2c0e-0000-4000-8000-0000000000a1',
  code: 'K7Q2M9XWPA',
  title: 'TP 3: vigas',
  seed: 3141592653,
  started_at: '2026-11-12T13:05:00Z',
  deadline_at: '2026-11-12T14:35:00Z',
  submitted_at: null,
  answers: {},
  client_score: null,
  closed: false,
  reveal: 'after_close',
  closes_at: '2026-11-12T16:00:00Z',
  reveal_allowed: false,
  exercise: { id: 'beam-1' },
  now: '2026-11-12T13:05:00Z',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Call = { url: string; method: string; auth: string | undefined; body: unknown };

function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const req = init as RequestInit;
    return {
      url: String(url),
      method: req.method ?? 'GET',
      auth: (req.headers as Record<string, string>).Authorization,
      body: req.body === undefined ? undefined : JSON.parse(String(req.body)),
    };
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
let refresh: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  refresh = vi.fn(async () => 'rejected' as const);
  setAuthHooks({ accessToken: () => 'access-1', refresh });
});

afterEach(() => {
  setAuthHooks(null);
  vi.unstubAllGlobals();
});

describe('listQuery', () => {
  it('is empty with no params and trims the search', () => {
    expect(listQuery()).toBe('');
    expect(listQuery({ search: '   ' })).toBe('');
    expect(listQuery({ search: ' Ada & co ', sort_by: 'started_at', sort_dir: 'asc', limit: 100, offset: 0 }))
      .toBe('?search=Ada+%26+co&sort_by=started_at&sort_dir=asc&limit=100&offset=0');
  });
});

describe('assignmentsApi', () => {
  it('lists with the bearer token and answers data and meta', async () => {
    const list = { data: [ASSIGNMENT], meta: { total: 1, limit: 50, offset: 0, max_assignments: 100 } };
    fetchMock.mockResolvedValueOnce(json(200, list));

    await expect(assignmentsApi.list({ search: 'vigas' })).resolves.toEqual(list);
    expect(calls()).toEqual([{ url: `${ASSIGNMENTS}?search=vigas`, method: 'GET', auth: 'Bearer access-1', body: undefined }]);
  });

  it('creates, reads, updates and deletes, unwrapping data', async () => {
    fetchMock
      .mockResolvedValueOnce(json(201, { data: WITH_EXERCISE }))
      .mockResolvedValueOnce(json(200, { data: WITH_EXERCISE }))
      .mockResolvedValueOnce(json(200, { data: { ...WITH_EXERCISE, title: 'Recuperatorio' } }))
      .mockResolvedValueOnce(json(200, { data: ASSIGNMENT }));

    const input = { title: 'TP 3: vigas', exercise: { id: 'beam-1' }, duration_minutes: 90, closes_at: '2026-11-12T16:00:00Z', reveal: 'after_close' as const };
    await expect(assignmentsApi.create(input)).resolves.toEqual(WITH_EXERCISE);
    await expect(assignmentsApi.get(ASSIGNMENT.id)).resolves.toEqual(WITH_EXERCISE);
    await expect(assignmentsApi.update(ASSIGNMENT.id, { title: 'Recuperatorio' })).resolves.toMatchObject({ title: 'Recuperatorio' });
    await expect(assignmentsApi.remove(ASSIGNMENT.id)).resolves.toBeUndefined();

    expect(calls()).toEqual([
      { url: ASSIGNMENTS, method: 'POST', auth: 'Bearer access-1', body: input },
      { url: `${ASSIGNMENTS}/${ASSIGNMENT.id}`, method: 'GET', auth: 'Bearer access-1', body: undefined },
      { url: `${ASSIGNMENTS}/${ASSIGNMENT.id}`, method: 'PUT', auth: 'Bearer access-1', body: { title: 'Recuperatorio' } },
      { url: `${ASSIGNMENTS}/${ASSIGNMENT.id}`, method: 'DELETE', auth: 'Bearer access-1', body: undefined },
    ]);
  });

  it('reads the attempts with the list params', async () => {
    const page = { data: [], meta: { total: 0, limit: 100, offset: 0 } };
    fetchMock.mockResolvedValueOnce(json(200, page));

    await expect(assignmentsApi.attempts(ASSIGNMENT.id, { limit: 100, sort_by: 'client_score', sort_dir: 'desc' })).resolves.toEqual(page);
    expect(calls()[0].url).toBe(`${ASSIGNMENTS}/${ASSIGNMENT.id}/attempts?sort_by=client_score&sort_dir=desc&limit=100`);
  });

  it('throws the backend code and field details', async () => {
    fetchMock.mockResolvedValueOnce(json(422, {
      error: 'validation_error',
      message: 'Validation failed',
      details: { closes_at: ['is required when results show after closing'] },
    }));

    const err = await assignmentsApi.create({ title: 'X', exercise: {}, duration_minutes: 10, reveal: 'after_close' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'validation_error', details: { closes_at: ['is required when results show after closing'] } });
  });

  it('a 409 assignment_started carries its code', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'assignment_started', message: 'The exercise cannot change once someone has started' }));
    await expect(assignmentsApi.update(ASSIGNMENT.id, { exercise: { id: 'other' } })).rejects.toMatchObject({ status: 409, code: 'assignment_started' });
  });
});

describe('examsApi', () => {
  it('reads an exam and starts it by its trimmed code', async () => {
    const exam = { code: 'K7Q2M9XWPA', title: 'TP 3: vigas', owner_name: 'Prof. Pérez', duration_minutes: 90, opens_at: ASSIGNMENT.opens_at, closes_at: ASSIGNMENT.closes_at, reveal: 'after_close', status: 'open', attempt: null, now: ATTEMPT.now };
    fetchMock.mockResolvedValueOnce(json(200, { data: exam })).mockResolvedValueOnce(json(200, { data: ATTEMPT }));

    await expect(examsApi.get(' k7q2m9xwpa ')).resolves.toEqual(exam);
    await expect(examsApi.start('K7Q2M9XWPA')).resolves.toEqual(ATTEMPT);

    expect(calls()).toEqual([
      { url: `${EXAMS}/k7q2m9xwpa`, method: 'GET', auth: 'Bearer access-1', body: undefined },
      { url: `${EXAMS}/K7Q2M9XWPA/start`, method: 'POST', auth: 'Bearer access-1', body: undefined },
    ]);
  });

  it('autosaves, submits and reads back the attempt', async () => {
    const submitted = { ...ATTEMPT, answers: { r1: '12' }, client_score: 0.5, submitted_at: '2026-11-12T14:00:00Z', closed: true };
    fetchMock
      .mockResolvedValueOnce(json(200, { data: { ...ATTEMPT, answers: { r1: '12' } } }))
      .mockResolvedValueOnce(json(200, { data: submitted }))
      .mockResolvedValueOnce(json(200, { data: submitted }));

    await expect(examsApi.saveAnswers(ATTEMPT.id, { r1: '12' })).resolves.toMatchObject({ answers: { r1: '12' } });
    await expect(examsApi.submit(ATTEMPT.id, { client_score: 0.5 })).resolves.toEqual(submitted);
    await expect(examsApi.attempt(ATTEMPT.id)).resolves.toEqual(submitted);

    expect(calls()).toEqual([
      { url: `${EXAMS}/attempts/${ATTEMPT.id}/answers`, method: 'PUT', auth: 'Bearer access-1', body: { answers: { r1: '12' } } },
      { url: `${EXAMS}/attempts/${ATTEMPT.id}/submit`, method: 'POST', auth: 'Bearer access-1', body: { client_score: 0.5 } },
      { url: `${EXAMS}/attempts/${ATTEMPT.id}`, method: 'GET', auth: 'Bearer access-1', body: undefined },
    ]);
  });

  it('a submit with nothing sends an empty object, so the last autosave stands', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: ATTEMPT }));
    await examsApi.submit(ATTEMPT.id);
    expect(calls()[0].body).toEqual({});
  });

  it.each([
    [409, 'attempt_closed'],
    [409, 'attempt_submitted'],
    [409, 'assignment_not_open'],
    [403, 'assignments_disabled'],
    [404, 'not_found'],
  ])('a %i %s reaches the caller as an ApiError with that code', async (status, code) => {
    fetchMock.mockResolvedValueOnce(json(status, { error: code, message: code }));
    await expect(examsApi.submit(ATTEMPT.id, { answers: {} })).rejects.toMatchObject({ status, code });
  });

  it('a network failure is a network_error, so the caller can release the lock', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(examsApi.saveAnswers(ATTEMPT.id, {})).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('a 401 tries one refresh, then gives up when the session is over', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_token', message: 'Invalid or expired token' }));
    await expect(examsApi.attempt(ATTEMPT.id)).rejects.toMatchObject({ status: 401, code: 'invalid_token' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
