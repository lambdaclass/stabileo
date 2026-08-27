/**
 * The three states a bar is in, and the flattening that would make them two.
 *
 * The badge is one chip and the facts behind it are two axes. Every test below is about keeping
 * that true: a provisional bar still has its mark, an unmarked bar is not provisional by
 * default, and the two ways of being provisional stay distinguishable.
 */

import { describe, it, expect } from 'vitest';
import {
  rcBarStatus, rcBarStateCounts, type RcBarStatusLike,
} from '../rc-bar-status';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';
import pt from '../../i18n/locales/pt';

const bar = (over: Partial<RcBarStatusLike> = {}): RcBarStatusLike => ({
  id: 'beam-3:long:bottom:0.000', ownerElementIds: [3], ...over,
});

const NONE: ReadonlySet<number> = new Set();

describe('the mark axis', () => {
  it('is marked when coordination gave it a mark', () => {
    const s = rcBarStatus(bar(), () => 'B4', NONE);
    expect(s.markState).toBe('marked');
    expect(s.mark).toBe('B4');
    expect(s.state).toBe('marked');
  });

  it('is unmarked when it has none, and says so rather than inventing one', () => {
    const s = rcBarStatus(bar(), () => undefined, NONE);
    expect(s.markState).toBe('unmarked');
    expect(s.mark).toBeNull();
    expect(s.state).toBe('unmarked');
  });

  /*
   * An ordinary bar is not provisional. Stated because the default matters: `BarPath.provisional`
   * is absent on almost every bar this app produces, and a check that treated absence as
   * uncertainty would paint the whole list violet.
   */
  it('an ordinary bar is certified', () => {
    const s = rcBarStatus(bar(), () => 'B4', NONE);
    expect(s.ownProposal).toBe(false);
    expect(s.throughProposal).toBe(false);
    expect(s.provisionalSource).toBeNull();
    expect(s.reasonKey).toBeNull();
  });
});

describe('the provenance axis, which is not a third value of the mark', () => {
  /*
   * The flattening this module exists to prevent. `assignMarks` groups by geometry and knows
   * nothing about whether the design behind it was certified, so a provisional bar can carry a
   * perfectly good mark — and a bender still fabricates from that mark.
   */
  it('a provisional bar keeps its mark', () => {
    const s = rcBarStatus(bar({ provisional: 'biaxial' }), () => 'B4', NONE);
    expect(s.state).toBe('provisional');
    expect(s.markState).toBe('marked');
    expect(s.mark).toBe('B4');
  });

  it('and an unmarked provisional bar reports both facts', () => {
    const s = rcBarStatus(bar({ provisional: 'biaxial' }), () => undefined, NONE);
    expect(s.state).toBe('provisional');
    expect(s.markState).toBe('unmarked');
  });

  /*
   * The distinction `DetailingAssembly.provisionalMembers` documents. A bar continuous over a
   * support belongs to the beam it was designed for AND to the column it passes through, so a
   * certified column owns a provisional bar without itself being provisional.
   */
  it('a bar through a provisional member is provisional, and says which member', () => {
    const s = rcBarStatus(bar({ ownerElementIds: [9, 3] }), () => 'B4', new Set([3]));
    expect(s.state).toBe('provisional');
    expect(s.ownProposal).toBe(false);
    expect(s.throughProposal).toBe(true);
    expect(s.provisionalSource).toBe('through');
    expect(s.provisionalOwners).toEqual([3]);
  });

  it('names only the owners that are proposals, sorted, not every owner it touches', () => {
    const s = rcBarStatus(bar({ ownerElementIds: [9, 3, 7] }), () => 'B4', new Set([7, 3]));
    expect(s.provisionalOwners).toEqual([3, 7]);
  });

  /* The bar's own marking is the more specific statement, and the member fact stays readable. */
  it('the bar’s own proposal outranks the inherited one, without hiding it', () => {
    const s = rcBarStatus(
      bar({ provisional: 'biaxial', ownerElementIds: [3] }), () => 'B4', new Set([3]));
    expect(s.provisionalSource).toBe('own');
    expect(s.throughProposal).toBe(true);
    expect(s.reasonKey).toBe('detailing.bar.provisional.biaxial');
  });

  /*
   * A generator inventing a second value gets a missing explanation rather than a key that
   * resolves to nothing on screen. Same precedent as `ROLE_KEY` in `rc-bar-label.ts`.
   */
  it('an unnamed kind of proposal is still provisional, with no reason it cannot name', () => {
    const s = rcBarStatus(bar({ provisional: 'torsional' }), () => 'B4', NONE);
    expect(s.state).toBe('provisional');
    expect(s.ownProposal).toBe(true);
    expect(s.reasonKey).toBeNull();
  });
});

describe('every key it names exists in the three locales the panel speaks', () => {
  it('states and reasons resolve in es, en and pt', () => {
    const statuses = [
      rcBarStatus(bar(), () => 'B4', NONE),
      rcBarStatus(bar(), () => undefined, NONE),
      rcBarStatus(bar({ provisional: 'biaxial' }), () => 'B4', NONE),
      rcBarStatus(bar({ ownerElementIds: [3] }), () => 'B4', new Set([3])),
    ];
    const keys = statuses.flatMap((s) => [s.stateKey, s.reasonKey]).filter((k): k is string => !!k);
    expect(keys.length).toBeGreaterThan(4);
    for (const dict of [es, en, pt]) {
      for (const k of keys) expect(dict[k as keyof typeof dict], k).toBeTruthy();
    }
  });

  it('the census keys exist too, with the {n} they are given', () => {
    for (const k of [
      'detailing.bar.census.marked',
      'detailing.bar.census.unmarked',
      'detailing.bar.census.provisional',
    ]) {
      for (const dict of [es, en, pt]) {
        const v = dict[k as keyof typeof dict] as string | undefined;
        expect(v, `${k} in dict`).toBeTruthy();
        expect(v, `${k} takes {n}`).toContain('{n}');
      }
    }
  });
});

describe('the census', () => {
  /*
   * Counted over the BADGE, so the three numbers add up to the number of rows. A summary whose
   * parts overlap is one the reader has to do arithmetic on before they can trust it.
   */
  it('partitions the rows: the three counts sum to the total', () => {
    const statuses = [
      rcBarStatus(bar({ id: 'a' }), () => 'B1', NONE),
      rcBarStatus(bar({ id: 'b' }), () => 'B1', NONE),
      rcBarStatus(bar({ id: 'c' }), () => undefined, NONE),
      rcBarStatus(bar({ id: 'd', provisional: 'biaxial' }), () => 'B2', NONE),
    ];
    const c = rcBarStateCounts(statuses);
    expect(c).toEqual({ marked: 2, unmarked: 1, provisional: 1, total: 4 });
    expect(c.marked + c.unmarked + c.provisional).toBe(c.total);
  });

  it('an empty assembly counts nothing rather than refusing', () => {
    expect(rcBarStateCounts([])).toEqual({ marked: 0, unmarked: 0, provisional: 0, total: 0 });
  });
});
