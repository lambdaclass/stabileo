import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const cases = [
  { file: 'CHANGELOG.md', allMembers: /Re-check all CIRSOC 301 members/, shorter: /declared Lb shorter than the member/, doubleCurvature: /channels and tees in double curvature/, omitted: /contribute no geometric stiffness/, refusal: /refused if.*could lower the critical factor by more than 1 %/ },
  { file: 'docs/releases/v0.6.0.md', allMembers: /Re-check all CIRSOC 301 members/, shorter: /declared Lb shorter than the member/, doubleCurvature: /channels and tees in double curvature/, omitted: /contribute no geometric stiffness/, refusal: /refused if.*could lower the critical factor by more than 1 %/ },
  { file: 'docs/releases/v0.6.0.es.md', allMembers: /Revisá todos los miembros CIRSOC 301/, shorter: /Lb declarado menor que la longitud del miembro/, doubleCurvature: /canales y tees en doble curvatura/, omitted: /no aportan rigidez geométrica/, refusal: /se rechaza si.*puede reducir el factor crítico en más del 1 %/ },
  { file: 'docs/releases/v0.6.0.pt.md', allMembers: /Revise todos os membros CIRSOC 301/, shorter: /Lb declarado menor que o comprimento do membro/, doubleCurvature: /perfis U e T em dupla curvatura/, omitted: /não contribuem para a rigidez geométrica/, refusal: /é recusada se.*puder reduzir o fator crítico em mais de 1 %/ },
  { file: 'docs/releases/v0.6.0.de.md', allMembers: /Prüfen Sie alle CIRSOC-301-Stäbe/, shorter: /angegebenen Lb unterhalb der Stablänge/, doubleCurvature: /U- und T-Profile bei doppelter Krümmung/, omitted: /tragen keine geometrische Steifigkeit bei/, refusal: /wird abgelehnt, wenn.*den kritischen Faktor um mehr als 1 % senken könnte/ },
  { file: 'docs/releases/v0.6.0.fr.md', allMembers: /Revérifiez tous les éléments CIRSOC 301/, shorter: /Lb déclaré inférieur à la longueur de l’élément/, doubleCurvature: /profilés U et T en double courbure/, omitted: /ne contribuent pas à la rigidité géométrique/, refusal: /est refusée si.*peut abaisser le facteur critique de plus de 1 %/ },
  { file: 'docs/releases/v0.6.0.tr.md', allMembers: /Tüm CIRSOC 301 elemanlarını/, shorter: /tanımlanan Lb eleman boyundan kısaysa/, doubleCurvature: /çift eğrilikli U ve T kesitler/, omitted: /geometrik rijitliğe katkı yapmaz/, refusal: /kritik katsayıyı %1’den fazla düşürebilecekse analiz reddedilir/ },
];

function disclosure(file: string, kind: 'cb' | 'buckling'): string {
  const text = readFileSync(new URL(`../../../../../${file}`, import.meta.url), 'utf8');
  if (file === 'CHANGELOG.md') {
    const release = text.split(/^## /m).find((section) => section.startsWith('0.6.0 ('));
    expect(release).toBeDefined();
    const heading = kind === 'cb'
      ? 'Cb reads the moment at both ends of the unbraced segment'
      : 'Buckling factors use the original stiffness pencil';
    const section = release!.split(/^#### /m).find((section) => section.startsWith(heading));
    expect(section).toBeDefined();
    return section!;
  }
  const anchor = kind === 'cb' ? 'SA-2026-048](' : '2026-11-buckling-round-off-member-kg.md)';
  const row = text.split('\n').find((line) => line.startsWith('|') && line.includes(anchor));
  expect(row).toBeDefined();
  return row!;
}

it.each(cases)('known wrong result: #2086 $file rechecks every affected CIRSOC member', ({ file, allMembers, shorter, doubleCurvature }) => {
  const text = disclosure(file, 'cb');
  expect(text).toMatch(allMembers);
  expect(text).toMatch(shorter);
  expect(text).toContain('Mmax');
  expect(text).toMatch(doubleCurvature);
});

it.each(cases)('known wrong result: #2086 $file distinguishes omitted round-off from the critical-factor refusal', ({ file, omitted, refusal }) => {
  const text = disclosure(file, 'buckling');
  expect(text).toMatch(omitted);
  expect(text).toMatch(refusal);
});
