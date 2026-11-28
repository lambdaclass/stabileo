import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it.each([
  ["0.4.0.nl", "| [SA-2026-021]", "controleer de richting langs de nok én de dwarsrichting"],
  ["0.4.0.nl", "| [SA-2026-022]", "controleer of zowel 0,9 D + 1,6 H als 1,2 D + 1,6 H"],
  ["0.6.0.it", "2026-11-staged-cable-refusal-and-contact-tolerance.md", "divisa per la rigidezza di contatto"],
  ["0.6.0.it", "| [SA-2026-056]", "delle aste e le reazioni degli appoggi"],
  ["0.6.0.it", "- **SA-2026-056", "delle aste e le reazioni degli appoggi"],
  ["0.6.1.it", "- **[SA-2026-056]", "delle aste e le reazioni degli appoggi"],
  ["0.6.2.it", "- **[SA-2026-056]", "delle aste e le reazioni degli appoggi"],
  ["0.6.3.it", "- **[SA-2026-056]", "delle aste e le reazioni degli appoggi"],
  ["0.6.4.it", "- **[SA-2026-056]", "delle aste e le reazioni degli appoggi"],
  ["0.6.2.nl", "#compensated-force", "eindpunten en geïnterpoleerde intensiteiten"],
  ["0.6.2.nl", "roller-z-fixed.md#coverage", "krachtsverdeling van de gecorrigeerde opleggingen"],
  ["0.6.2.nl", "Rapporten en downloads", "tijdens het opvragen"],
  ["0.6.3.it", "fixture-replay-and-framed-import", "sistema di assi dichiarato"],
  ["0.6.3.it", "- Restano aperte", "reazioni nei gradi di libertà impediti"],
  ["0.6.4.it", "- Restano aperte", "reazioni nei gradi di libertà impediti"],
  ["0.6.3.nl", "- **[SA-2026-056]", "met kinematische randvoorwaarden"],
  ["0.6.4.nl", "- **[SA-2026-056]", "met kinematische randvoorwaarden"],
  ["0.6.3.it", "| [SA-2026-092]", "indicatori di verifica soddisfatta"],
  ["0.6.3.it", "section-stress-cut-magnitudes", "tensione tangenziale con il suo segno"],
  ["0.6.4.it", "| [SA-2026-129]", "ricostruisci gli inviluppi dalle nuove scansioni"],
  ["0.6.4.it", "| [SA-2026-125]", "un grado di libertà impedito condiviso"],
  ["0.6.3.it", "| [SA-2026-106]", "angolo specificato"],
  ["0.6.4.it", "| [SA-2026-106]", "angolo previsto"],
  ["0.6.4.it", "- La ridiscretizzazione segue", "angolo ambiguo"],
] as const)('known wrong result: #2613 — release %s at %s states %s', (edition, anchor, expected) => {
  const release = readFileSync(new URL('../../../../../docs/releases/v' + edition + '.md', import.meta.url), 'utf8');
  const rows = release.split('\n').filter(line => line.includes(anchor));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain(expected);
});
