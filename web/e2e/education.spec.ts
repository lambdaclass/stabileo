import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window { __stabileo?: { solverReady?: () => boolean } }
}

/**
 * Education, driven the way the two people who use it do.
 *
 * Every defect this suite pins was invisible to unit tests, because each unit
 * involved was correct and only the arrangement was wrong:
 *
 *  - A teacher's exercise link was eaten before anything could read it. The app
 *    rewrote the URL from `pathname + search` while the mode was still being
 *    resolved, so `#edu-ex=` was gone by the time the Education panel mounted.
 *    Nothing threw; the student simply landed on the exercise list.
 *  - The authoring form's default option told a teacher to draw with "the usual
 *    tools" in a mode that mounts no tools at all.
 *  - The three steps of an exercise were stacked in one scroll under a stepper
 *    that did nothing.
 *
 * All three are integration properties of the shell, so they are checked here
 * rather than by reading source.
 */

const EDU_URL = '/app/education';

/** An exercise a teacher would hand out, in the format the app writes. */
const EXERCISE = {
  stabileoExercise: 1,
  exercise: {
    id: 'e2e-cantilever',
    title: 'E2E cantilever',
    description: 'A 4 m cantilever with a 10 kN point load at the tip.',
    difficulty: 'easy',
    category: 'statics',
    model: {
      nodes: [[0, 0], [4, 0]],
      elements: [[0, 1]],
      supports: [{ node: 0, type: 'fixed' }],
      nodalLoads: [{ node: 1, fy: -10 }],
    },
    supports: [{ label: 'Fixed end', nodeIndex: 0, dofs: ['Ry', 'M'] }],
    characteristics: [{ label: 'M max', unit: 'kN·m', answer: { kind: 'maxAbsMoment' } }],
    diagramQuestions: [],
  },
};

/** The same encoding `toShareLink` uses, so the spec exercises the real reader. */
function shareLink(): string {
  const json = JSON.stringify(EXERCISE, null, 2);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  return `${EDU_URL}#edu-ex=${b64}`;
}

/**
 * Boot Education and wait for the SOLVER, not only for the panel.
 *
 * Every answer in this mode is marked against the solve — including the drawn
 * diagram, which is compared with the real one sampled from it. A spec that
 * types an answer as soon as the panel appears is racing the engine, and gets
 * a verdict of "not checked" that looks exactly like a broken feature.
 */
/** Open an exercise from the list and wait for it to be gradeable. */
async function openExercise(page: Page, nth = 0) {
  await page.locator('.exercise-card').nth(nth).click();
  await expect(page.locator('.exercise-view')).toHaveAttribute('data-solved', 'yes', { timeout: 30_000 });
}

