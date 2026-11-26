import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Hoe betrouwbaar is Stabileo? Zo worden de resultaten gecontroleerd",
  "description": "Hoe Stabileo zijn resultaten controleert: zeven andere FE-programma's, gepubliceerde voorbeelden, in Lean bewezen foutgrenzen en openbare berichten.",
  "eyebrow": "Betrouwbaarheid",
  "lead": "De resultaten van Stabileo worden op vijf onafhankelijke manieren gecontroleerd, waaronder vergelijking met zeven andere eindige-elementenprogramma's en foutgrenzen waarvan de kernwiskunde in Lean is bewezen. Fouten die resultaten in gebruik kunnen hebben beïnvloed worden gepubliceerd als veiligheidsberichten (sommige bevindingen worden nog beoordeeld, in het openbaar), en de lijst hieronder zegt welke zijn opgelost en in welke versie. Zoals elk rekenprogramma controleert het je model niet: belastingen, opleggingen en schematisering zijn beslissingen van de ingenieur.",
  "blocks": [
    {
      "k": "h",
      "t": "Vijf manieren om naar fouten te zoeken"
    },
    {
      "k": "ul",
      "items": [
        "Vergelijking met andere programma's: dezelfde modellen, vaste en willekeurige die elke nacht worden gegenereerd, worden opgelost met OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos en CalculiX, en elk verschil wordt onderzocht.",
        "Gepubliceerde referenties: gevallen waarvan de auteurs de resultaten hebben gepubliceerd, en toetsingen die zijn vergeleken met gepubliceerde uitgewerkte voorbeelden (INTI-CIRSOC, AISC en andere).",
        "Fysische invarianten: een model roteren, spiegelen of hernummeren, of de eenheden wijzigen, moet het antwoord precies zo veranderen als de natuurkunde voorschrijft.",
        "Afleidingen: de elementmatrices van het raamwerk worden symbolisch afgeleid en term voor term met de code vergeleken.",
        "Fuzzing en mutatietesten: miljoenen gegenereerde invoeren zoeken naar fouten, en er worden met opzet fouten aangebracht om te controleren of de tests ze opmerken."
      ]
    },
    {
      "k": "h",
      "t": "Resultaten met een foutgrens"
    },
    {
      "k": "p",
      "t": "Voor resultaten die het toelaten berekent Stabileo, in intervalrekenen, een grens die de exacte oplossing bevat van het stelsel dat is opgelost; als dat niet lukt, wordt het resultaat gemarkeerd als niet gecertificeerd, met de reden. De kernwiskunde is in Lean bewezen voor lineaire berekening, combinaties, modale analyse en plastisch bezwijken. Sinds 0.3.0 wordt de grens bij lineaire berekening van raamwerken en vakwerken ook gecontroleerd aan het model zelf, met een onafhankelijke opbouw."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Hoe de controle aan het model werkt:"
    },
    {
      "k": "h",
      "t": "Waarom we veiligheidsberichten publiceren"
    },
    {
      "k": "p",
      "t": "Deze verificatie vond echte fouten, veel ervan aan de onveilige kant. We publiceren de fouten die resultaten in gebruik kunnen hebben beïnvloed, met hoe je een getroffen model herkent en wat je opnieuw moet controleren, want een fout die niemand meldt blijft zitten in berekeningen die al zijn opgeleverd."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 tot 004 zijn opgelost in versie 0.2.0.",
        "SA-2026-005 tot 020 zijn opgelost in versie 0.3.0.",
        "SA-2026-021 tot 024 zijn opgelost in versie 0.4.0.",
        "SA-2026-025 tot 047 zijn gepubliceerd met versie 0.5.0 en daarin opgelost (SA-2026-040 is ingeperkt: de toetsing is gemarkeerd als onvolledig), behalve SA-2026-044: plastisch bezwijken in 2D blijft geweigerd totdat #758 is gesloten.",
        "De app meldt één keer wanneer resultaten kunnen zijn veranderd, en projecten die zijn opgeslagen vóór een wijziging die hen aangaat vragen om een nieuwe controle wanneer je ze opent."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "De volledige lijst van berichten:"
    },
    {
      "k": "h",
      "t": "Wat geen enkele controle garandeert"
    },
    {
      "k": "ul",
      "items": [
        "Een foutgrens begrenst numerieke fouten; ze bewijst niet dat het model klopt, en ze begrenst de discretisatiefout van het elementennet niet.",
        "Er is nog geen onafhankelijke beoordeling geweest door een bevoegd constructeur, en de resultaten voor staal volgens CIRSOC 301 zijn nog als experimenteel gemarkeerd.",
        "Materieel niet-lineaire berekening is een secantmodel voor de hele staaf.",
        "Normdimensionering binnen PRO (wapening, detaillering en verbindingen) is nog in ontwikkeling en staat standaard uit.",
        "Openstaande veiligheidskwesties zijn openbaar op GitHub, en het verificatieniveau van elke berekening, elk element en elke norm staat in de volwassenheidsmatrix."
      ]
    },
    {
      "k": "p",
      "t": "Kortom: Stabileo past bij berekeningen die je kunt kruiscontroleren, bij onderwijs en bij ontwerpwerk waarbij een ingenieur de maatgevende resultaten controleert, zoals bij elk programma. Als jouw proces onafhankelijk beoordeelde of gecertificeerde commerciële software vereist, is Stabileo er nog niet, en dat zeggen we ook."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Elke controle in detail, en de grenzen ervan:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Volwassenheidsmatrix",
      "t": "Het verificatieniveau van elk onderdeel:"
    }
  ],
  "faqTitle": "Veelgestelde vragen",
  "faq": [
    {
      "q": "Is Stabileo betrouwbaar voor echt constructief ontwerpwerk?",
      "a": "De resultaten worden op vijf onafhankelijke manieren gecontroleerd, waaronder vergelijking met zeven andere eindige-elementenprogramma's en in Lean bewezen foutgrenzen, en fouten die resultaten in gebruik kunnen hebben beïnvloed worden gepubliceerd; de fouten die nog worden beoordeeld zijn openbaar op GitHub. Er is nog geen onafhankelijke beoordeling door een bevoegd ingenieur geweest en de normdimensionering is nog in ontwikkeling, dus, zoals bij elk programma, controleert de ingenieur het model en de maatgevende resultaten."
    },
    {
      "q": "Waarom publiceert Stabileo veiligheidsberichten?",
      "a": "Omdat de verificatie echte fouten vond, veel ervan aan de onveilige kant, en een fout die niemand meldt blijft zitten in berekeningen die al zijn opgeleverd. Elk bericht zegt hoe je een getroffen model herkent en wat je opnieuw moet controleren."
    },
    {
      "q": "Zijn de gepubliceerde berichten opgelost?",
      "a": "Op twee na allemaal. SA-2026-001 tot 004 zijn opgelost in versie 0.2.0, SA-2026-005 tot 020 in 0.3.0, SA-2026-021 tot 024 in 0.4.0 en SA-2026-025 tot 047 in 0.5.0, behalve SA-2026-040 en SA-2026-044. SA-2026-040 is ingeperkt: de toetsing is gemarkeerd als onvolledig. SA-2026-044 is niet opgelost: plastisch bezwijken in 2D blijft geweigerd totdat #758 is gesloten."
    }
  ]
};

export default body;
