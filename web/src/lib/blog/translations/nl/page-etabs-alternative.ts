import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] =  {
  "title": "Een gratis, open-source alternatief voor ETABS",
  "description": "Vergelijk Stabileo met je ETABS-werkwijze: gratis analyse in de browser, open source, verificatiebewijs, huidige beperkingen en geplande import.",
  "eyebrow": "Een gratis, open-source alternatief voor ETABS",
  "lead": "Stabileo biedt gratis, open-source constructieanalyse in je browser. Of het past bij je ETABS-werkwijze hangt af van de analyses en toetsingen die je nodig hebt; dit is geen bewering van gelijke functionaliteit.",
  "blocks": [
    {
      "k": "h",
      "t": "Wat Stabileo nu dekt"
    },
    {
      "k": "p",
      "t": "De capaciteitsmatrix van de solver beschrijft 2D- en 3D-lineaire statische analyse, raamwerken en vakwerken, belastingcombinaties en omhullenden, P-Delta, knik en modale analyse. Ook de families van platen en schalen zijn gedocumenteerd. Basic- en PRO-analyse zijn beschikbaar; normontwerp en de AI-assistent zijn in ontwikkeling."
    },
    {
      "k": "p",
      "t": "Maak voor gebouwwerkstromen onderscheid tussen de plaat- en schaalmogelijkheden van de solver en de PRO-interface voor vloeren, wanden en complexe modellen. Normontwerp in PRO is nog in ontwikkeling; dat een solverfunctie bestaat, betekent niet dat een volledige werkstroom voor gebouwontwerp klaar is."
    },
    {
      "k": "h",
      "t": "Huidige beperkingen"
    },
    {
      "k": "p",
      "t": "Import van SAP2000/ETABS-modellen is gepland, niet beschikbaar. Verwacht niet dat je .s2k- of .e2k-bestanden kunt openen. De capaciteitsmatrix beschrijft resterende lacunes in niet-lineaire robuustheid, gemengde raamwerk-/schaalgevallen en validatie van grotere modellen. De AI-assistent is in ontwikkeling en komt later."
    },
    {
      "k": "h",
      "t": "Hoe resultaten worden geverifieerd"
    },
    {
      "k": "p",
      "t": "Gepubliceerde benchmarks, vergelijkingen met onafhankelijke implementaties en tests leveren verschillende niveaus van bewijs. Ondersteunde analyses en ontwerptoetsingen kunnen machinaal gecontroleerde grenzen hebben; dat certificeert niet elk resultaat en ook het rekenmodel niet. De rijpheidsmatrix toont per familie het bewijs en de openstaande punten."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "Solvermogelijkheden",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Rijpheid van de verificatie",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "Productroadmap",
      "t": ""
    }
  ],
  "faqTitle": "Bronnen en reikwijdte",
  "faq": [
    {
      "q": "Is dit een volledige vervanging van ETABS?",
      "a": "Er wordt geen functie-voor-functie-gelijkwaardigheid beweerd. Bekijk de gedocumenteerde mogelijkheden en beperkingen voor jouw project. ETABS wordt alleen genoemd om de vergeleken werkwijze te benoemen; er is geen verbondenheid of goedkeuring bedoeld."
    }
  ]
};

export default body;
