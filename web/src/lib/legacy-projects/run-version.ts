/**
 * The legacy-projects test of one released version (#718): every file it saved, and every tab of
 * its session file, opens with the current code and migrates to the model of the example it was
 * saved from; every solved one gives the results the current code gives that example, and the
 * results that version showed or a registered result change explains the difference.
 * See `legacy.ts` for the verdicts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../engine/wasm-solver';
import { uiStore } from '../store/ui.svelte';
import {
  againstExample, judge, openAndSolve, openSession, readCorpusText, readManifest, readResults, unexplainedMessage, type Verdict,
} from './legacy';

/** The releases whose `sessionPayload` threw ($state.snapshot from a plain module; fixed before v0.4.0). */
const SESSION_WRITER_BROKEN = ['v0.2.0', 'v0.3.0'];

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
      it(`${e.example}: opens and migrates to the model it was saved from${e.results ? ', the results the current code gives that example, and that version\'s results or a registered change' : ''}`, async () => {
        const text = readCorpusText(`${tag}/${e.file}`);
        expect(JSON.parse(text).version, 'the file format the manifest records').toBe(e.fileFormatVersion);
        const opened = await openAndSolve(text, { solve: !!e.results });
        expect({
          nodes: opened.values['model.nodes'], elements: opened.values['model.elements'], shells: opened.values['model.shells'],
        }, 'the model the version saved, member for member').toEqual(e.model);
        expect(uiStore.analysisMode, 'the workspace it was saved from').toBe(e.analysisMode ?? '2d');

        if (e.results) {
          const then = judge(`${tag}/${e.example} against ${tag}'s results`, readResults(`${tag}/${e.results}`), opened.values, opened.changes);
          record(`${e.example} vs ${tag}`, then);
          if (then.kind === 'unexplained') throw new Error(unexplainedMessage(then, tag));
        }

        const now = await againstExample(`${tag}/${e.example}`, tag, e, opened, !!e.results);
        if (now.verdict) record(`${e.example} vs ${now.reference}`, now.verdict);
        if (now.failure) throw new Error(now.failure);
      }, 300_000);
    }

    const s = m.session;
    const tabs = s.tabs ?? [];
    if (s.file) {
      it(`session (envelope ${s.envelopeVersion}): every tab restores to its example and gives its results`, async () => {
        const opened = await openSession(readCorpusText(`${tag}/${s.file}`));
        expect(opened.loaded).toEqual({ type: 'session', count: tabs.length });
        expect(opened.tabs).toHaveLength(tabs.length);
        for (const [i, tab] of opened.tabs.entries()) {
          expect(tab.analysisMode, `tab ${i + 1}'s workspace`).toBe(tabs[i].workspace);
          const entry = m.examples.find((x) => x.example === tabs[i].id)!;
          const v = judge(`${tag}/session tab ${i + 1} (${entry.example})`, readResults(`${tag}/${entry.results}`), tab.values, tab.changes);
          record(`session tab ${i + 1}`, v);
          if (v.kind === 'unexplained') throw new Error(unexplainedMessage(v, tag));
        }
        for (const [i, tab] of opened.tabs.entries()) {
          const entry = m.examples.find((x) => x.example === tabs[i].id)!;
          const now = await againstExample(`${tag}/session tab ${i + 1} (${entry.example})`, tag, { ...entry, workspace: tabs[i].workspace }, tab, true);
          if (now.verdict) record(`session tab ${i + 1} vs ${now.reference}`, now.verdict);
          if (now.failure) throw new Error(now.failure);
        }
      }, 120_000);
    } else {
      it(`session: none, ${tag} could not write one`, () => {
        expect(SESSION_WRITER_BROKEN, `${tag} is not a release whose session writer is known to fail`).toContain(tag);
        expect(s.unavailable, 'the manifest says why').toMatch(/\$state is not defined/);
      });
    }
  });
}
