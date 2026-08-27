/**
 * I-06 and I-07, as a user meets them: does the joint work survive, and does it stay put.
 *
 * ── What only this settles ──────────────────────────────────────────
 *
 * The unit tests prove `snapshot()`/`restore()` carries the choices, and that reconciliation
 * refuses a joint whose node moved. What they cannot prove is that the FILE carries it — a `.ded`
 * written by the real Save button, opened on a page that has never seen the model — nor that the
 * panel says so when it refuses.
 *
 * The chain is the seven steps the finding asked for, in order:
 *
 *     design → save → reload → the choices survive → change model → cleared or obsolete
 *     → no joint from the other model is dragged in
 *
 * ── Why the assertions read the PROJECT, not the panel ──────────────
 *
 * `jointDesigns()` reads `model.jointDesigns`, which is the field a `.ded` actually writes. A
 * spec that asserted the panel still showed 6 bolts after an open would pass just as happily on a
 * panel that had quietly kept a local copy — which is the shape of the defect, not its absence.
 */

import { readFileSync } from 'node:fs';
import { test, expect, PRO_URL, loadModel, solveModel } from './fixtures';
import type { Page } from '@playwright/test';

/** A temp path unique to this file, so a parallel spec's download cannot collide with it. */
const SAVED = new URL('./.artifacts/joint-persistence.ded.json', import.meta.url).pathname;

async function openConnections(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
}

/**
 * Design the first joint of the shed: bolts, a plate, and the count changed off its default.
 *
 * Solved first, because without an analysis there is no demand and several checks are
 * `unavailable` — which does not matter for persistence, but does mean the joint would sit in a
 * state nobody would ever save.
 */
async function designFirstJoint(page: Page): Promise<number> {
  await solveModel(page);
  await openConnections(page);
  await page.locator('.conn-joint-row').first().click();
  await expect(page.getByTestId('joint-design')).toBeVisible();

  await page.getByTestId('jd-count').fill('6');
  await page.getByTestId('jd-count').blur();
  await page.getByTestId('jd-plate-t').fill('12');
  await page.getByTestId('jd-plate-t').blur();
  await page.getByTestId('jd-plate-fu').fill('400');
  await page.getByTestId('jd-plate-fu').blur();

  await expect.poll(async () =>
    (await page.evaluate(() => window.__stabileo.jointDesignedNodeIds())).length,
  ).toBe(1);
  const [nodeId] = await page.evaluate(() => window.__stabileo.jointDesignedNodeIds());
  return nodeId;
}

async function saveDed(page: Page, to: string): Promise<void> {
  /*
   * No explicit timeout on the download.
   *
   * `ded-roundtrip.spec.ts` passes 300 s because it saves the 7-storey project — about 48 MB — and
   * raises its own test timeout to match. This project is a shed, and the suite's test timeout is
   * 60 s, so a 300 s wait here could never be reached: the test would fail first and the number
   * would only look like a licence. The default is the honest one.
   */
  const download = page.waitForEvent('download');
  await page.getByTestId('pr-save').click();
  await (await download).saveAs(to);
}

async function openDed(page: Page, path: string): Promise<void> {
  await page.getByTestId('pr-project').click();
  await expect(page.getByTestId('pro-project-tab')).toBeVisible();
  await page.getByTestId('pp-open-file').setInputFiles(path);
}

type StoredDesigns = {
  version: number;
  joints: Array<{
    nodeId: number;
    atMm: { x: number; y: number; z: number };
    memberCount: number;
    choices: { bolts?: { count?: number }; plate?: { thicknessMm?: number; fuMPa?: number } };
  }>;
} | null;

const designs = (page: Page) =>
  page.evaluate(() => window.__stabileo.jointDesigns() as StoredDesigns);

