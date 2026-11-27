import { test, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { drawVariant, type ExerciseParams } from '../src/components/edu/exercise-params';

declare global {
  interface Window {
    __stabileo?: { solverReady?: () => boolean; nodeIds?: () => number[] };
  }
}

const TERMS = '2026-10-27';
const SEED = 2_718_281_828;
const PARAMS: ExerciseParams = { values: { L: { min: 4, max: 8, step: 1, label: 'L', unit: 'm' } } };
const SPEC = {
  id: 'e2e-exam-beam',
  title: 'E2E exam beam',
  description: 'Simply supported beam of {L} m under 10 kN/m.',
  difficulty: 'easy',
  category: 'statics',
  params: PARAMS,
  model: {
    nodes: [[0, 0], ['L', 0]],
    elements: [[0, 1]],
    supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }],
    distributedLoads: [{ element: 0, qI: -10 }],
  },
  supports: [{ label: 'A', nodeIndex: 0, dofs: ['Rx', 'Ry'] }, { label: 'B', nodeIndex: 1, dofs: ['Ry'] }],
  characteristics: [{ label: 'Mmax', unit: 'kN·m', answer: { kind: 'maxAbs', force: 'moment' } }],
  diagramQuestions: [],
};

interface Person { id: string; email: string; name: string; token: string }
const TEACHER: Person = { id: '6f1c2c0e-0000-4000-8000-0000000000aa', email: 'ada@example.com', name: 'Prof. Ada', token: 'T' };
const STUDENT: Person = { id: '6f1c2c0e-0000-4000-8000-0000000000bb', email: 'bruno@example.com', name: 'Bruno Student', token: 'S' };

const account = (p: Person) => ({
  id: p.id, email: p.email, name: p.name, company: null, job_title: null, country: null, locale: 'en', email_verified_at: null,
  inserted_at: '2026-10-27T12:00:00Z',
  consents: { terms: { version: TERMS, accepted_at: '2026-10-27T12:00:00Z' }, terms_current: true, usage_analytics: false, model_research: false },
});
const session = (p: Person) => ({ access_token: `access-${p.token}`, refresh_token: `refresh-${p.token}`, expires_in: 900, account: account(p) });

type Row = Record<string, unknown>;

/** One backend for both browsers, following `specs/services/assignments.md`. */
class Backend {
  assignments = new Map<string, Row>();
  attempts = new Map<string, Row>();
  submits: Row[] = [];

  who(route: Route): Person | null {
    const auth = route.request().headers().authorization ?? '';
    return auth === `Bearer access-${TEACHER.token}` ? TEACHER : auth === `Bearer access-${STUDENT.token}` ? STUDENT : null;
  }

  counts(a: Row) {
    const mine = [...this.attempts.values()].filter((x) => x.assignment_id === a.id);
    return { attempt_count: mine.length, submitted_count: mine.filter((x) => x.submitted_at).length };
  }

  owner(a: Row) {
    const { exercise: _e, owner_id: _o, ...rest } = a;
    return { ...rest, ...this.counts(a) };
  }

  studentAttempt(x: Row) {
    const a = this.assignments.get(x.assignment_id as string)!;
    const now = Date.now();
    const closed = !!x.submitted_at || now > Date.parse(x.deadline_at as string) + 30_000;
    return {
      id: x.id, code: a.code, title: a.title, seed: x.seed, started_at: x.started_at, deadline_at: x.deadline_at,
      submitted_at: x.submitted_at, answers: x.answers, client_score: x.client_score, closed, reveal: a.reveal,
      closes_at: a.closes_at, reveal_allowed: a.reveal === 'on_submit' ? closed : false, exercise: a.exercise, now: new Date(now).toISOString(),
    };
  }

  async handle(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()!) : {};
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const nowIso = new Date().toISOString();

