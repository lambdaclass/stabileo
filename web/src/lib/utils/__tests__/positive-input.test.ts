/**
 * A number field bound with bind:value hands over a number (or null when empty), not a string.
 */
import { describe, it, expect } from 'vitest';
import { positiveInput } from '../positive-input';

describe('positiveInput', () => {
  it('takes what a number input binds, and what a text one does', () => {
    expect(positiveInput(0.8)).toBe(0.8);
    expect(positiveInput(null)).toBeUndefined();
    expect(positiveInput('')).toBeUndefined();
    expect(positiveInput('1,5')).toBe(1.5);
    expect(positiveInput(0)).toBeUndefined();
    expect(positiveInput(-2)).toBeUndefined();
    expect(positiveInput(Infinity)).toBeUndefined();
  });
});