test.describe('I-06 · the joint work survives a save and an open', () => {
  test('a designed joint is written to the file and comes back from it', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    const nodeId = await designFirstJoint(page);

    // 1–2 · designed, then saved.
    const live = await designs(page);
    expect(live?.joints).toHaveLength(1);
    expect(live!.joints[0].choices.bolts?.count).toBe(6);
    await saveDed(page, SAVED);

    // The file itself carries it. Not "a download started".
    const onDisk = JSON.parse(readFileSync(SAVED, 'utf8'));
    // A `.ded` is `{ version, name, snapshot }` — the model data lives under `snapshot`.
    const inFile = onDisk.snapshot?.jointDesigns;
    expect(inFile, 'the .ded has no jointDesigns field').toBeTruthy();
    expect(inFile.joints).toHaveLength(1);

    // 3 · reload — a page that has never seen this model.
    await page.goto(PRO_URL);
    expect(await designs(page)).toBeNull();

    // 4 · the choices survive.
    await openDed(page, SAVED);
    await expect.poll(async () => (await designs(page))?.joints.length ?? 0).toBe(1);
    const back = await designs(page);
    expect(back!.joints[0].nodeId).toBe(nodeId);
    expect(back!.joints[0].choices.bolts?.count).toBe(6);
    expect(back!.joints[0].choices.plate).toEqual({ thicknessMm: 12, fuMPa: 400 });

    // Reconciled, not obsolete: it is the same model it was designed against.
    expect(await page.evaluate(() => window.__stabileo.jointObsolete())).toEqual([]);
    expect(await page.evaluate(() => window.__stabileo.jointDesignedNodeIds())).toEqual([nodeId]);
  });

  /*
   * The choices came back and nothing computed did. That is the store's rule and it now applies
   * to a saved joint too: a capacity read out of a file could describe a member the file no
   * longer has.
   */
  test('the file stores choices only, never a capacity', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    await designFirstJoint(page);
    await saveDed(page, SAVED);
    const text = JSON.stringify(JSON.parse(readFileSync(SAVED, 'utf8')).snapshot.jointDesigns);
    for (const word of ['capacityKN', 'holesM', 'utilisation', 'checks', 'demands']) {
      expect(text, word).not.toContain(word);
    }
  });

  /* And the panel shows it as designed again — recomputed against this model. */
  test('the panel shows the reopened joint as designed', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    await designFirstJoint(page);
    await saveDed(page, SAVED);

    await page.goto(PRO_URL);
    await openDed(page, SAVED);
    await solveModel(page);
    await openConnections(page);
    await page.locator('.conn-joint-row').first().click();
    await expect(page.getByTestId('joint-design')).toBeVisible();
    await expect(page.getByTestId('joint-design-state'))
      .not.toHaveAttribute('data-state', 'notDesigned');
    await expect(page.getByTestId('jd-count')).toHaveValue('6');
    await expect(page.getByTestId('jd-plate-t')).toHaveValue('12');
  });
});