async function bootEducation(page: Page, url = EDU_URL) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('stabileo-lang', 'en');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  const [path, hash] = url.split('#');
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}e2e=1${hash ? '#' + hash : ''}`);
  await expect(page.locator('.edu-panel')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.__stabileo?.solverReady?.() === true, null, { timeout: 60_000 });
  /*
   * And for the exercise's own model to be in the store.
   *
   * Opening an exercise clears the model, rebuilds it and solves it, and the
   * view is keyed on the exercise — so anything typed while that is still in
   * flight is discarded by the remount, and the spec sees empty fields it
   * swears it filled. The status bar reports the built model, which is the
   * first honest sign that the sequence is over.
   */
  if (hash) {
    await expect(page.locator('.exercise-view')).toHaveAttribute('data-solved', 'yes', { timeout: 30_000 });
  }
}

test.describe('@smoke Education — a handed-out exercise', () => {
  test('a link opens the exercise it carries, not the exercise list', async ({ page }) => {
    await bootEducation(page, shareLink());

    // The exercise itself, not the catalogue it was filed into.
    await expect(page.locator('.exercise-view')).toBeVisible();
    await expect(page.getByTestId('edu-handout-title')).toHaveText('E2E cantilever');
    await expect(page.locator('.exercise-card')).toHaveCount(0);
  });

  test('the window drops the exits a student was not sent to', async ({ page }) => {
    await bootEducation(page, shareLink());

    // No mode switcher, no tab strip, no "+" for a new project.
    await expect(page.locator('.mode-toggle')).toHaveCount(0);
    await expect(page.locator('.tab-bar')).toHaveCount(0);
  });

  test('one step at a time, and the stepper moves between them', async ({ page }) => {
    await bootEducation(page, shareLink());

    await expect(page.locator('.step-section')).toHaveCount(1);
    // Uppercase is a CSS transform; the DOM text is the sentence itself.
    await expect(page.locator('.step-title')).toContainText('Support Reactions');

    await page.getByTestId('edu-step-3').click();
    await expect(page.locator('.step-section')).toHaveCount(1);
    await expect(page.locator('.step-title')).toContainText('Characteristic values');
  });

  test('a student hands in a code the teacher can open', async ({ page }) => {
    await bootEducation(page, shareLink());

    // Answer the reaction the exercise asks for. 10 kN up, 40 kN·m at the base.
    const fields = page.locator('.dof-input input');
    await fields.nth(0).fill('10');
    await fields.nth(1).fill('-40');
    await page.locator('.verify-btn').first().click();

    await page.locator('.handin-name input').fill('E2E student');
    await page.getByTestId('edu-handin-code').click();
    const code = await page.locator('.handin-code').inputValue();
    expect(code.length, 'a code was produced').toBeGreaterThan(50);

    // A different session — the teacher's — reads it.
    await page.evaluate(() => localStorage.clear());
    await page.goto(EDU_URL);
    await expect(page.locator('.edu-panel')).toBeVisible();
    await page.locator('.submit-code').fill(code);
    await page.getByTestId('edu-open-code').click();

    const review = page.locator('.review');
    await expect(review).toBeVisible();
    await expect(review).toContainText('E2E student');
    await expect(review).toContainText('E2E cantilever');
    // Question / answer / outcome for every field that was asked for.
    await expect(review.locator('tbody tr')).toHaveCount(3);
  });
});

test.describe('@smoke Education — drawing the diagram', () => {
  test('the built-in beam asks for the diagram to be drawn, and marks it', async ({ page }) => {
    await bootEducation(page);
    await openExercise(page);
    await page.getByTestId('edu-step-2').click();

    // Shear and moment, each with its own strip and its own spans.
    await expect(page.locator('.ds-plot')).toHaveCount(2);
    await expect(page.locator('.ds-span')).toHaveCount(2);

    // Draw the shear: +qL/2 to −qL/2, straight. q = 5 kN/m over 8 m.
    const values = page.locator('.ds-val');
    await values.nth(0).fill('20');
    await values.nth(1).fill('-20');
    await page.locator('.ds-pw', { hasText: /^lin$/ }).first().click();
    await page.locator('.verify-btn', { hasText: /Verify the drawing/i }).click();

    const verdict = page.locator('.sketch-verdict').first();
    await expect(verdict.locator('.sv-ok')).toHaveCount(2);
  });

  test('a right picture with the wrong power named is told which one', async ({ page }) => {
    await bootEducation(page);
    await openExercise(page);
    await page.getByTestId('edu-step-2').click();

    // Left untouched, both spans say "constant". Under a uniform load the
    // shear is linear and the moment quadratic, and the student is told which
    // is which rather than just "wrong".
    await page.locator('.verify-btn', { hasText: /Verify the drawing/i }).click();
    const notes = page.locator('.sketch-notes');
    await expect(notes.nth(0), 'the shear').toContainText(/you chose constant, it is linear/i);
    await expect(notes.nth(1), 'the moment').toContainText(/you chose constant, it is quadratic/i);
  });
});

test.describe('@smoke Education — the whole flow', () => {
  test('the first statics exercise can be finished, and shows what the teacher gets', async ({ page }) => {
    await bootEducation(page);
    await openExercise(page);

    // ── Step 1 · reactions. q = 5 kN/m over 8 m → 20 kN each support.
    const dofs = page.locator('.dof-input input');
    await dofs.nth(0).fill('0');
    await dofs.nth(1).fill('20');
    await dofs.nth(2).fill('20');
    await page.locator('.radio-option', { hasText: /Isostatic/i }).first().click();
    await page.locator('.verify-btn').first().click();
    await expect(page.getByTestId('edu-step-1')).toHaveClass(/done/);

    // ── Step 2 · the shapes, the drawings, and the two values.
    await page.getByTestId('edu-step-2').click();
    for (const [i, want] of [[0, 'Zero'], [1, 'Linear'], [2, 'Quadratic']] as const) {
      await page.locator('.shape-row').nth(i)
        // Not anchored: the label carries the radio and its whitespace too.
        .locator('label.radio-option', { hasText: new RegExp(want, 'i') }).first().click();
    }
    await page.locator('.verify-btn', { hasText: /Verify shapes/i }).click();

    // Shear: +20 to −20, straight.
    const shear = page.locator('.ds').nth(0);
    await shear.locator('.ds-val').nth(0).fill('20');
    await shear.locator('.ds-val').nth(1).fill('-20');
    await shear.locator('.ds-pw', { hasText: /^lin$/ }).click();

    // Moment: an ordinate at midspan, −40 there, both halves quadratic with
    // their flat end at the peak — where the shear crosses zero.
    const moment = page.locator('.ds').nth(1);
    await moment.locator('.ds-add').click();
    await moment.locator('.ds-val').nth(1).fill('40');
    const spans = moment.locator('.ds-span');
    await spans.nth(0).locator('.ds-pw', { hasText: '²' }).click();
    await spans.nth(1).locator('.ds-pw', { hasText: '²' }).click();
    await spans.nth(0).locator('.ds-vertex .ds-pw').nth(1).click();
    await spans.nth(1).locator('.ds-vertex .ds-pw').nth(0).click();

    await page.locator('.verify-btn', { hasText: /Verify the drawing/i }).click();
    await expect(page.locator('.sketch-verdict .sv-bad')).toHaveCount(0);

    const numeric = page.locator('.diagram-questions input');
    await numeric.nth(0).fill('20');
    await numeric.nth(1).fill('40');
    await page.locator('.verify-btn', { hasText: /Verify diagrams/i }).click();
    await expect(page.getByTestId('edu-step-2')).toHaveClass(/done/);

    // ── Step 3 · the characteristic values.
    await page.getByTestId('edu-step-3').click();
    const chars = page.locator('.char-input input');
    await chars.nth(0).fill('40');
    await chars.nth(1).fill('20');
    await page.locator('.verify-btn').last().click();
    await expect(page.getByTestId('edu-step-3')).toHaveClass(/done/);
    await expect(page.locator('.success-banner')).toBeVisible();

    // ── And what the teacher will see, from the student's own screen.
    await page.getByTestId('edu-feedback-preview').click();
    const feedback = page.locator('.handin-feedback');
    await expect(feedback).toBeVisible();
    await expect(feedback.locator('.score')).toContainText(/13 \/ 13/);
  });
});

test.describe('@smoke Education — the teacher decides about revealing', () => {
  test('an exercise with reveal off never offers the answer', async ({ page }) => {
    const locked = {
      ...EXERCISE,
      exercise: { ...EXERCISE.exercise, id: 'e2e-locked', allowReveal: false },
    };
    const b64 = Buffer.from(JSON.stringify(locked, null, 2), 'utf8').toString('base64');
    await bootEducation(page, `${EDU_URL}#edu-ex=${b64}`);

    // Get it wrong on purpose: that is when the reveal appears in practice.
    const fields = page.locator('.dof-input input');
    await fields.nth(0).fill('123');
    await fields.nth(1).fill('456');
    await page.locator('.verify-btn').first().click();

    await expect(page.locator('.verif-incorrect').first()).toBeVisible();
    await expect(page.locator('.reveal-btn'), 'no way to ask for the answer').toHaveCount(0);
  });

  test('the same exercise with reveal on does offer it', async ({ page }) => {
    await bootEducation(page, shareLink());
    const fields = page.locator('.dof-input input');
    await fields.nth(0).fill('123');
    await fields.nth(1).fill('456');
    await page.locator('.verify-btn').first().click();

    await expect(page.locator('.reveal-btn').first()).toBeVisible();
  });
});

