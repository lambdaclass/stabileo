import type { Translations } from '../../types';

const messages: Translations = {
  "detailing.cutoff.unverified": "Poutre {element}, x = {x} m. La résistance locale au cisaillement et les armatures ne justifient pas un arrêt de barre ici.",
  "detailing.schedule.spliceNote": "La position {mark} ({length} m) dépasse la barre commerciale de {stock} m et demande un recouvrement.",
  'project.adoptedReinforcementIgnored': "Cette version ignore les armatures adoptées enregistrées dans le projet et utilise les armatures de dimensionnement.",
  'wall.boundaryBarCount': "Saisissez un nombre entier positif ou nul de barres de rive à chaque extrémité du voile.",
  'wall.tensionAtOpenings': "La traction au droit des ouvertures exige la section nette et les armatures continues qui la traversent.",
  'wall.tensionRequiresBarLayout': "La traction combinée à la flexion exige la disposition des barres verticales.",
  'wall.tensionShearEdition': "La vérification du voile en traction et cisaillement combinés est indisponible pour l’édition {edition}.",
};

export default messages;