test.describe('I-07 · joints do not follow you into another model', () => {
  /*
   * The finding, reproduced exactly: design a joint, load another example WITHOUT reloading the
   * page, and look at the same node id. It used to come back wearing the previous model's bolts.
   */
  test('loading another example in the same session drops them', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    const nodeId = await designFirstJoint(page);
    expect((await designs(page))?.joints).toHaveLength(1);

    // Another model, same page, nobody reloading and nobody calling reset().
    await loadModel(page, '3d-portal-frame');

    expect(await designs(page)).toBeNull();
    expect(await page.evaluate(() => window.__stabileo.jointDesignedNodeIds())).toEqual([]);
    // Not lingering as an obsolete entry either: the new model replaced the field.
    expect(await page.evaluate(() => window.__stabileo.jointObsolete())).toEqual([]);

    // And the node that shares the id is undesigned, which is the assertion that matters.
    await openConnections(page);
    const rows = page.locator('.conn-joint-row');
    if (await rows.count() > 0) {
      await rows.first().click();
      await expect(page.getByTestId('joint-design-state'))
        .toHaveAttribute('data-state', 'notDesigned');
    }
    expect(nodeId).toBeGreaterThan(0);
  });

  /* Opening a second project over a session that had joints replaces them rather than merging. */
  test('opening another project replaces the joints', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    await designFirstJoint(page);
    await saveDed(page, SAVED);

    // A fresh session, a DIFFERENT model with a joint designed, then the saved file over it.
    await page.goto(PRO_URL);
    await loadModel(page, '3d-portal-frame');
    await openConnections(page);
    const rows = page.locator('.conn-joint-row');
    await expect(rows.first()).toBeVisible();
    await rows.first().click();
    await page.getByTestId('jd-plate-t').fill('25');
    await page.getByTestId('jd-plate-t').blur();
    await expect.poll(async () => (await designs(page))?.joints.length ?? 0).toBe(1);
    expect((await designs(page))!.joints[0].choices.plate?.thicknessMm).toBe(25);

    await openDed(page, SAVED);
    await expect.poll(async () =>
      (await designs(page))?.joints[0]?.choices.plate?.thicknessMm ?? null,
    ).toBe(12);
    // Exactly one joint: the opened project's. The 25 mm plate did not come along.
    expect((await designs(page))!.joints).toHaveLength(1);
  });

  /**
   * A stored joint whose node this model does not have is OBSOLETE — visible, named, remediable.
   *
   * Produced by hand-editing the saved file, which is the honest way to reach it: it is exactly
   * what a `.ded` from a model that was edited elsewhere looks like. Moving the node rather than
   * deleting it is the id-coincidence case in its purest form — the id still resolves, and the
   * joint is still not this model's.
   */
  test('a joint whose node moved is shown as obsolete, with a reason and a way out', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    const nodeId = await designFirstJoint(page);
    await saveDed(page, SAVED);

    const parsed = JSON.parse(readFileSync(SAVED, 'utf8'));
    // The stored joint claims a position the model no longer puts that node at.
    const joint = parsed.snapshot.jointDesigns.joints[0];
    joint.atMm = { ...joint.atMm, x: joint.atMm.x + 1500 };
    const tampered = SAVED.replace('.ded.json', '-moved.ded.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tampered, JSON.stringify(parsed));

    await page.goto(PRO_URL);
    await openDed(page, tampered);

    await expect.poll(async () =>
      (await page.evaluate(() => window.__stabileo.jointObsolete())).length,
    ).toBe(1);
    expect(await page.evaluate(() => window.__stabileo.jointObsolete()))
      .toEqual([{ nodeId, reason: 'nodeMoved' }]);
    // Not applied.
    expect(await page.evaluate(() => window.__stabileo.jointDesignedNodeIds())).toEqual([]);
    // Not silently dropped either: the entry is still in the project.
    expect((await designs(page))?.joints).toHaveLength(1);

    // Said on screen, with the reason, not merely "obsolete".
    await solveModel(page);
    await openConnections(page);
    const notice = page.getByTestId('conn-obsolete-notice');
    await expect(notice).toBeVisible();
    await expect(page.getByTestId(`conn-obsolete-reason-${nodeId}`)).not.toBeEmpty();
    // A notice with no way out is a complaint.
    await expect(page.getByTestId('conn-obsolete-discard-all')).toBeVisible();

    // And the remedy works.
    await page.getByTestId('conn-obsolete-discard-all').click();
    await expect(notice).toBeHidden();
    await expect.poll(async () => await designs(page)).toBeNull();
  });

  /**
   * The other reason: the node is not there at all.
   *
   * Reached through the file, like the case above, and for the same reason — there is no
   * `deleteNode` action and adding a state setter so a spec can reach a branch is precisely what
   * `e2e-hooks.ts` refuses to do. The mid-session deletion is covered where it can be: the store
   * test drives `modelStore` directly and asserts the design goes obsolete on the next read.
   */
  test('a joint whose node is not in the model reads as nodeMissing', async ({ page }) => {
    await page.goto(PRO_URL);
    await loadModel(page, '3d-nave-industrial');
    const nodeId = await designFirstJoint(page);
    await saveDed(page, SAVED);

    const parsed = JSON.parse(readFileSync(SAVED, 'utf8'));
    // Renumber the stored joint onto an id no node in this model carries.
    const maxNode = Math.max(
      ...(parsed.snapshot.nodes as Array<[number, unknown]>).map(([id]) => id),
    );
    parsed.snapshot.jointDesigns.joints[0].nodeId = maxNode + 1000;
    const tampered = SAVED.replace('.ded.json', '-missing.ded.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tampered, JSON.stringify(parsed));

    await page.goto(PRO_URL);
    await openDed(page, tampered);

    await expect.poll(async () =>
      (await page.evaluate(() => window.__stabileo.jointObsolete()))[0]?.reason ?? null,
    ).toBe('nodeMissing');
    expect(await page.evaluate(() => window.__stabileo.jointDesignedNodeIds())).toEqual([]);
    expect(nodeId).toBeGreaterThan(0);
  });
});