    if (path === '/auth/config') {
      return json(200, { user_login_enabled: true, terms_version: TERMS, usage_telemetry_enabled: false, cloud_projects_enabled: false, save_requires_account: false, google_login: true, assignments_enabled: true });
    }
    if (path === '/auth/refresh') {
      const p = body.refresh_token === `refresh-${TEACHER.token}` ? TEACHER : body.refresh_token === `refresh-${STUDENT.token}` ? STUDENT : null;
      return p ? json(200, session(p)) : json(401, { error: 'refresh_failed', message: 'expired' });
    }
    if (path === '/auth/google/exchange') return json(200, session(STUDENT));
    if (path.startsWith('/insights/')) return json(202, {});
    const me = this.who(route);
    if (!me) return json(401, { error: 'unauthorized', message: 'sign in' });
    if (path === '/auth/me') return json(200, account(me));

    let m: RegExpMatchArray | null;
    if (path === '/assignments' && method === 'GET') {
      const data = [...this.assignments.values()].filter((a) => a.owner_id === me.id).map((a) => this.owner(a));
      return json(200, { data, meta: { total: data.length, limit: 100, offset: 0, max_assignments: 100 } });
    }
    if (path === '/assignments' && method === 'POST') {
      const id = `asg-${this.assignments.size + 1}`;
      const a: Row = {
        id, code: 'K7Q2M9XWPA', title: body.title, exercise: body.exercise, duration_minutes: body.duration_minutes,
        opens_at: body.opens_at ?? nowIso, closes_at: body.closes_at ?? null, reveal: body.reveal, owner_id: me.id, inserted_at: nowIso, updated_at: nowIso,
      };
      this.assignments.set(id, a);
      return json(201, { data: { ...this.owner(a), exercise: a.exercise } });
    }
    if ((m = path.match(/^\/assignments\/([^/]+)$/)) && method === 'GET') {
      const a = this.assignments.get(m[1]!);
      return a && a.owner_id === me.id ? json(200, { data: { ...this.owner(a), exercise: a.exercise } }) : json(404, { error: 'not_found', message: 'nope' });
    }
    if ((m = path.match(/^\/assignments\/([^/]+)\/attempts$/))) {
      const data = [...this.attempts.values()].filter((x) => x.assignment_id === m![1]).map((x) => {
        const p = x.account_id === STUDENT.id ? STUDENT : TEACHER;
        return { id: x.id, student: { id: p.id, name: p.name, email: p.email }, seed: x.seed, started_at: x.started_at, deadline_at: x.deadline_at, submitted_at: x.submitted_at, answers: x.answers, client_score: x.client_score };
      });
      return json(200, { data, meta: { total: data.length, limit: 100, offset: 0 } });
    }
    const byCode = (code: string) => [...this.assignments.values()].find((a) => a.code === code.toUpperCase());
    if ((m = path.match(/^\/exams\/attempts\/([^/]+)$/))) {
      const x = this.attempts.get(m[1]!);
      return x && x.account_id === me.id ? json(200, { data: this.studentAttempt(x) }) : json(404, { error: 'not_found', message: 'nope' });
    }
    if ((m = path.match(/^\/exams\/attempts\/([^/]+)\/(answers|submit)$/))) {
      const x = this.attempts.get(m[1]!);
      if (!x || x.account_id !== me.id) return json(404, { error: 'not_found', message: 'nope' });
      if (x.submitted_at) return json(409, { error: 'attempt_submitted', message: 'submitted' });
      if (body.answers) x.answers = body.answers;
      if (m[2] === 'submit') {
        x.submitted_at = nowIso;
        x.client_score = body.client_score ?? null;
        this.submits.push(body);
      }
      return json(200, { data: this.studentAttempt(x) });
    }
    if ((m = path.match(/^\/exams\/([^/]+)\/start$/))) {
      const a = byCode(m[1]!);
      if (!a) return json(404, { error: 'not_found', message: 'nope' });
      let x = [...this.attempts.values()].find((y) => y.assignment_id === a.id && y.account_id === me.id);
      if (!x) {
        x = { id: `att-${this.attempts.size + 1}`, assignment_id: a.id, account_id: me.id, seed: SEED, started_at: nowIso,
          deadline_at: new Date(Date.now() + (a.duration_minutes as number) * 60_000).toISOString(), submitted_at: null, answers: {}, client_score: null };
        this.attempts.set(x.id as string, x);
      }
      return json(200, { data: this.studentAttempt(x) });
    }
    if ((m = path.match(/^\/exams\/([^/]+)$/))) {
      const a = byCode(m[1]!);
      if (!a) return json(404, { error: 'not_found', message: 'nope' });
      const x = [...this.attempts.values()].find((y) => y.assignment_id === a.id && y.account_id === me.id);
      return json(200, { data: {
        code: a.code, title: a.title, owner_name: TEACHER.name, duration_minutes: a.duration_minutes, opens_at: a.opens_at, closes_at: a.closes_at,
        reveal: a.reveal, status: 'open', now: nowIso,
        attempt: x ? { id: x.id, started_at: x.started_at, deadline_at: x.deadline_at, submitted_at: x.submitted_at } : null,
      } });
    }
    return json(404, { error: 'not_found', message: path });
  }
}

