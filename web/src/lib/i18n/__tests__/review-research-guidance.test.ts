import { expect, it } from 'vitest';
import { STRINGS } from '../../../components/research/i18n';
import { translations as feher } from '../../../components/research/feher2026/strings';
import { it as arch } from '../../../components/research/heyman1966/strings-it';
import { articleStrings } from '../../../components/research/riksCrisfield/article';
import { comparisonFailureLabel } from '../../../components/research/shauer2025/failure-labels';
import { publicI18n, setLocale } from '../store.svelte';

it.each([
  ["interactive", feher.nl.interactive, "na het bevestigen"],
  ["Fehér refinement", feher.nl.why.items.find(item => item.title === 'Twee numerieke modellen van dezelfde strip')?.body, "EA blijft eindig"],
  ["method", arch.method, "λmax × P in kN"],
  ["onlyEnglish", STRINGS.it.onlyEnglish, "solo in inglese"],
  ["researchLanguages", STRINGS.it.researchLanguages, "variano secondo il benchmark"],
  ["researchLanguages", STRINGS.it.researchLanguages, "Se manca una traduzione"],
  ["hybridModel", STRINGS.it.hybridModel, "il massimo tra zero, il valore precedente e l’energia motrice corrente, anche durante lo scarico"],
  ["springsOrderedComparison", STRINGS.it.springsOrderedComparison, "moltiplicato per l’area"],
  ["meshLimitation", STRINGS.nl.meshLimitation, "hoogte groter dan twee karakteristieke lengtes"],
  ["accuracy", articleStrings('nl').accuracy, "|Δλ| ≤ Δs / ‖f_ref‖"],
] as const)('known wrong result: #2613 — %s includes %s', (_name, actual, expected) => {
  expect(actual).toContain(expected);
});

it('known wrong result: #2613 — an invalid Shauer step identifies invalid results in Italian', () => {
  const original = publicI18n.locale;
  try {
    setLocale('it');
    expect(comparisonFailureLabel('nonfinite-step')).toBe('Risultati del passo non validi');
  } finally {
    setLocale(original);
  }
});
