import type { Translations } from '../../types';

const messages: Translations = {
  "seisDes.issue.reinforcementUnassessed": "Das primäre Bauteil kann ohne Querschnitt und Bewehrung nicht geprüft werden. Prüfen Sie die Erdbebendetails.",
  "seisDes.issue.confinementUnassessed": "Umschnürung ungeprüft. Prüfen Sie die erfassten Normalkräfte und die Bügelanordnung vor der Bewehrungsplanung der Stütze.",
  "detailing.cutoff.unverified": "Träger {element}, x = {x} m. Der örtliche Querkraftwiderstand und die Bewehrung weisen das Stabende hier nicht nach.",
  "detailing.schedule.spliceNote": "Position {mark} ({length} m) ist länger als der Handelsstab von {stock} m und braucht einen Stoß.",
  'project.adoptedReinforcementIgnored': "Diese Version ignoriert die im Projekt gespeicherte übernommene Bewehrung und verwendet die bemessene Bewehrung.",
  'wall.boundaryBarCount': "Geben Sie für jedes Wandende eine ganze Anzahl Randstäbe ab null ein.",
  'wall.tensionAtOpenings': "Für Zug an Wandöffnungen werden der Nettoquerschnitt und die durchlaufende Bewehrung benötigt.",
  'wall.tensionRequiresBarLayout': "Für Zug mit Biegung ist die Lage der vertikalen Stäbe erforderlich.",
  'wall.tensionShearEdition': "Der Wandnachweis für Zug mit Querkraft ist für die Ausgabe {edition} nicht verfügbar.",
};

export default messages;
