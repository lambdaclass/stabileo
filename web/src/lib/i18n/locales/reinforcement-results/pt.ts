import type { Translations } from '../../types';

const messages: Translations = {
  "seisDes.issue.reinforcementUnassessed": "Não é possível verificar o elemento primário sem sua seção e armadura. Revise o detalhamento sísmico.",
  "seisDes.issue.confinementUnassessed": "Confinamento não verificado. Verifique os esforços axiais registrados e a disposição dos estribos antes de detalhar o pilar.",
  "detailing.cutoff.unverified": "Viga {element}, x = {x} m. A resistência local ao cisalhamento e a armadura não justificam terminar a barra aqui.",
  "detailing.schedule.spliceNote": "A marca {mark} ({length} m) excede a barra comercial de {stock} m e requer emenda.",
  'project.adoptedReinforcementIgnored': "Esta versão ignora a armadura adotada salva no projeto e usa a armadura de dimensionamento.",
  'wall.boundaryBarCount': "Informe um número inteiro de barras de extremidade, maior ou igual a zero, em cada ponta da parede.",
  'wall.tensionAtOpenings': "A tração em paredes com aberturas exige a seção líquida e a armadura contínua que a atravessa.",
  'wall.tensionRequiresBarLayout': "A tração combinada com flexão exige a disposição das barras verticais.",
  'wall.tensionShearEdition': "Não é possível verificar a parede sob tração e cisalhamento combinados na edição {edition}.",
};

export default messages;
