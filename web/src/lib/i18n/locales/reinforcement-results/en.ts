import type { Translations } from '../../types';

const messages: Translations = {
  "seisDes.issue.reinforcementUnassessed": "The primary member cannot be checked without its section and reinforcement. Review the seismic detailing.",
  "seisDes.issue.confinementUnassessed": "Confinement unverified. Check the recorded axial forces and tie layout before detailing this column.",
  "detailing.cutoff.unverified": "Beam {element}, x = {x} m. The local shear resistance and reinforcement do not establish that the bar may end here.",
  "detailing.schedule.spliceNote": "Mark {mark} ({length} m) is longer than the {stock} m stock bar and needs a splice.",
  'project.adoptedReinforcementIgnored': "This build ignores the adopted reinforcement saved in the project and uses the designed reinforcement.",
  'wall.boundaryBarCount': "Enter a whole number of boundary bars, zero or more, at each end of the wall.",
  'wall.tensionAtOpenings': "Wall tension at openings requires a net section and the continuous reinforcement through that section.",
  'wall.tensionRequiresBarLayout': "Combined tension and bending require the vertical bar layout.",
  'wall.tensionShearEdition': "Wall design cannot verify combined tension and shear for edition {edition}.",
};

export default messages;
