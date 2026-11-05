import type { PostBody } from '../../types';

const body: PostBody = {
  title: 'Apprendre le calcul des structures pas à pas dans Stabileo Basic',
  excerpt:
    'Basic contient désormais un cours : vous choisissez une méthode et l’application résout votre structure, ou un exemple, pas à pas comme sur le papier. Statique, lignes d’influence, second ordre, calcul plastique et dynamique. Gratuit.',
  blocks: [
    { k: 'p', t: 'Un logiciel de calcul donne les résultats d’un coup. Pour apprendre, il faut l’inverse : voir d’où vient chaque nombre, dans l’ordre où on le fait au tableau. C’est « Pas à pas expliqué », le cours qui vit maintenant dans Stabileo Basic. Vous choisissez une méthode, l’application l’applique à votre structure et la déroule pas à pas, avec les équations, les figures et les nombres de ce modèle, puis compare le résultat à la méthode matricielle.' },
    { k: 'p', t: 'Le cours a été écrit par Bautista Chesta, ingénieur civil (FIUBA), et arrive en six unités : la base commune, la statique et les méthodes classiques, les lignes d’influence, le second ordre et le flambement, le calcul plastique et la dynamique. Il est gratuit, comme tout Basic : il s’ouvre dans le navigateur, sans rien installer ni créer de compte, et les textes existent en espagnol, anglais, portugais, allemand, français et turc.' },

    { k: 'h', t: 'Comment l’ouvrir' },
    {
      k: 'ol',
      items: [
        'Allez sur stabileo.com/app/basic.',
        'Appuyez sur Avancé. Sur un téléphone, il se trouve dans le ruban du bas.',
        'Sous « Explorer et apprendre », appuyez sur Pas à pas expliqué. Le catalogue des méthodes s’ouvre, regroupées par thème.',
        'Chaque méthode indique ce que doit être la structure pour l’essayer et si votre modèle le respecte ; le ? explique ce qu’elle fait. « Ouvrir un exemple » charge un modèle qui convient et ouvre la méthode ; « Ouvrir » l’applique au modèle à l’écran.',
        'Suivant et Précédent parcourent les étapes, et les onglets numérotés sautent à l’une d’elles. Méthodes revient au catalogue.',
      ],
    },
    { k: 'img', base: 'blog/course-catalog', w: 1600, h: 1000, alt: 'Stabileo Basic avec le catalogue « Pas à pas expliqué » ouvert dans le panneau latéral : les méthodes sous méthode des rigidités, méthode des flexibilités et poutres continues, chacune avec ce que doit être la structure et les boutons Ouvrir et Ouvrir un exemple.', caption: 'Le catalogue : chaque méthode dit ce dont le modèle a besoin et propose un exemple qui convient.' },
    { k: 'note', t: 'Les méthodes expliquées travaillent sur des modèles plans. Dans l’espace de travail 3D, seuls les deux assistants s’ouvrent, rigidités et flexibilités ; « Ouvrir un exemple » sur toute autre méthode repasse d’abord en plan.' },

    { k: 'h', t: 'Statique, méthode des forces et méthode des déplacements' },
    { k: 'p', t: 'C’est l’unité la plus grande : poutres continues avec l’équation des trois moments et la méthode de Cross, portiques avec la méthode des rotations, Cross à nœuds fixes et déplaçables et la méthode des déplacements, treillis par les nœuds, par les coupes (Ritter) et avec la matrice de compatibilité, et déformations par double intégration, aires des moments, travaux virtuels et Castigliano. Le degré d’hyperstaticité se compte partout de la même façon (GH = 3·m + r − 3·n − c pour un portique plan, GH = m + r − 2·n pour un treillis), avec les articulations internes écrites et séparé en partie externe et interne.' },
    { k: 'p', t: 'Dans la méthode des forces, c’est vous qui choisissez la structure isostatique de référence : vous libérez des appuis ou des extrémités de barre jusqu’à avoir autant d’inconnues que le degré, et si votre choix laisse un mécanisme, l’application explique pourquoi au lieu de résoudre. Elle parcourt ensuite les neuf étapes, avec ou sans rigidité axiale, barres et ressorts écrits terme à terme. Les travaux virtuels calculent déplacements, rotations et mouvements relatifs, aussi avec ressorts, tassements et température. Pour l’essayer : Exemples → Portique simple, Avancé → Pas à pas expliqué → Méthode des forces → Ouvrir.' },
    { k: 'img', base: 'blog/course-force-method', w: 1600, h: 1000, alt: 'L’assistant de la méthode des forces sur l’exemple Portique simple, à l’étape de la structure de référence : les trois réactions de l’appui de droite sont libérées et l’application affiche les trois inconnues hyperstatiques choisies.', caption: 'Méthode des forces : vous choisissez la structure de référence, et l’application vous dit si le choix convient.' },

    { k: 'h', t: 'Lignes d’influence' },
    { k: 'p', t: 'Exemples → Poutre continue, puis Avancé → Ligne d’influence, et touchez une section de la poutre. Il y a des lignes de réactions, de moment, d’effort tranchant, d’effort normal, de déplacements et de rotations, en toute section, extrémités de barre comprises, et la section peut être déplacée ensuite. Le panneau charge la ligne avec la charge permanente g, la charge d’exploitation q et une charge ponctuelle P pour ses extrêmes, trace l’enveloppe le long de la barre et ouvre l’explication pas à pas avec les figures de Müller-Breslau. « Cas de charge et enveloppes » cherche les effets les plus grands et les plus petits. La ligne de moment est positive là où elle tend la fibre inférieure, comme le diagramme statique.' },
    { k: 'img', base: 'blog/course-influence', w: 1600, h: 1000, alt: 'L’exemple Poutre continue avec l’enveloppe des moments obtenue en chargeant les lignes d’influence, en rouge le maximum et en bleu le minimum, et le panneau qui charge la ligne du moment à 2 m de l’appui gauche avec g = 10 et q = 5 kN/m : maximum 20,00 kN·m et minimum 10,00 kN·m, chacun confirmé par un calcul direct.', caption: 'La ligne d’influence de moment chargée pour ses extrêmes, et l’enveloppe le long de la poutre.' },

    { k: 'h', t: 'Second ordre et flambement' },
    { k: 'p', t: 'Avec un portique chargé, Avancé → P-Δ (2nd ordre) ou Pcr (Euler). Dans « Mode de calcul », vous choisissez la méthode, avec les fonctions de stabilité φ, la matrice géométrique ou la matrice de corde (P/L), et le nombre d’éléments par barre. P-Δ montre ses itérations, et B₂ = 1/(1 − 1/λ₁) provient du flambement du même modèle avec la même discrétisation, à côté de la plus grande amplification des déplacements. Le flambement utilise quatre éléments par barre par défaut et, quand la discrétisation ne peut pas représenter le facteur, il le refuse au lieu de l’annoncer. Dans le catalogue, le groupe « Second ordre et flambement » propose un portique préparé pour les quatre méthodes.' },

    { k: 'h', t: 'Calcul plastique' },
    { k: 'p', t: 'Exemples → Portique simple, puis Avancé → Ruine plastique. L’application montre chaque pas de charge, la courbe λ–déplacement, les rotations plastiques et le mécanisme tracé sur le modèle, vérifié par les travaux virtuels. Vous pouvez aussi choisir un mécanisme : touchez l’emplacement des rotules et l’application calcule son λ et dit s’il est admissible. Les méthodes statique et cinématique sont dans le catalogue comme documents expliqués. Quand le calcul pas à pas ne peut pas résoudre la ruine, il le dit, au lieu de donner un facteur.' },
    {
      k: 'table',
      caption: 'L’exemple Portique simple : la ruine calculée par l’application et un mécanisme de panneau choisi à la main.',
      head: ['Mécanisme', 'λ'],
      rows: [
        ['Celui que trouve le calcul pas à pas', '71,30'],
        ['Panneau choisi à la main, avec des rotules en tête et en pied des deux poteaux', '168,75'],
      ],
    },
    { k: 'p', t: 'Le mécanisme choisi à la main donne un facteur plus élevé, et l’application explique pourquoi ce n’est pas la ruine : avec ce mécanisme, le moment dépasse Mp dans une section, donc son λ n’est qu’une borne supérieure, et en mettant les moments à l’échelle on obtient aussi une borne inférieure. C’est le théorème cinématique, à l’écran et avec les nombres du modèle.' },
    { k: 'img', base: 'blog/course-plastic', w: 1600, h: 1000, alt: 'L’exemple Portique simple avec le mécanisme de ruine tracé, quatre rotules avec leurs rotations, et le panneau Ruine plastique avec la courbe λ–déplacement et le travail virtuel du mécanisme, qui donne λ = 71,296.', caption: 'Ruine plastique du portique simple : la courbe λ–déplacement et le mécanisme.' },

    { k: 'h', t: 'Dynamique' },
    { k: 'p', t: 'Avancé → Dynamique ouvre le panneau de dynamique. Un système à un degré de liberté est tiré du modèle, avec sa réponse libre et sa réponse forcée sous une charge harmonique ; un système à plusieurs degrés est résolu par superposition modale, bâtiment à cisaillement compris. Les modèles de masse, concentrée ou cohérente et avec condensation, sont comparés aux fréquences du moteur, et l’on peut placer des masses ponctuelles aux nœuds, avec leur inertie de rotation, que l’analyse modale utilise aussi. Dans le groupe « Dynamique des structures » du catalogue, « Ouvrir un exemple » charge un poteau avec une masse en tête, un portique à cisaillement de deux étages ou, pour la masse répartie, une console.' },
    { k: 'img', base: 'blog/course-dynamics', w: 1600, h: 1000, alt: 'Un poteau en console avec une masse en tête et le panneau de dynamique ouvert sur le système à un degré de liberté tiré du modèle : k = 2250 kN/m, m = 5 t, ω = 21,21 rad/s, la vibration libre amortie et la réponse à une force harmonique avec son facteur β.', caption: 'Un degré de liberté : le poteau avec une masse en tête sous une force harmonique.' },

    { k: 'h', t: 'Tout ce que contient le catalogue' },
    {
      k: 'table',
      caption: 'Les méthodes de « Pas à pas expliqué », par groupe, dans l’ordre du catalogue.',
      head: ['Groupe', 'Méthodes'],
      rows: [
        ['Méthode des rigidités', 'Matricielle, en assistant'],
        ['Méthode des flexibilités', 'Méthode des forces, en assistant'],
        ['Poutres continues', 'Trois moments (Clapeyron) ; Cross'],
        ['Portiques', 'Inconnues cinématiques ; Cross à nœuds fixes et déplaçables ; méthode des rotations'],
        ['Treillis', 'Nœuds ; coupes (Ritter) ; matrice de compatibilité'],
        ['Déformations et énergie', 'Double intégration ; aires des moments ; travaux virtuels ; Castigliano ; efforts internes par coupures'],
        ['Lignes d’influence', 'Ligne d’influence'],
        ['Second ordre et flambement', 'Second ordre avec fonctions φ et avec matrice géométrique ; flambement par comptage des modes et par valeurs propres'],
        ['Calcul plastique', 'Méthode cinématique ; méthode statique'],
        ['Dynamique des structures', 'Un degré de liberté ; plusieurs degrés par décomposition modale ; masse répartie'],
      ],
    },
    { k: 'p', t: 'Si vous enseignez les structures, vous pouvez l’utiliser en cours tel quel : un modèle se partage par lien et chaque étudiant l’ouvre dans son navigateur, dans sa langue. Si une étape n’est pas claire ou si un nombre ne correspond pas à votre calcul à la main, écrivez-nous : c’est exactement ce que nous avons besoin de savoir.' },
    { k: 'link', slug: 'conceptual-side-advanced-tools', t: 'Un autre outil pensé pour la salle de cours, l’analyse cinématique qui explique pourquoi une structure est un mécanisme :' },
  ],
};

export default body;
