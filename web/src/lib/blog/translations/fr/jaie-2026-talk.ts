import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo aux 29es Journées argentines d’ingénierie des structures",
  "excerpt": "Le 18 septembre, nous avons présenté à Córdoba la communication 86N : un agent de calcul de structures qui propose des modifications et laisse tous les chiffres à un solveur vérifié. Ce que nous avons montré, pourquoi l’agent doit rester séparé du calcul et ce que nous en avons rapporté.",
  "blocks": [
    {
      "k": "p",
      "t": "Les 29es Journées argentines d’ingénierie des structures (JAIE) se sont tenues à Córdoba du 16 au 18 septembre, organisées par l’Asociación de Ingenieros Estructurales. Le dernier jour, nous avons présenté la communication 86N, « Développement d’un agent de calcul de structures sur un solveur vérifié », de Bautista Chesta, Raúl Bertero, Federico Carrone et Diego Kingston, dans le thème de l’intelligence artificielle appliquée au génie civil."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta s’adresse au public ; à l’écran, un portique à quatre travées avec une poutre entourée en rouge et le titre « La structure est recalculée ».",
      "caption": "La présentation de la communication 86N. À l’écran, le moment où une poutre ne vérifie plus et où tout le modèle est résolu de nouveau."
    },
    {
      "k": "h",
      "t": "Ce que nous avons montré"
    },
    {
      "k": "p",
      "t": "La communication repose sur une règle d’architecture : l’agent d’IA interprète la demande de l’ingénieur et propose des actions, mais chaque chiffre vient du solveur et des modules CIRSOC, que l’agent ne peut pas modifier. Nous l’appelons la frontière de déterminisme."
    },
    {
      "k": "p",
      "t": "Pendant l’exposé, nous l’avons montré sur un portique en béton armé qui ne vérifie pas. L’agent propose une poutre plus haute, le solveur résout de nouveau tout le modèle et la vérification CIRSOC 201 est refaite sur la nouvelle structure : le taux de travail passe de 1,10 à 0,97. La communication refait cette vérification à la main, pas à pas."
    },
    {
      "k": "p",
      "t": "Le second cas était un bâtiment de quatre travées et trois niveaux dont on retire un poteau. Certaines poutres ne vérifient plus, leurs sections sont redimensionnées et toutes les barres vérifient de nouveau, le solveur résolvant le modèle entier à chaque étape."
    },
    {
      "k": "h",
      "t": "Pourquoi la frontière est nécessaire"
    },
    {
      "k": "p",
      "t": "Pour le montrer, nous avons soumis quinze fois la même demande de prédimensionnement à des assistants d’IA généralistes. Ils ont rendu sept sections différentes. Le plus parlant : onze exécutions sont tombées d’accord sur le moment de calcul et ont pourtant proposé six sections différentes."
    },
    {
      "k": "table",
      "caption": "La même demande de prédimensionnement, répétée, et le portique corrigé avec le solveur.",
      "head": [
        "Quoi",
        "Valeur"
      ],
      "rows": [
        [
          "Exécutions de la même demande",
          "15"
        ],
        [
          "Sections différentes rendues",
          "7"
        ],
        [
          "Rapport entre la plus grande et la plus petite aire",
          "1,80"
        ],
        [
          "Exécutions d’accord sur Mu = 207 kN·m",
          "11"
        ],
        [
          "Sections différentes parmi ces exécutions",
          "6"
        ],
        [
          "Taux de travail du portique avant correction",
          "1,10"
        ],
        [
          "Taux de travail du portique après correction",
          "0,97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Avec un solveur derrière, le même modèle donne le même chiffre à chaque fois, et ce chiffre peut être contrôlé. C’est ce que nous voulons qu’un ingénieur puisse signer en confiance."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Diego Kingston et Bautista Chesta, badges d’auteurs au cou, devant le mur des partenaires des Journées.",
      "caption": "Avec Diego Kingston, coauteur de la communication, aux Journées."
    },
    {
      "k": "h",
      "t": "Ce que nous en avons rapporté"
    },
    {
      "k": "p",
      "t": "Nous sommes revenus avec des contacts parmi des ingénieurs structures de tout le pays et l’invitation à rejoindre le réseau des ingénieurs structures. Nous avons aussi parlé avec des universités de Córdoba de son utilisation dans leurs cours."
    },
    {
      "k": "p",
      "t": "La communication complète se lit sur stabileo.com/paper, et Stabileo fonctionne dans le navigateur, sans rien installer."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Un résumé de la communication, avec les deux cas et leurs chiffres :"
    }
  ]
};

export default body;
