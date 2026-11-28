import { certificateFigureAlt } from '../../certificate-figure-nl';
import type { PostBody } from '../../types';

const body: PostBody =  {
  "title": "Hoe we de resultaten van Stabileo controleren en waar de controles ophouden",
  "excerpt": "De solver, formele verificatie en AI: hoe we zoeken naar fouten in de getallen die Stabileo geeft, wat de certificaten bewijzen en wat geen enkele verificatie kan garanderen.",
  "blocks": [
    {
      "k": "p",
      "t": "Een constructieanalyseprogramma kan een verkeerd getal geven zonder zichtbaar teken. De afgelopen weken hebben we elk onderdeel van Stabileo op verschillende onafhankelijke manieren getest, tientallen echte defecten gevonden, veel ervan onveilig (onconservatief), en de meeste verholpen. Elk defect wordt beoordeeld en, als het resultaten kan hebben beïnvloed die al in gebruik zijn, gepubliceerd als bericht met wat je intussen moet doen; sommige worden nog beoordeeld. Dit bericht legt uit hoe we naar die defecten zoeken, wat de certificaten bij de resultaten bewijzen en, even duidelijk, wat buiten elke verificatie valt."
    },
    {
      "k": "h",
      "t": "Eén engine"
    },
    {
      "k": "p",
      "t": "De solver is geschreven in Rust en gecompileerd naar WebAssembly: hij draait op de eigen computer van de gebruiker, zonder installatie en zonder het model naar een server te sturen. Het is dezelfde code die in continuous integration draait. In oktober 2026 hebben we de parallelle TypeScript-berekeningen verwijderd die de engine stilzwijgend vervingen wanneer die niet beschikbaar was: de applicatie meldt dat nu, in plaats van met een ongeverifieerde kopie te rekenen."
    },
    {
      "k": "h",
      "t": "Vijf manieren om fouten te zoeken"
    },
    {
      "k": "p",
      "t": "Geen enkele test vindt elke fout, dus gebruiken we er meerdere die op verschillende manieren falen:"
    },
    {
      "k": "ul",
      "items": [
        "Vergelijking met andere programma's. Dezelfde modellen, vaste en willekeurige die elke nacht worden gegenereerd, worden berekend met OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos en CalculiX. Elk verschil wordt onderzocht totdat we weten of de fout bij ons ligt of dat de twee programma's het geval anders modelleren.",
        "Gepubliceerde referenties. Een acceptatiesuite van gevallen waarvan de resultaten door hun auteurs zijn gepubliceerd, niet door een ander commercieel programma, met toleranties die worden bepaald door de nauwkeurigheid die in de bron is afgedrukt. Ontwerptoetsingen worden vergeleken met gepubliceerde uitgewerkte voorbeelden (INTI-CIRSOC, AISC en andere).",
        "Fysische invarianten. Een model roteren, spiegelen of hernummeren, of de eenheden ervan veranderen, moet het antwoord precies zo veranderen als de natuurkunde zegt; bij lineaire analyses moet superpositie gelden. Ook reciprociteit en de energiebalans worden getoetst waar ze van toepassing zijn. Deze tests hebben helemaal geen referentiewaarde nodig.",
        "Afleidingen. De elementmatrices van de raamwerkstaaf worden symbolisch afgeleid uit eerste beginselen en term voor term vergeleken met die van de code; voor de andere elementen zijn er schriftelijke afleidingen die een andere ingenieur kan beoordelen.",
        "Fuzzing en mutatietesten. Miljoenen gegenereerde invoeren zoeken naar crashes en niet-eindige resultaten, en er worden met opzet fouten in de code aangebracht om te controleren of de tests ze opmerken."
      ]
    },
    {
      "k": "table",
      "caption": "Enkele cijfers van het verificatiewerk, uit de documenten in de repository.",
      "head": [
        "Wat",
        "Aantal"
      ],
      "rows": [
        [
          "Onafhankelijke eindige-elementenprogramma's in de vergelijking",
          "7"
        ],
        [
          "Acceptatiegevallen met gepubliceerde resultaten",
          "12"
        ],
        [
          "Gepubliceerde referentiewaarden in die gevallen",
          "105"
        ],
        [
          "Lean-stellingen waarvan de axioma's door continuous integration worden gecontroleerd",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "De 105 referentiewaarden zijn grotendeels frequenties van gebouwraamwerken (SAC, IASC-ASCE, Bathe en Wilson). Ze dekken modale en lineaire analyse van raamwerken goed; ze zijn geen bewijs voor andere soorten analyse."
    },
    {
      "k": "h",
      "t": "Certificaten: een resultaat met een foutgrens"
    },
    {
      "k": "p",
      "t": "Voor resultaten die het toelaten, probeert Stabileo ook op de achtergrond een certificaat te maken: een grens, berekend met intervalrekenen, die de exacte oplossing bevat van het stelsel dat is opgelost. Als dat niet lukt, wordt het resultaat als niet-gecertificeerd gemarkeerd, met de reden. De grens betreft de numerieke fout, niet de discretisatiefout van het elementennet of de tijdstap. Voor lineaire analyse, combinaties, modale analyse en plastisch bezwijken is de kernwiskunde van die grens bewezen in Lean, een bewijsassistent waarin de computer elke stap controleert; sommige stappen (randvoorwaarden, één voorwaarde van de modale controle) zijn nog niet geformaliseerd. P-Delta-, spectrale, harmonische en tijdsdomeinanalyses hebben ook certificaten, maar hun wiskunde is nog niet in Lean geformaliseerd. Continuous integration weigert elk onvolledig bewijs en elk toegevoegd axioma, en bij sommige soorten certificaten is de controle die draait precies de Lean-code waar de bewijzen over gaan."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": certificateFigureAlt,
      "caption": "Een opgelost raamwerk: de grens van het certificaat op de verplaatsingsfout en de end-to-end-controle, onder Resultaatcontroles."
    },
    {
      "k": "h",
      "t": "Wat de certificaten niet zeggen"
    },
    {
      "k": "ul",
      "items": [
        "Een certificaat begrenst de fout bij het oplossen van het stelsel zoals het is geassembleerd. Het bewijst niet dat het stelsel het model weergeeft: de assemblage van de stijfheidsmatrix en de belastingen wordt op de bovenstaande manieren getest, maar niet gecertificeerd. Toen wringknik ontbrak (SA-2026-007), certificeerde het certificaat het verkeerde probleem. Sinds 0.3.0 assembleren end-to-end-certificaten het stelsel onafhankelijk opnieuw voor raamwerken en vakwerken en toetsen ze het resultaat aan het model zelf; schalen, volumes en connectoren zijn nog niet gedekt.",
        "Lean bewijst de wiskunde; dat de Rust-code precies dat algoritme implementeert, is niet bewezen, behalve voor de controles die Lean-code zijn.",
        "De gecertificeerde ontwerptoetsingen evalueren hun formules met intervalrekenen, maar de formules zelf zijn niet geformaliseerd: ze worden vergeleken met gepubliceerde uitgewerkte voorbeelden waar die bestaan, en de dekking van elke norm (welke artikelen, welke voorbeelden) staat in de rijpheidsmatrix. Metselwerk, verbindingen, funderingen en gebruiksgrenstoestand zijn niet gecertificeerd.",
        "Geen enkele verificatie van het programma verifieert het model. Belastingen, opleggingen en idealisering zijn beslissingen van de ingenieur; de modelcontrole waarschuwt voor veelvoorkomende fouten, maar vervangt het oordeel niet.",
        "Er is nog geen onafhankelijke beoordeling geweest door een bevoegd constructeur. Resultaten van CIRSOC 301 zijn nog als experimenteel gemarkeerd."
      ]
    },
    {
      "k": "h",
      "t": "AI maakt concepten en beoordeelt; ze rekent niet"
    },
    {
      "k": "p",
      "t": "De AI-assistent maakt modellen op basis van een beschrijving en beoordeelt bestaande, maar berekent geen resultaten: de getallen komen van de solver en de ontwerptoetsingsmodules van de applicatie. Haar uitleg is tekst van een taalmodel en kan fout zijn; de waarden die tellen zijn die in de resultaten. Voordat een wijziging wordt toegepast, toont ze wat ze gaat aanpassen, en het kan in één stap ongedaan worden gemaakt. De AI-functies sturen de beschrijving en het model naar een server die een taalmodel raadpleegt; de solver, de resultaten en de controles hebben dat niet nodig en werken offline."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Waarom een AI-agent niet zou moeten rekenen, met een uitgewerkt geval:"
    },
    {
      "k": "h",
      "t": "Wanneer iets misgaat"
    },
    {
      "k": "p",
      "t": "Defecten die resultaten kunnen hebben beïnvloed die al in gebruik zijn, worden gepubliceerd als veiligheidsberichten, met hoe je een getroffen model herkent en wat je intussen moet doen; andere veiligheidsdefecten worden beoordeeld en toegevoegd wanneer ze er aanleiding toe geven. Open berichten worden gesloten wanneer de oplossing live staat op stabileo.com."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "De gepubliceerde berichten en hun status:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/TRUSTED_BASE.md",
      "label": "Vertrouwde basis van de certificaten",
      "t": "Wat is bewezen, wat is getest en wat wordt vertrouwd, onderdeel voor onderdeel:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Rijpheidsmatrix van de verificatie",
      "t": "Voor elke analyse, elk element en elke ontwerpnorm: het verificatieniveau dat is bereikt en het bewijs:"
    }
  ]
};

export default body;
