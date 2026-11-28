import type { Translations } from '../../types';

const messages: Translations = {
  "seisDes.issue.confinementUnassessed": "Confinamiento sin verificar. Compruebe los esfuerzos axiales registrados y la disposición de las ataduras antes de detallar la columna.",
  "detailing.cutoff.unverified": "Viga {element}, x = {x} m. La resistencia local al corte y la armadura no justifican terminar la barra aquí.",
  "detailing.schedule.spliceNote": "La marca {mark} ({length} m) excede la barra comercial de {stock} m y requiere empalme.",
  'project.adoptedReinforcementIgnored': "Esta versión ignora la armadura adoptada guardada en el proyecto y usa la armadura de diseño.",
  'wall.boundaryBarCount': "Ingresá una cantidad entera de barras de borde, mayor o igual que cero, en cada extremo del tabique.",
  'wall.tensionAtOpenings': "La tracción en un tabique con aberturas requiere la sección neta y la armadura continua que la atraviesa.",
  'wall.tensionRequiresBarLayout': "La tracción combinada con flexión requiere la disposición de las barras verticales.",
  'wall.tensionShearEdition': "No se puede verificar el tabique a tracción y corte combinados para la edición {edition}.",
};

export default messages;
