import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Ce que les logiciels gratuits calculent, et ce qu'ils n'expliquent pas",
  "excerpt": "Il existe des logiciels de structures gratuits, et ils sont bons : ils modélisent, ils calculent, ils affichent les résultats. Ce que nous n'avons pas trouvé, c'est un logiciel qui aborde les outils avancés par leur côté conceptuel.",
  "blocks": [
    {
      "k": "p",
      "t": "Mieux vaut commencer par ce qui existe : il y en a beaucoup, et c'est bon. Quiconque enseigne les structures aujourd'hui dispose d'outils gratuits de premier ordre, et plusieurs font leur travail mieux que nous ne faisons le nôtre."
    },
    {
      "k": "h",
      "t": "Ce que couvrent réellement les outils gratuits"
    },
    {
      "k": "table",
      "caption": "Outils gratuits d'analyse des structures, et ce qu'ils montrent au-delà du résultat.",
      "head": [
        "Outil",
        "Gratuit",
        "Ce qu'il fait très bien",
        "Côté conceptuel"
      ],
      "rows": [
        [
          "Ftool",
          "Oui",
          "Modéliser des portiques plans et lire les diagrammes et les lignes d'influence, avec une aisance que peu égalent",
          "Montre le comportement, pas le raisonnement qui l'explique"
        ],
        [
          "MASTAN2",
          "Oui (sous MATLAB ou son runtime)",
          "Calcul matriciel linéaire et non linéaire, associé au livre de McGuire, Gallagher et Ziemian",
          "La théorie est dans le livre ; le programme exécute l'analyse"
        ],
        [
          "SkyCiv",
          "Offre gratuite",
          "Calculs à la main pas à pas : corps libres, équations d'équilibre avant substitution, méthode de Cross pour les poutres hyperstatiques",
          "Des nombres reportés dans des formules, pour la statique de base"
        ],
        [
          "sectionproperties",
          "Oui, open source",
          "Gauchissement, centre de cisaillement et constante de Saint-Venant par éléments finis",
          "Une bibliothèque Python : elle renvoie des nombres, sans interface ni explication"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Dans cette liste, SkyCiv est ce qui se rapproche le plus de ce qu'on appelle d'habitude « montrer le détail du calcul », et il faut le dire clairement : ses calculs à la main sont bons. Il dessine le corps libre, écrit ΣM = 0 avant d'introduire le moindre nombre et résout par la méthode de Cross quand la poutre est hyperstatique. Quiconque affirme qu'aucun programme gratuit ne montre ses étapes peut être contredit avec SkyCiv en une minute environ."
    },
    {
      "k": "h",
      "t": "Montrer les étapes ne suffit pas si le programme ne vous dit pas quand la formule cesse de s'appliquer"
    },
    {
      "k": "p",
      "t": "Remplacer les lettres d'une formule correcte par des nombres et expliquer pourquoi cette formule est la bonne sont deux choses différentes. La première vous épargne l'arithmétique. La seconde vous épargne l'erreur que l'arithmétique ne peut pas détecter, parce que cette erreur se situe un niveau au-dessus."
    },
    {
      "k": "p",
      "t": "Les calculateurs de torsion que l'on trouve en ligne illustrent ce point à l'envers : vous choisissez le type de section (pleine, tube fermé, rectangle) et le programme applique la formule correspondante. Aucun de ceux que nous avons vus ne vous dit que vous vous êtes trompé de choix, ce qu'aurait donné l'autre théorie, ni de quel côté de l'erreur vous vous trouvez."
    },
    {
      "k": "quote",
      "t": "Un programme qui ne fait que calculer ne vous avertira jamais que vous calculez la mauvaise chose."
    },
    {
      "k": "h",
      "t": "Trois fonctions sans équivalent trouvé"
    },
    {
      "k": "ul",
      "items": [
        "L'analyse cinématique, expliquée. Nous avons cherché et n'avons trouvé aucun outil gratuit qui le fasse : on tombe sur des supports de cours en PDF. Le « logiciel pédagogique d'analyse cinématique » que nous avons trouvé porte sur les mécanismes de machines (systèmes articulés et manivelles), pas sur la classification des structures.",
        "Le ferraillage. La seule option gratuite que nous avons trouvée est AutoRebar, et c'est un complément d'AutoCAD : utiliser la partie gratuite exige donc une licence coûteuse. Il travaille en outre à partir de votre dessin : vous placez les barres, il établit la nomenclature. Tout le reste est un essai de sept jours ou un logiciel commercial. Nous n'avons trouvé aucune option open source.",
        "L'analyse de section, détaillée. Il existe ici une option gratuite sérieuse, sectionproperties, et sur le gauchissement par éléments finis elle fait probablement mieux que nous. Mais c'est une bibliothèque sans interface : elle vous donne le centre de cisaillement sans expliquer pourquoi il se trouve là où il est."
      ]
    },
    {
      "k": "p",
      "t": "Parmi les outils que nous avons examinés, aucun ne couvre deux des trois, et nous n'en avons trouvé aucun qui aborde ne serait-ce que l'une d'elles par le côté conceptuel. C'est le manque que nous voyons, et il est plus étroit et plus précis que « nous sommes les seuls à enseigner »."
    },
    {
      "k": "h",
      "t": "Un écran où toute la différence apparaît"
    },
    {
      "k": "p",
      "t": "Voici une poutre à deux travées sur trois appuis. Les trois ne bloquent que le déplacement vertical. C'est le cas d'école, et aussi celui que j'ai le plus souvent vu accepté comme correct dans un examen."
    },
    {
      "k": "p",
      "t": "La formule du degré d'hyperstaticité donne g = 3·m + r − 3·n = 3×2 + 3 − 3×3 = 0. Zéro signifie isostatique, et tout programme qui s'arrête à la formule annoncera exactement cela. Mais rien ne retient la poutre horizontalement : c'est un mécanisme, et elle ne peut pas être calculée."
    },
    {
      "k": "table",
      "caption": "Ce que l'analyse cinématique renvoie pour cette poutre, étape par étape.",
      "head": [
        "Étape",
        "Ce qu'elle examine",
        "Résultat"
      ],
      "rows": [
        [
          "2 · Degré d'hyperstaticité",
          "g = 3·m + r − 3·n",
          "0"
        ],
        [
          "3 · Matrice de rigidité",
          "Modes de mécanisme détectés",
          "1"
        ],
        [
          "3 · Matrice de rigidité",
          "Degrés de liberté non bloqués",
          "1"
        ],
        [
          "4 · Suggestions",
          "Verdict à l'écran",
          "Ne peut pas être calculée"
        ]
      ]
    },
    {
      "k": "p",
      "t": "L'application ne se contente pas d'annoncer le zéro et de s'en laver les mains. Elle le contredit dans la même étape 2 qui l'a produit : « La formule donne g = 0 (condition nécessaire d'isostaticité), mais PAS suffisante ». L'étape 3 assemble la matrice de rigidité globale, ici de 6×6, et signale « Mécanisme détecté : 1 mode » malgré g = 0 ≥ 0. Elle désigne le nœud 3 et son déplacement horizontal, fait remarquer que l'équation de l'étape 2 compte les liaisons sans vérifier où elles se trouvent, et conclut par « ✗ Mécanisme — ne peut pas être calculé »."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "La poutre sur trois appuis verticaux, avec le panneau d'analyse cinématique ouvert. Parcourez les quatre étapes : la deuxième donne g = 0 et la troisième trouve le mécanisme que ce zéro cache. Essayez de remplacer un appui par un appui articulé et relancez : le degré passe à 1 et le mécanisme disparaît."
    },
    {
      "k": "h",
      "t": "Pourquoi un département pourrait s'y intéresser"
    },
    {
      "k": "p",
      "t": "Un étudiant qui apprend la formule du degré sans jamais voir la condition suffisante échouer repart avec une règle incomplète, sans le savoir. C'est difficile à montrer au tableau, parce que l'exemple qui la met en défaut ressemble à une faute de frappe. Ici, il tient sur un seul écran, avec le nombre et la contradiction côte à côte."
    },
    {
      "k": "p",
      "t": "Il n'y a rien à installer ni de licence à gérer, et le département n'a rien à acheter. Le programme s'ouvre dans un navigateur, et le modèle se partage par un lien."
    },
    {
      "k": "note",
      "t": "Soyons clairs : rien de tout cela ne signifie que nous sommes meilleurs. Ftool modélise plus vite et avec moins de friction que nous. MASTAN2 s'appuie sur un manuel que nous n'avons pas écrit. Les calculs à la main de SkyCiv sont mieux présentés que plusieurs de nos panneaux. Et sectionproperties résout le gauchissement par éléments finis là où nous faisons une approximation. Ce que nous affirmons est plus étroit et assez précis : parmi les outils gratuits que nous avons examinés, aucun n'aborde les outils avancés par le côté conceptuel. Si vous connaissez un outil gratuit qui explique l'analyse cinématique, produit une nomenclature de façonnage ou détaille l'analyse de section, écrivez-nous et nous corrigerons cet article."
    }
  ]
};

export default body;
