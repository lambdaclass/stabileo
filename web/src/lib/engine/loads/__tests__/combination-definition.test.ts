/** The one-line definition the combinations list shows, read from the factors. */
import { describe, it, expect } from 'vitest';
import { combinationDefinition } from '../combination-definition';

const cases = [
  { id: 1, type: 'D', name: 'Peso propio' },
  { id: 2, type: 'D', name: 'Cargas muertas' },
  { id: 3, type: 'L', name: 'Sobrecarga' },
  { id: 4, type: 'W', name: 'Viento +X' },
  { id: 5, type: 'W', name: 'Viento +Y' },
  { id: 6, type: '', name: 'Asentamiento' },
];

describe('combinationDefinition', () => {
  it('writes the cases of a symbol at one factor as the symbol', () => {
    expect(combinationDefinition([{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.2 }, { caseId: 3, factor: 1.6 }], cases))
      .toBe('1.2 D + 1.6 L');
  });

  it('names a case that enters without the rest of its symbol', () => {
    expect(combinationDefinition([
      { caseId: 4, factor: -1 }, { caseId: 1, factor: 0.9 }, { caseId: 2, factor: 0.9 },
    ], cases)).toBe('0.9 D − 1.0 W (Viento +X)');
  });

  it('keeps the regulation order, drops zero factors and names an untyped case alone', () => {
    expect(combinationDefinition([
      { caseId: 6, factor: 1 }, { caseId: 3, factor: 0 }, { caseId: 1, factor: 1.4 }, { caseId: 2, factor: 1.4 },
    ], cases)).toBe('1.4 D + 1.0 Asentamiento');
  });

  it('splits a symbol whose cases carry different factors', () => {
    expect(combinationDefinition([{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }], cases))
      .toBe('1.2 D (Peso propio) + 1.0 D (Cargas muertas)');
  });

  it('says so when nothing is left', () => {
    expect(combinationDefinition([{ caseId: 3, factor: 0 }], cases)).toBe('—');
  });
});
