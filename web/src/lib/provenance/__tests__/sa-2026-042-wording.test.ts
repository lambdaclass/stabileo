import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESULT_CHANGES } from '../full-registry';

const entry = RESULT_CHANGES.changes.find((c) => c.id === 'buckling-2d-varying-axial-force')!;
const engineTest = readFileSync(resolve(__dirname, '../../../../../engine/tests/buckling_span_axial_2d.rs'), 'utf8');

const caseWords: Record<string, string[]> = {
  en: ['thrust at its tip', 'opposite axial point load at mid-span', 'half toward the tip is compressed'],
  es: ['empuje en la punta', 'carga axial puntual igual y opuesta en el centro', 'mitad hacia la punta queda comprimida'],
  pt: ['empuxo na ponta', 'carga axial pontual igual e oposta no meio', 'metade junto à ponta fica comprimida'],
  de: ['Druckkraft an der Spitze', 'entgegengesetzten axialen Einzellast in Feldmitte', 'Hälfte zur Spitze hin gedrückt'],
  fr: ['poussée à la pointe', 'charge axiale ponctuelle égale et opposée à mi-portée', 'moitié côté pointe est comprimée'],
  tr: ['uçta bir itme', 'eşit ve zıt yönde eksenel tekil yük', 'uca doğru olan yarısı basınç altında'],
};

describe('SA-2026-042 re-check notice', () => {
  it('describes the +68 % case as the engine test builds it: a tip thrust and an opposite point load at mid-span', () => {
    expect(engineTest).toMatch(/fn step\(n: usize\)[\s\S]*?point_axial\(id, mid - x0, P\)[\s\S]*?\}, -P\)/);
    for (const [locale, words] of Object.entries(caseWords)) {
      const text = (entry.explanation as Record<string, string>)[locale];
      for (const w of words) expect(text, locale).toContain(w);
      expect(text, locale).toMatch(/68/);
    }
  });
});