async function person(context: BrowserContext, backend: Backend, signedIn: Person | null, library: unknown[]): Promise<Page> {
  await context.addInitScript(([token, lib]) => {
    try {
      if (sessionStorage.getItem('booted')) return;
      sessionStorage.setItem('booted', '1');
      localStorage.clear();
      localStorage.setItem('stabileo-lang', 'en');
      localStorage.setItem('stabileo-lang-manual', '1');
      localStorage.setItem('stabileo-feature-accounts', '1');
      if (token) localStorage.setItem('stabileo-refresh-token', token);
      if (lib) localStorage.setItem('stabileo.edu.exercises.v1', lib);
    } catch { /* storage blocked */ }
  }, [signedIn ? `refresh-${signedIn.token}` : '', library.length ? JSON.stringify(library) : ''] as const);
  await context.route(/\/api\/v1\/auth\/google(\?|$)/, (r) => {
    const attempt = new URL(r.request().url()).searchParams.get('attempt') ?? '';
    return r.fulfill({ status: 302, headers: { location: `/oauth-callback.html?code=code-1&attempt=${attempt}` } });
  });
  await context.route(/\/api\/v1\/(?!auth\/google(\?|$))/, (r) => backend.handle(r));
  return context.newPage();
}

test.describe('@smoke Education — homework and exams with an account', () => {
  test('a teacher assigns an exercise, a student takes it with the tools locked, and both see the same grade', async ({ browser }) => {
    const backend = new Backend();
    const L = drawVariant(PARAMS, SEED).values.L!;

    const teacherContext = await browser.newContext();
    const teacher = await person(teacherContext, backend, TEACHER, [SPEC]);
    await teacher.goto('/app/education?e2e=1');
    await expect(teacher.locator('.edu-panel')).toBeVisible({ timeout: 30_000 });
    await teacher.getByTestId('edu-assign').click();
    const dialog = teacher.getByTestId('assign-dialog');
    await dialog.getByTestId('assign-name').fill('TP 3: beams');
    await dialog.getByTestId('assign-duration').fill('45');
    await dialog.getByTestId('assign-save').click();
    const link = await dialog.getByTestId('assign-link').inputValue();
    expect(new URL(link).pathname).toBe('/app/exam/K7Q2M9XWPA');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(teacher.getByTestId('assignment-row')).toContainText('TP 3: beams');

    const studentContext = await browser.newContext();
    const student = await person(studentContext, backend, null, []);
    await student.goto(`${new URL(link).pathname}?e2e=1`);
    const panel = student.getByTestId('exam-panel');
    await expect(panel).toHaveAttribute('data-phase', 'signin', { timeout: 30_000 });
    await student.getByTestId('exam-signin').click();
    await student.getByTestId('auth-google').click();
    await expect(student.getByTestId('auth-dialog')).toHaveCount(0);
    await expect(panel).toHaveAttribute('data-phase', 'lobby');
    await expect(student.getByTestId('exam-owner')).toHaveText('Prof. Ada');
    await expect(student.getByTestId('exam-privacy')).toContainText('name and email');

    await student.getByTestId('exam-start').click();
    await student.getByTestId('exam-start-confirm').click();
    await expect(panel).toHaveAttribute('data-phase', 'running');
    await expect(student.getByTestId('exam-countdown').first()).toBeVisible();
    await student.waitForFunction(() => (window.__stabileo?.nodeIds?.() ?? []).length === 2, null, { timeout: 30_000 });

    for (const absent of ['account-button', 'ai-open', 'rb-settings', 'pro-settings', 'edu-handin', 'edu-feedback-preview']) {
      await expect(student.getByTestId(absent), `${absent} is locked away`).toHaveCount(0);
    }
    for (const absent of ['.tab-bar', '.mode-toggle', '.ribbon', '.btn-help', '.verify-btn', '.reveal-btn', '.edu-author-btn']) {
      await expect(student.locator(absent), `${absent} is locked away`).toHaveCount(0);
    }
    await expect(student.locator('.logo-home')).toBeDisabled();
    await expect(student.locator('.exercise-description')).toContainText(`${L} m`);

    const fields = student.locator('.dof-input input');
    await expect(fields).toHaveCount(3);
    await fields.nth(0).fill('0');
    await fields.nth(1).fill(String(5 * L));
    await fields.nth(2).fill(String(5 * L + 7));
    await student.getByTestId('edu-step-values').click();
    await student.locator('.char-input input').first().fill(String(1.25 * L * L));
    await expect(student.getByTestId('exam-save-state')).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });

    await student.reload();
    await expect(panel).toHaveAttribute('data-phase', 'running', { timeout: 30_000 });
    await expect(student.locator('.dof-input input').nth(2), 'the attempt resumes with its saved answers').toHaveValue(String(5 * L + 7));

    await student.getByTestId('exam-submit').click();
    await student.getByTestId('exam-submit-confirm').click();
    await expect(panel).toHaveAttribute('data-phase', 'closed');
    const score = student.getByTestId('exam-score');
    await expect(score).toHaveAttribute('data-correct', '3');
    await expect(score).toHaveAttribute('data-total', '4');
    await expect(student.locator('[data-testid="exam-answer"][data-key="r:1:Ry"]')).toHaveAttribute('data-outcome', 'incorrect');
    await expect(student.locator('[data-testid="exam-answer"][data-key="r:1:Ry"]')).toContainText((5 * L).toFixed(2));
    await expect(student.locator('[data-testid="exam-answer"][data-key="c:0"]')).toContainText('largest absolute value');
    await expect(student.getByTestId('account-button'), 'the lock is lifted once handed in').toBeVisible();
    expect(backend.submits).toHaveLength(1);
    expect(backend.submits[0]!.client_score).toBe(0.75);

    await teacher.reload();
    await teacher.getByTestId('assignment-attempts').click();
    const row = teacher.getByTestId('attempt-row');
    await expect(row).toContainText('Bruno Student');
    await expect(row.getByTestId('attempt-score')).toHaveText('3 of 4');
    await row.getByTestId('attempt-detail').click();
    await expect(teacher.locator('.review')).toBeVisible();
    const download = teacher.waitForEvent('download');
    await teacher.getByTestId('attempts-csv').click();
    const csv = await (await download).createReadStream().then(async (s) => {
      const chunks: Buffer[] = [];
      for await (const c of s) chunks.push(c as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    });
    expect(csv).toMatch(/Bruno Student,bruno@example\.com,[^,]+,[^,]+,Handed in,3,4,75/);

    await teacherContext.close();
    await studentContext.close();
  });
});
