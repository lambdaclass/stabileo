import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] =  {
  "title": "CIRSOC-ontwerptoetsingen in je browser: wat er wel en niet wordt geleverd",
  "description": "Stabileo toetst beton (CIRSOC 201) en staal (CIRSOC 301, experimenteel) en genereert CIRSOC 101–104-belastingen in je browser. Wat wel en niet geleverd wordt.",
  "eyebrow": "CIRSOC",
  "lead": "Stabileo is open-source constructieanalysesoftware die gewapendbetonnen elementen toetst aan CIRSOC 201 (de editie van 2025) en stalen elementen aan CIRSOC 301-2018, en belastingen en combinaties genereert volgens CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 (deel I) en CIRSOC 104-2005, de constructienormen van Argentinië. Het gebruikt hetzelfde model en dezelfde solver waarmee je analyseert, draait in de browser en vereist geen installatie. Analyse is gratis voor iedereen. Normontwerp zit in PRO; dat is nog in ontwikkeling, is betaald en is gratis voor universiteiten.",
  "blocks": [
    {
      "k": "h",
      "t": "Wat beschikbaar is en hoe ver het is geverifieerd"
    },
    {
      "k": "p",
      "t": "Gecertificeerd betekent dat elk resultaat een grens op zijn numerieke fout draagt, berekend met intervalrekenen; het betekent niet dat het model juist is of dat een ingenieur het heeft beoordeeld. De gepubliceerde voorbeelden zijn de uitgewerkte INTI-CIRSOC-voorbeelden."
    },
    {
      "k": "table",
      "caption": "Wat Stabileo nu aan CIRSOC toetst, met het verificatieniveau van elk onderdeel.",
      "head": [
        "Norm",
        "Wat het doet",
        "Status"
      ],
      "rows": [
        [
          "CIRSOC 201 — gewapend beton",
          "Liggers en kolommen: buiging, gecombineerde normaalkracht en buiging, dwarskracht en minimumstaal; doorsneden, interactiediagrammen en vloeren uit de engine",
          "Beschikbaar in PRO. Buiging en dwarskracht van liggers gecertificeerd; gecombineerde normaalkracht en buiging en vloeren getest, niet gecertificeerd. 3 van 5 artikelen getoetst aan de voorbeelden van INTI-CIRSOC 201-2005"
        ],
        [
          "CIRSOC 201-2025 — detaillering",
          "Verankering, scheurbeheersing, onderlinge afstand en wapeningsindeling",
          "Beschikbaar in PRO. Getest"
        ],
        [
          "CIRSOC 301-2018 — staal",
          "Trek, druk (buigknik en buig-wringknik), buiging en dwarskracht",
          "Beschikbaar, als experimenteel gemarkeerd tot een onafhankelijke beoordeling. Gecertificeerd; 10 van 14 artikelen getoetst aan de voorbeelden van INTI-CIRSOC 301-2018"
        ],
        [
          "CIRSOC 301-2018 J — verbindingen",
          "Hoeklassen en boutverbindingen",
          "In ontwikkeling; 2 van 4 artikelen getoetst aan gepubliceerde voorbeelden"
        ],
        [
          "CIRSOC 201 — poeren",
          "Gronddruk, dwarskracht, ponsen en buiging",
          "In ontwikkeling; vergeleken met een tweede implementatie"
        ],
        [
          "CIRSOC 101-2025 — belastingen en combinaties",
          "De zeven combinaties van §2.3.2, permanente en veranderlijke belastingen",
          "Wat is geïmplementeerd, is artikel voor artikel geverifieerd aan de officiële tekst; ijs, buitengewone gebeurtenissen en enkele bepalingen niet gedekt"
        ],
        [
          "CIRSOC 102-2025 — wind",
          "Drukken en gebruiksgrenstoestandscombinaties",
          "Wat is geïmplementeerd, is geverifieerd aan de officiële tekst; enkele gevallen niet gedekt"
        ],
        [
          "INPRES-CIRSOC 103-2018 deel I — seismiek",
          "Spectrum, methode per zone, seismisch gewicht en seismische combinatie",
          "Wat is geïmplementeerd, is geverifieerd; enkele bepalingen niet gedekt"
        ],
        [
          "CIRSOC 104-2005 — sneeuw",
          "Sneeuwbelastingen per plaats",
          "Geverifieerd aan de tabellen"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Hoe het werkt"
    },
    {
      "k": "ul",
      "items": [
        "Eén model: je tekent of importeert de constructie (DXF, IFC of een Excel-sjabloon) en de toetsingen gebruiken dezelfde krachten als de analyse, zonder iets met de hand over te nemen in een andere spreadsheet.",
        "Belastingen en combinaties volgens CIRSOC 101, 102, 103 en 104 worden gegenereerd uit de projectgegevens.",
        "Alleen voltooide, toepasselijke toetsingen geven de maatgevende verhouding vraag/capaciteit en het bepalende artikel, en elke stap kan worden ingezien.",
        "De solver draait op je computer: het model wordt niet naar een server gestuurd om te worden berekend. De code is open (AGPL-3.0).",
        "Dezelfde invoer geeft met dezelfde solverversie dezelfde getallen, en elk rapport legt de versie en de gegevens vast die het hebben voortgebracht."
      ]
    },
    {
      "k": "link",
      "slug": "verificacion-flexion-cirsoc-201",
      "t": "Een uitgewerkt voorbeeld stap voor stap, met het model om te openen in de editor:"
    },
    {
      "k": "h",
      "t": "Hoe we het valideren en waar de validatie ophoudt"
    },
    {
      "k": "ul",
      "items": [
        "De ontwerptoetsingen worden artikel voor artikel vergeleken met de uitgewerkte INTI-CIRSOC-voorbeelden, en de belastingen met de officiële teksten; elk verschil is gedocumenteerd met zijn oorzaak.",
        "De analyse wordt vergeleken met zeven andere eindige-elementenprogramma's.",
        "Er is nog geen onafhankelijke beoordeling geweest door een bevoegd constructeur, en staal is nog als experimenteel gemarkeerd.",
        "Geen enkel programma toetst het model: de belastingen, opleggingen en idealisering zijn beslissingen van de ingenieur."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Wanneer we een defect vinden dat resultaten had kunnen beïnvloeden die al zijn gebruikt, publiceren we het met wat je opnieuw moet controleren:"
    }
  ],
  "faqTitle": "Veelgestelde vragen",
  "faq": [
    {
      "q": "Welke software toetst constructief ontwerp aan de CIRSOC-normen?",
      "a": "Stabileo toetst gewapend beton aan CIRSOC 201 en staal aan CIRSOC 301-2018 (als experimenteel gemarkeerd), en genereert belastingen en combinaties volgens CIRSOC 101-2025, 102-2025, INPRES-CIRSOC 103-2018 en CIRSOC 104-2005. Het is open source, draait in de browser en biedt betaalde ontwerpmodules, gratis voor universiteiten."
    },
    {
      "q": "Is Stabileo gratis voor CIRSOC-toetsingen?",
      "a": "Het kernprogramma, voor constructieberekeningen in de browser, is open source en gratis voor iedereen. Sommige gespecialiseerde modules zijn betaald; universiteiten krijgen die modules gratis. Stabileo AI en zware cloudberekeningen worden door iedereen betaald, universiteiten inbegrepen, tegen een prijs die de kosten dekt."
    },
    {
      "q": "Kan ik Stabileo gebruiken voor een berekening die ik ga ondertekenen?",
      "a": "De verantwoordelijkheid voor een ontwerp ligt bij de ondertekenende ingenieur, met welk programma dan ook. Stabileo publiceert wat is geverifieerd en tot welk niveau; het heeft nog geen onafhankelijke beoordeling door een bevoegd ingenieur gehad en staal is als experimenteel gemarkeerd, dus controleer de maatgevende staven met de hand."
    },
    {
      "q": "Welke editie van CIRSOC 201 gebruikt het?",
      "a": "De editie van 2025. 2005 kan worden gekozen in de normen van het project voor eerdere projecten, maar het ontwerp van liggers en kolommen met die editie is nog niet beschikbaar. De toetsingen van de engine worden vergeleken met de uitgewerkte voorbeelden van INTI-CIRSOC 201-2005."
    }
  ]
};

export default body;
