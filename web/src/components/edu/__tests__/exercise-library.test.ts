/**
 * Where a teacher's own exercises live between sessions.
 *
 * Without persistence, authoring is a demo: close the tab and twenty minutes of
 * work is gone. What is pinned here is that the library survives, that a
 * corrupt entry cannot take the whole list down with it, and that sharing by
 * link round-trips — including the accented Spanish a statement will contain,
 * which is exactly what naive base64 mangles.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadLibrary, saveToLibrary, removeFromLibrary, toShareLink, fromShareLink } from '../exercise-library';
import { getExerciseSpecs } from '../exercise-data';
import type { EduExerciseSpec } from '../exercise-spec';
import { studentSeed, variantOf } from '../exercise-variant';

// The suite runs without a DOM, so storage is stubbed rather than the whole
// environment swapped: what is under test is the library's behaviour, and a
// twenty-line Map stands in for the browser exactly as well as jsdom would.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}
(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();

const KEY = 'stabileo.edu.exercises.v1';
const sample = (over: Partial<EduExerciseSpec> = {}): EduExerciseSpec => ({
  ...getExerciseSpecs()[0],
  ...over,
});

beforeEach(() => localStorage.clear());

describe('the library keeps what a teacher wrote', () => {
  it('saves and restores', () => {
    const ex = sample({ id: 'mine', title: 'Viga de prueba' });
    expect(saveToLibrary(ex).ok).toBe(true);
    const back = loadLibrary();
    expect(back.length).toBe(1);
    expect(back[0].title).toBe('Viga de prueba');
    expect(back[0].model).toEqual(ex.model);
  });

  it('saving the same id twice is an edit, not a duplicate', () => {
    saveToLibrary(sample({ id: 'mine', title: 'Primera' }));
    saveToLibrary(sample({ id: 'mine', title: 'Corregida' }));
    const back = loadLibrary();
    expect(back.length).toBe(1);
    expect(back[0].title).toBe('Corregida');
  });

  it('keeps the newest first, which is the order a teacher expects', () => {
    saveToLibrary(sample({ id: 'a', title: 'A' }));
    saveToLibrary(sample({ id: 'b', title: 'B' }));
    expect(loadLibrary().map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('deletes one without touching the rest', () => {
    saveToLibrary(sample({ id: 'a' }));
    saveToLibrary(sample({ id: 'b' }));
    expect(removeFromLibrary('a').map((e) => e.id)).toEqual(['b']);
  });

  it('a corrupt entry does not take the whole library down', () => {
    // An interrupted save, or an entry from a future version. The rest of the
    // teacher's exercises have to still open.
    const good = sample({ id: 'good' });
    localStorage.setItem(KEY, JSON.stringify([{ id: 'broken' }, good]));
    const back = loadLibrary();
    expect(back.map((e) => e.id)).toEqual(['good']);
  });

  it('unreadable storage yields an empty library rather than throwing', () => {
    localStorage.setItem(KEY, 'not json at all');
    expect(loadLibrary()).toEqual([]);
  });
});

describe('sharing by link', () => {
  it('round-trips an exercise', () => {
    const ex = sample({ id: 'shared', title: 'Pórtico' });
    const link = toShareLink(ex, 'https://stabileo.com/');
    const r = fromShareLink(new URL(link).hash);
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.exercise.title).toBe('Pórtico');
      expect(r.exercise.model).toEqual(ex.model);
    }
  });

  it('survives accented Spanish, which naive base64 mangles', () => {
    // A statement in Spanish will contain these. Getting it wrong turns
    // "Viga empotrada — cálculo de tensión" into mojibake in front of a class.
    const ex = sample({ id: 'acc', title: 'Cálculo de tensión', description: '¿Qué reacción hay en el apoyo?' });
    const r = fromShareLink(new URL(toShareLink(ex, 'https://s.com/')).hash);
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.exercise.title).toBe('Cálculo de tensión');
      expect(r.exercise.description).toBe('¿Qué reacción hay en el apoyo?');
    }
  });

  it('a link with no exercise in it is not an error', () => {
    // The common case by far — every ordinary visit to the app.
    expect(fromShareLink('#some-other-thing')).toBeNull();
    expect(fromShareLink('')).toBeNull();
  });

  it('a damaged exercise link says so, because a student needs to know', () => {
    const r = fromShareLink('#edu-ex=!!!not-base64!!!');
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.error).toMatch(/damaged|incomplete/);
  });
});

describe('a parametric exercise keeps its parameters', () => {
  const parametric = () => getExerciseSpecs().find((s) => s.id === 'frame-varying-supports')!;

  it('through the library, with every student still getting the same variant', () => {
    const ex = { ...parametric(), id: 'mine-param' };
    expect(saveToLibrary(ex).ok).toBe(true);
    const back = loadLibrary()[0]!;
    expect(back.params).toEqual(ex.params);
    expect(back.model).toEqual(ex.model);
    expect(variantOf(back, studentSeed(back.id, '104233'))).toEqual(variantOf(ex, studentSeed(ex.id, '104233')));
  });

  it('through a link', () => {
    const ex = parametric();
    const r = fromShareLink(new URL(toShareLink(ex, 'https://stabileo.com/app/education')).hash);
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.exercise.params).toEqual(ex.params);
  });

  it('a file whose parameters do not resolve is refused with a sentence', () => {
    const ex = { ...parametric(), model: { ...parametric().model, nodes: [[0, 0], ['Lx', 0]] as Array<[string | number, string | number]> } };
    const r = fromShareLink(new URL(toShareLink(ex as never, 'https://stabileo.com/app/education')).hash);
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.error).toMatch(/Lx/);
  });
});
