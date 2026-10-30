import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Vérifications CIRSOC gratuites dans votre navigateur : ce qui est disponible et ce qui ne l'est pas",
  "description": "Stabileo vérifie le béton (CIRSOC 201) et l'acier (CIRSOC 301, expérimental) et génère les charges CIRSOC 101–104, gratuitement. Ce qui est prêt, ce qui manque.",
  "eyebrow": "CIRSOC",
  "lead": "Stabileo est un logiciel open source d'analyse de structures qui vérifie les barres en béton armé selon CIRSOC 201 (édition 2025) et les barres en acier selon CIRSOC 301-2018, et qui génère les charges et les combinaisons selon CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (partie I) et CIRSOC 104-2005, les normes de structures argentines. Il utilise le même modèle et le même solveur que l'analyse, fonctionne dans le navigateur et ne demande ni installation ni licence. Le dimensionnement réglementaire se trouve dans le module PRO, encore en développement et gratuit tant qu'il l'est.",
  "blocks": [
    {
      "k": "h",
      "t": "Ce qui est disponible, et jusqu'où c'est vérifié"
    },
    {
      "k": "p",
      "t": "Certifié signifie que chaque résultat est accompagné d'une borne de son erreur numérique, calculée en arithmétique d'intervalles ; cela ne signifie pas que le modèle est juste ni qu'un ingénieur l'a revu. Les exemples publiés sont les exemples d'application INTI-CIRSOC."
    },
    {
      "k": "table",
      "caption": "Ce que Stabileo vérifie aujourd'hui selon CIRSOC, avec le niveau de vérification de chaque partie.",
      "head": [
        "Norme",
        "Ce qu'il fait",
        "État"
      ],
      "rows": [
        [
          "CIRSOC 201 — béton armé",
          "Poutres et poteaux : flexion, flexion composée, effort tranchant et armatures minimales ; sections, diagrammes d'interaction et dalles calculés par le moteur",
          "Disponible dans PRO. Flexion et effort tranchant des poutres certifiés ; flexion composée et dalles testées, non certifiées. 3 clauses sur 5 vérifiées par rapport aux exemples INTI-CIRSOC 201-2005"
        ],
        [
          "CIRSOC 201-2025 — dispositions constructives",
          "Ancrage, maîtrise de la fissuration, espacements et disposition des barres",
          "Disponible dans PRO. Testé"
        ],
        [
          "CIRSOC 301-2018 — acier",
          "Traction, compression (flambement par flexion et par flexion-torsion), flexion et effort tranchant",
          "Disponible, marqué comme expérimental jusqu'à une revue indépendante. Certifié ; 10 clauses sur 14 vérifiées par rapport aux exemples INTI-CIRSOC 301-2018"
        ],
        [
          "CIRSOC 301-2018 J — assemblages",
          "Soudures d'angle et assemblages boulonnés",
          "En développement ; 2 clauses sur 4 vérifiées par rapport à des exemples publiés"
        ],
        [
          "CIRSOC 201 — semelles isolées",
          "Pression sur le sol, effort tranchant, poinçonnement et flexion",
          "En développement ; comparé à une seconde implémentation"
        ],
        [
          "CIRSOC 101-2025 — charges et combinaisons",
          "Les sept combinaisons du §2.3.2, charges permanentes et d'exploitation",
          "Ce qui est implémenté est vérifié clause par clause par rapport au texte officiel ; glace, événements exceptionnels et certaines dispositions non couverts"
        ],
        [
          "CIRSOC 102-2025 — vent",
          "Pressions et combinaisons de service",
          "Ce qui est implémenté est vérifié par rapport au texte officiel ; certains cas non couverts"
        ],
        [
          "INPRES-CIRSOC 103-2018 partie I — sismique",
          "Spectre, méthode selon la zone, poids sismique et combinaison sismique",
          "Ce qui est implémenté est vérifié ; certaines dispositions non couvertes"
        ],
        [
          "CIRSOC 104-2005 — neige",
          "Charges de neige par localité",
          "Vérifié par rapport aux tableaux"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Fonctionnement"
    },
    {
      "k": "ul",
      "items": [
        "Un seul modèle : vous dessinez ou importez la structure (DXF, IFC ou un gabarit Excel) et les vérifications utilisent les mêmes efforts que l'analyse, sans rien recopier à la main dans un autre tableur.",
        "Les charges et les combinaisons selon CIRSOC 101, 102, 103 et 104 sont générées à partir des données du projet.",
        "Chaque barre se termine avec son taux de travail S/R et la clause déterminante, et chaque étape peut être examinée.",
        "Le solveur s'exécute sur votre ordinateur : le modèle n'est envoyé à aucun serveur pour être résolu. Le code est ouvert (AGPL-3.0).",
        "Le même modèle donne toujours les mêmes chiffres, et chaque note de calcul enregistre la version et les données qui l'ont produite."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Un exemple d'application pas à pas, avec le modèle à ouvrir dans l'éditeur :"
    },
    {
      "k": "h",
      "t": "Comment nous le validons, et où s'arrête la validation"
    },
    {
      "k": "ul",
      "items": [
        "Les vérifications réglementaires sont comparées clause par clause aux exemples d'application INTI-CIRSOC, et les charges aux textes officiels ; chaque écart est documenté avec sa cause.",
        "L'analyse est comparée à sept autres programmes d'éléments finis.",
        "Il n'y a pas encore eu de revue indépendante par un ingénieur structure habilité, et l'acier reste marqué comme expérimental.",
        "Aucun programme ne vérifie le modèle : les charges, les appuis et l'idéalisation sont des décisions de l'ingénieur."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Lorsque nous trouvons un défaut qui a pu affecter des résultats déjà utilisés, nous le publions avec ce qu'il faut revérifier :"
    }
  ],
  "faqTitle": "Questions fréquentes",
  "faq": [
    {
      "q": "Quel logiciel vérifie le dimensionnement des structures selon les normes CIRSOC ?",
      "a": "Stabileo vérifie le béton armé selon CIRSOC 201 et l'acier selon CIRSOC 301-2018 (marqué comme expérimental), et génère les charges et les combinaisons selon CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 et CIRSOC 104-2005. Il est open source, fonctionne dans le navigateur et reste gratuit tant que le module de dimensionnement est en développement."
    },
    {
      "q": "Stabileo est-il gratuit pour les vérifications CIRSOC ?",
      "a": "Oui, aujourd'hui il l'est. L'analyse (Basique) est gratuite. Le module de dimensionnement réglementaire est en développement et gratuit tant qu'il l'est ; ensuite, il reste gratuit pour les universités publiques et pour ceux qui participent à son développement."
    },
    {
      "q": "Puis-je utiliser Stabileo pour un calcul que je vais signer ?",
      "a": "La responsabilité d'un dimensionnement incombe à l'ingénieur qui le signe, quel que soit le programme. Stabileo publie ce qui est vérifié et à quel niveau ; il n'a pas encore fait l'objet d'une revue indépendante par un ingénieur habilité et l'acier est marqué comme expérimental : vérifiez donc à la main les barres déterminantes."
    },
    {
      "q": "Quelle édition de CIRSOC 201 utilise-t-il ?",
      "a": "L'édition 2025. L'édition 2005 peut être sélectionnée dans les normes du projet pour des projets antérieurs, mais le dimensionnement des poutres et des poteaux selon cette édition n'est pas encore disponible. Les vérifications du moteur sont comparées aux exemples d'application INTI-CIRSOC 201-2005."
    }
  ]
};

export default body;
