/**
 * The legacy-projects test of one released version (#718): every file it saved opens with the
 * current code and migrates; every solved one gives the results that version showed, or a
 * registered result change explains the difference; its session file restores every tab.
 * See `legacy.ts` for the verdicts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../engine/wasm-solver';
import { loadFile } from '../store/file';
import { tabManager } from '../store/tabs.svelte';
import { uiStore } from '../store/ui.svelte';
import {
  assessedChanges, captureExample, committedSnapshot, currentFixtureBlob, judge, migrationMessage, modelCounts, openAndSolve,
  readCorpusText, readManifest, readResults, reset, solveAndRecord, unexplainedMessage, type Verdict,
} from './legacy';

export function runLegacyVersion(tag: string): void {
  const m = readManifest(tag);
  const lines: string[] = [];
  const record = (what: string, v: Verdict) => {
    if (v.kind === 'explained') lines.push(`  ${what}: differs, explained by ${v.explainedBy.join(', ')}`);
    for (const n of v.notes) lines.push(`  ${what}: (report only) ${n}`);
  };

  beforeAll(async () => { await initSolver(); });
  afterAll(() => {
    // The list the issue asks for: every difference and the registered change that explains it.
    if (lines.length) console.info(`legacy projects ${tag}:\n${lines.join('\n')}`);
  });

  describe(`${tag} (results version ${m.resultsVersion}, ${m.commit.slice(0, 9)})`, () => {
    for (const e of m.examples) {
      it(`${e.example}: opens and migrates${e.results ? ', and gives that version\'s results or a registered change' : ''}`, async () => {
        const text = readCorpusText(`${tag}/${e.file}`);
        expect(JSON.parse(text).version, 'the file format the manifest records').toBe(e.fileFormatVersion);
        const opened = await openAndSolve(text, { solve: !!e.results });
        expect({
          nodes: opened.values['model.nodes'], elements: opened.values['model.elements'], shells: opened.values['model.shells'],
        }, 'the model the version saved, member for member').toEqual(e.model);
        expect(uiStore.analysisMode, 'the workspace it was saved from').toBe(e.analysisMode ?? '2d');
        if (!e.results) return;

        const then = judge(`${tag}/${e.example} against ${tag}'s results`, readResults(`${tag}/${e.results}`), opened.values, opened.changes);
        record(`${e.example} vs ${tag}`, then);
        if (then.kind === 'unexplained') throw new Error(unexplainedMessage(then, tag));

        // The same example opened by the current code: the results snapshot gate's committed
        // snapshot (#716) when there is one, else solved here. Only when the example is the one the
        // version saved: one edited since is another model.
        if (e.fixtureBlob !== currentFixtureBlob(e.example)) return;
        const snap = committedSnapshot(e.example, e.workspace);
        const now = snap?.values ?? await captureExample(e.example, e.workspace);
        const vsNow = judge(`${tag}/${e.example} against ${snap ? snap.name : `today's ${e.example}`}`, now, opened.values, []);
        record(`${e.example} vs current`, vsNow);
        if (vsNow.kind !== 'same') throw new Error(migrationMessage(vsNow, tag));
      }, 120_000);
    }

    const s = m.session;
    const tabs = s.tabs ?? [];
    if (s.file) {
      it(`session (envelope ${s.envelopeVersion}): every tab restores and gives its example's results`, async () => {
        reset('2d');
        const text = readCorpusText(`${tag}/${s.file}`);
        const r = await loadFile(new File([text], 'session.ded'));
        expect(r).toEqual({ type: 'session', count: tabs.length });
        const ids = tabManager.tabs.map((t) => t.id);
        expect(ids).toHaveLength(tabs.length);
        for (const [i, id] of ids.entries()) {
          const tab = tabs[i];
          if (tabManager.activeTabId !== id) tabManager.switchTab(id);
          expect(uiStore.analysisMode, `tab ${i + 1}'s workspace`).toBe(tab.workspace);
          const entry = m.examples.find((x) => x.example === tab.id)!;
          const changes = await assessedChanges();
          const values = modelCounts();
          await solveAndRecord(values);
          const v = judge(`${tag}/session tab ${i + 1} (${tab.id})`, readResults(`${tag}/${entry.results}`), values, changes);
          record(`session tab ${i + 1}`, v);
          if (v.kind === 'unexplained') throw new Error(unexplainedMessage(v, tag));
        }
      }, 120_000);
    } else {
      it(`session: none, ${tag} could not write one`, () => {
        expect(s.unavailable, 'the manifest says why').toMatch(/\S/);
      });
    }
  });
}
