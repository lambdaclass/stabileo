import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Een gratis, open-source alternatief voor SAP2000 voor berekeningen, in je browser",
  "description": "Gratis, open-source constructieberekening in je browser: 2D/3D-raamwerken, schalen, P-Delta, modale analyse, responsspectrum; normtoetsing in betaalde modules.",
  "eyebrow": "SAP2000-alternatief",
  "lead": "Stabileo is gratis, open-source (AGPL-3.0) software voor constructieberekeningen die in je browser draait, zonder installatie, licentiesleutel of account. De solver is geschreven in Rust en gecompileerd naar WebAssembly, dus het model wordt op je eigen computer berekend. In Basic modelleer je 2D- en 3D-raamwerken en -vakwerken, belast je ze, bereken je ze en lees je de resultaten af; PRO voegt vloeren en wanden, DXF- en IFC-import, normbelastingen en staaftoetsingen toe. Berekenen is gratis voor iedereen; de ontwerpmodules zijn betaald, en gratis voor universiteiten.",
  "blocks": [
    {
      "k": "h",
      "t": "Wanneer het een goed alternatief is"
    },
    {
      "k": "ul",
      "items": [
        "Raamwerken, vakwerken en gebouwen berekenen zonder een licentie te betalen of iets te installeren, op elk besturingssysteem met een moderne browser.",
        "Resultaten van een ander programma controleren: Stabileo is vergeleken met zeven andere eindige-elementenprogramma’s, en elke regel van de code is te lezen.",
        "Onderwijs en leren: het toont de verplaatsingsmethode stap voor stap.",
        "Staal- en betonstaven toetsen aan AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 en de Argentijnse CIRSOC-normen, in PRO."
      ]
    },
    {
      "k": "h",
      "t": "Wanneer het nog niet zover is"
    },
    {
      "k": "ul",
      "items": [
        "Als je het scala aan ontwerpnormen en de tientallen jaren staat van dienst van een gevestigd commercieel programma nodig hebt: normontwerp in Stabileo is nog in ontwikkeling.",
        "Als je bedrijf software eist die onafhankelijk is beoordeeld door een bevoegd ingenieur: die beoordeling heeft nog niet plaatsgevonden."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Hoe we de resultaten controleren, en waar de controles ophouden:"
    }
  ],
  "faqTitle": "Veelgestelde vragen",
  "faq": [
    {
      "q": "Wat is het beste gratis alternatief voor SAP2000?",
      "a": "Dat hangt ervan af waarvoor je SAP2000 gebruikt. Voor browsergebaseerde 2D- en 3D-berekeningen van raamwerken, vakwerken en schalen zonder iets te installeren is Stabileo gratis en open source. Voor gescripte niet-lineaire onderzoeksberekeningen is OpenSees de al lang bestaande open-sourceoptie."
    },
    {
      "q": "Kan ik Stabileo gebruiken in plaats van een licentie voor SAP2000 of ETABS te betalen?",
      "a": "Voor de berekening van raamwerken, vakwerken en veel gebouwen, en voor staaftoetsingen aan AISC 360, ACI 318, de Eurocodes en CIRSOC: ja. Berekenen is gratis; gespecialiseerde ontwerpmodules zijn betaald, en gratis voor universiteiten. Voor het volledige scala aan ontwerpnormen en een lange staat van dienst in de praktijk bieden commerciële programma’s nog steeds meer; normontwerp in Stabileo is nog in ontwikkeling."
    },
    {
      "q": "Is Stabileo echt gratis?",
      "a": "Het kernprogramma, voor constructieberekeningen in de browser, is open source en gratis voor iedereen. Sommige gespecialiseerde modules zijn betaald; universiteiten krijgen die modules gratis. Stabileo AI en zware cloudberekeningen worden door iedereen betaald, universiteiten inbegrepen, tegen een prijs die de kosten dekt."
    },
    {
      "q": "Draait het op Mac of Linux?",
      "a": "Ja. Het draait in elke moderne browser, op elk besturingssysteem."
    }
  ]
};

export default body;