test.describe('@smoke Education — authoring', () => {
  test('the drawing tools exist in the mode that tells you to draw', async ({ page }) => {
    await bootEducation(page);
    await page.locator('.edu-author-btn').click();

    // The bar, and the four tools an exercise author needs.
    await expect(page.locator('.floating-tools')).toBeVisible();
    // "Member", not "Element": Basic renamed the bar throughout, and the
    // authoring bar is the same component under the same keys.
    for (const tool of ['Node', 'Member', 'Support', 'Load']) {
      await expect(page.locator('.ft-btn', { hasText: tool })).toBeVisible();
    }
  });

  test('asking for a drawn diagram is one control, beside naming its shape', async ({ page }) => {
    await bootEducation(page);
    await page.locator('.edu-author-btn').click();
    // The questions only exist once there is a structure to ask about, so the
    // shortest honest path to them is the example loader.
    await page.locator('.src-tab', { hasText: /Example/i }).click();
    await page.locator('.btn-primary', { hasText: /Load/i }).click();

    // Beside the shape question it upgrades, not behind anything.
    await expect(page.getByTestId('author-add-sketch')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('author-add-sketch').click();
    await expect(page.getByTestId('author-sketch-diagram-0')).toBeVisible();

    // And the reveal switch, on by default.
    await expect(page.getByTestId('author-allow-reveal')).toBeChecked();
  });

  test('both ways into a submission are named, and neither is a system widget', async ({ page }) => {
    await bootEducation(page);

    // A native file input renders as an unstyled button labelled "Choose File";
    // the visible controls here must be the app's own, each with its `?`.
    await expect(page.getByTestId('edu-open-submission')).toContainText(/Open a file/i);
    await expect(page.getByTestId('edu-open-code')).toContainText(/Open code/i);
    await expect(page.locator('.submit-row .help-btn')).toHaveCount(2);
    await expect(page.locator('.submit-row input[type=file]')).toHaveCount(0);
  });
});
