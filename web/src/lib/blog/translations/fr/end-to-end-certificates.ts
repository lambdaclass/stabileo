import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Certificats de bout en bout : vérifier le résultat par rapport au modèle",
  "excerpt": "Un certificat qui prouve qu'un système mal assemblé a été correctement résolu ne vaut pas grand-chose. Comment Stabileo reconstruit lui-même chaque modèle de portique et certifie le résultat par rapport au modèle, ce que cela a permis de trouver et ce qui reste en dehors.",
  "blocks": [
    {
      "k": "p",
      "t": "Depuis plusieurs semaines, chaque analyse statique linéaire dans Stabileo passe par un certificat qui, lorsqu'il est obtenu, fournit une borne vérifiée par machine de l'erreur avec laquelle le système d'équations K·u = f a été résolu. Mais c'est le moteur lui-même qui assemble ce système. Si l'assemblage contenait une erreur, un signe faux dans une transformation, un terme de Timoshenko manquant, un effort d'encastrement parfait erroné, le certificat prouverait en toute rigueur que le mauvais système a été correctement résolu."
    },
    {
      "k": "p",
      "t": "Les certificats de bout en bout comblent cette lacune pour les portiques et les treillis, en 2D et en 3D : le résultat est vérifié par rapport au modèle tel qu'il a été saisi, et non par rapport aux matrices assemblées par le moteur."
    },
    {
      "k": "h",
      "t": "Un second assemblage, indépendant"
    },
    {
      "k": "p",
      "t": "Un vérificateur écrit séparément reconstruit la rigidité et les charges à partir des données du modèle, sans appeler aucune des fonctions d'élément ou d'assemblage du moteur. Il utilise ses propres formules et sa propre numérotation des degrés de liberté :"
    },
    {
      "k": "ul",
      "items": [
        "la flexion de chaque barre à partir de la souplesse de la console, inversée, et l'autre extrémité par l'équilibre, avec la déformation d'effort tranchant de Timoshenko ;",
        "les rotules par condensation statique, une rotation libérée à la fois ;",
        "les charges sur barre comme le travail sur les déformées exactes de la barre non chargée, avec les intégrales sous forme fermée ;",
        "les axes locaux, les appuis inclinés, les ressorts, les liaisons rigides, les diaphragmes et les liaisons cinématiques multipoints, dérivés des conventions du modèle."
      ]
    },
    {
      "k": "p",
      "t": "Tout est calculé en arithmétique d'intervalles, sinus et cosinus compris, avec des bornes rigoureuses : chaque donnée du modèle entre sous la forme du nombre décimal saisi, encadré dans un intervalle. Quand une décision dépend d'un seuil que l'intervalle ne permet pas de trancher, le vérificateur refuse au lieu de deviner."
    },
    {
      "k": "h",
      "t": "Ce qu'énonce le certificat"
    },
    {
      "k": "p",
      "t": "Avec cette rigidité exacte, le vérificateur prouve que le modèle a une solution unique et borne la distance entre les déplacements renvoyés par le moteur et cette solution, sur chaque degré de liberté que le modèle détermine. Les matrices du moteur ne jouent aucun rôle dans cet énoncé. Elles sont comparées à part : elles doivent concorder avec les matrices reconstruites à une partie sur 10¹⁰ près, et les déplacements doivent respecter les appuis et les liaisons cinématiques du modèle à une partie sur 10⁹ près. Sinon, le résultat est signalé comme non vérifié de bout en bout, avec la raison."
    },
    {
      "k": "p",
      "t": "Le théorème qui fonde la borne est démontré en Lean. Dans l'application, le panneau des résultats affiche la ligne « Vérifié de bout en bout » avec la borne de l'erreur sur les déplacements, ou la raison pour laquelle la vérification n'a pas pu se faire."
    },
    {
      "k": "h",
      "t": "Ce qu'il a trouvé"
    },
    {
      "k": "table",
      "caption": "Modèles vérifiés de bout en bout en intégration continue : dans tous, l'assemblage du moteur concorde avec l'assemblage reconstruit.",
      "head": [
        "Ensemble",
        "Modèles",
        "Certifiés"
      ],
      "rows": [
        [
          "Modèles de test 2D",
          "82",
          "82"
        ],
        [
          "Modèles de test 3D",
          "32",
          "32"
        ],
        [
          "Portiques 2D aléatoires",
          "200",
          "200"
        ],
        [
          "Portiques 3D aléatoires",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Tous les modèles de test et des centaines de portiques générés aléatoirement concordent et sont certifiés, et des erreurs d'assemblage introduites volontairement dans le moteur font échouer la vérification. Elle a aussi trouvé de vrais problèmes :"
    },
    {
      "k": "ul",
      "items": [
        "un diaphragme 3D dans le plan XZ liait les nœuds avec une rotation de signe opposé ;",
        "en 2D, un moment sur un nœud où toutes les barres sont articulées était absorbé par un ressort artificiel, et le certificat du système assemblé le laissait passer alors que le modèle n'a pas de solution ;",
        "une liaison rigide partant d'un tel nœud masquait un vrai mécanisme."
      ]
    },
    {
      "k": "p",
      "t": "Les deux premiers sont corrigés : le diaphragme suit la rotation de corps rigide, et ce moment est refusé avant le calcul. Et quand le moteur a changé la signification d'un diaphragme, pour que tout le plancher tourne comme un seul corps, le vérificateur n'a rien laissé passer de faux : il est resté honnête, avec des bornes inutilisables, jusqu'à la mise à jour de ses conventions. C'est exactement à cela que sert une vérification indépendante."
    },
    {
      "k": "h",
      "t": "Ce qui reste en dehors"
    },
    {
      "k": "ul",
      "items": [
        "Les coques, les solides, les connecteurs, les poutres courbes et la torsion gênée ne sont pas encore reconstruits : ils sont signalés hors du périmètre, jamais comme vérifiés.",
        "Les formules du vérificateur codent la mécanique du modèle. Elles sont écrites séparément du moteur et comparées avec lui, mais elles ne sont pas démontrées.",
        "L'équivalence entre l'implémentation en Rust et l'algorithme en Lean n'est pas démontrée, comme pour tous les certificats.",
        "Un certificat dit que le résultat appartient au modèle. Il ne dit pas que le modèle représente bien la structure : cela reste le travail de l'ingénieur."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Les autres façons dont nous cherchons les erreurs, et leurs limites :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/CERTIFY.md",
      "label": "CERTIFY.md, « End-to-end certificates »",
      "t": "La description technique complète, avec les formules et les tests :"
    }
  ]
};

export default body;
