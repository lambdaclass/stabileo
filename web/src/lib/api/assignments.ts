import { request } from './client';

export type Reveal = 'on_submit' | 'after_close';
export type ExamStatus = 'upcoming' | 'open' | 'closed';
export type JsonObject = Record<string, unknown>;

export interface Assignment {
  id: string;
  code: string;
  title: string;
  duration_minutes: number;
  opens_at: string;
  closes_at: string | null;
  reveal: Reveal;
  attempt_count: number;
  submitted_count: number;
  inserted_at: string;
  updated_at: string;
}

export interface AssignmentWithExercise extends Assignment {
  exercise: JsonObject;
}

export interface AssignmentList {
  data: Assignment[];
  meta: { total: number; limit: number; offset: number; max_assignments: number };
}

export interface AssignmentInput {
  title: string;
  exercise: JsonObject;
  duration_minutes: number;
  opens_at?: string;
  closes_at?: string | null;
  reveal: Reveal;
}

export interface OwnerAttempt {
  id: string;
  student: { id: string; name: string | null; email: string };
  seed: number;
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  answers: JsonObject;
  client_score: number | null;
}

export interface OwnerAttemptList {
  data: OwnerAttempt[];
  meta: { total: number; limit: number; offset: number };
}

export interface Exam {
  code: string;
  title: string;
  owner_name: string | null;
  duration_minutes: number;
  opens_at: string;
  closes_at: string | null;
  reveal: Reveal;
  status: ExamStatus;
  attempt: { id: string; started_at: string; deadline_at: string; submitted_at: string | null } | null;
  now: string;
}

export interface Attempt {
  id: string;
  code: string;
  title: string;
  seed: number;
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  answers: JsonObject;
  client_score: number | null;
  closed: boolean;
  reveal: Reveal;
  closes_at: string | null;
  reveal_allowed: boolean;
  exercise: JsonObject;
  now: string;
}

export interface ListParams {
  search?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

const ASSIGNMENTS = '/api/v1/assignments';
const EXAMS = '/api/v1/exams';

export function listQuery(params: ListParams = {}): string {
  const q = new URLSearchParams();
  const search = params.search?.trim();
  if (search) q.set('search', search);
  if (params.sort_by) q.set('sort_by', params.sort_by);
  if (params.sort_dir) q.set('sort_dir', params.sort_dir);
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function data<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return (await request<{ data: T }>(method, path, { body, auth: true })).data;
}

export const assignmentsApi = {
  list(params: ListParams = {}): Promise<AssignmentList> {
    return request<AssignmentList>('GET', `${ASSIGNMENTS}${listQuery(params)}`, { auth: true });
  },

  get(id: string): Promise<AssignmentWithExercise> {
    return data('GET', `${ASSIGNMENTS}/${encodeURIComponent(id)}`);
  },

  create(input: AssignmentInput): Promise<AssignmentWithExercise> {
    return data('POST', ASSIGNMENTS, input);
  },

  update(id: string, patch: Partial<AssignmentInput>): Promise<AssignmentWithExercise> {
    return data('PUT', `${ASSIGNMENTS}/${encodeURIComponent(id)}`, patch);
  },

  async remove(id: string): Promise<void> {
    await request<unknown>('DELETE', `${ASSIGNMENTS}/${encodeURIComponent(id)}`, { auth: true });
  },

  attempts(id: string, params: ListParams = {}): Promise<OwnerAttemptList> {
    return request<OwnerAttemptList>('GET', `${ASSIGNMENTS}/${encodeURIComponent(id)}/attempts${listQuery(params)}`, { auth: true });
  },
};

export const examsApi = {
  get(code: string): Promise<Exam> {
    return data('GET', `${EXAMS}/${encodeURIComponent(code.trim())}`);
  },

  start(code: string): Promise<Attempt> {
    return data('POST', `${EXAMS}/${encodeURIComponent(code.trim())}/start`);
  },

  attempt(id: string): Promise<Attempt> {
    return data('GET', `${EXAMS}/attempts/${encodeURIComponent(id)}`);
  },

  saveAnswers(id: string, answers: JsonObject): Promise<Attempt> {
    return data('PUT', `${EXAMS}/attempts/${encodeURIComponent(id)}/answers`, { answers });
  },

  submit(id: string, submission: { answers?: JsonObject; client_score?: number } = {}): Promise<Attempt> {
    return data('POST', `${EXAMS}/attempts/${encodeURIComponent(id)}/submit`, submission);
  },
};
