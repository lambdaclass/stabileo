import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Als een resultaat verandert: resultatenversies, nieuwe controles en berichten",
  "excerpt": "Hoe Stabileo je vertelt welke van je projecten een fix raakt, hoe het een resultaat dat het fout weet te kunnen zijn achterhoudt totdat de fix er is, en hoe de fix wordt gepubliceerd, met de veertien resultatenversies die op 4 en 5 november zijn samengevoegd.",
  "blocks": [
    {
      "k": "p",
      "t": "Elke fix in een constructiesolver verandert een getal dat iemand misschien al heeft gebruikt. Een knikfactor die te hoog was is nu lager; een model dat vroeger werd opgelost wordt nu geweigerd. Een fix die stilletjes in de app terechtkomt laat het oude getal staan in berekeningen die al zijn ingeleverd, en de ingenieur die ze maakte heeft geen reden om opnieuw te kijken."
    },
    {
      "k": "p",
      "t": "Dit bericht beschrijft wat Stabileo daaraan doet, vanaf het moment dat een fout wordt gevonden tot het moment dat de fix wordt gepubliceerd. De voorbeelden zijn echt: op 4 en 5 november 2026 bereikten veertien resultatenversies, 16 tot 29, stabileo.com."
    },
    {
      "k": "h",
      "t": "Wat een resultatenversie is"
    },
    {
      "k": "p",
      "t": "Een resultatenversie is een geheel getal, los van de appversie. Het gaat met één omhoog telkens wanneer een wijziging de site bereikt waardoor hetzelfde opgeslagen model andere getallen geeft, of een model weigert dat vroeger werd opgelost. Elke wijziging van die soort wordt geregistreerd met:"
    },
    {
      "k": "ul",
      "items": [
        "de versie waarmee ze binnenkwam, haar datum en haar pull requests;",
        "welke modellen ze raakt, geschreven als modelkenmerken: een vlak model met randvoorwaarden, een 2D-knikberekening met belastingen langs staven, een betonstaaf getoetst volgens CIRSOC 201;",
        "een titel en een uitleg voor de ingenieur in elk van de zes talen van de app, met wat je opnieuw moet controleren;",
        "een link naar het volledige verslag: een veiligheidsbericht, een melding over gewijzigde resultaten of het wijzigingslogboek."
      ]
    },
    {
      "k": "p",
      "t": "Elke berekening stempelt het project met de resultatenversie die het opleverde, samen met de appversie, de commit, de versie van de rekenkern, een hash van het binaire bestand van de rekenkern en de analyses die zijn uitgevoerd. De stempel reist mee met het project: een opgeslagen bestand, een autosave, een open tabblad of een gedeelde link dragen hem allemaal."
    },
    {
      "k": "note",
      "t": "Een resultatenversie wordt nooit hergebruikt. Elke merge naar de hoofdbranch wordt uitgerold en stempelt wat hij berekent met de huidige versie, dus een invoer die wordt toegevoegd aan een versie die al op de site staat zou de projecten die die versie stempelde nooit bereiken. Een test faalt bij zo'n toevoeging."
    },
    {
      "k": "h",
      "t": "Waarom een versie verandert"
    },
    {
      "k": "p",
      "t": "De meeste wijzigingen zijn fixes: een resultaat was fout en is nu goed. Sommige zijn weigeringen: een model dat vroeger een getal gaf, geeft nu een duidelijke melding, omdat het getal niets betekende. En een versie kan ook iets ongedaan maken: versie 15 trok drie wijzigingen van versie 14 in waarvan de reviewfixes de site niet samen met hen hadden bereikt, en de versies 27 tot 29 brachten ze terug, beoordeeld. Een project dat met versie 14 is berekend krijgt over beide een melding."
    },
    {
      "k": "table",
      "caption": "Resultatenversies 16 tot 29, samengevoegd op 4 en 5 november 2026.",
      "head": [
        "Versie",
        "Wijziging",
        "Soort"
      ],
      "rows": [
        [
          "16",
          "Aluminium: dwarskracht om de zwakke as wordt getoetst",
          "Fix"
        ],
        [
          "17",
          "Staalverbindingen: momenten om de zwakke as worden niet meer genegeerd",
          "Weigering"
        ],
        [
          "18",
          "ACI 318 en EN 1992: betonstaven met torsie worden gemarkeerd als niet getoetst",
          "Weigering"
        ],
        [
          "19",
          "Kolommen van gewapend beton worden ook getoetst onder hun kleinste drukkracht (SA-2026-041)",
          "Fix"
        ],
        [
          "20",
          "Belastinggenerator: een vloer die deels onder een laag dakconstructiedeel ligt houdt zijn oppervlaktebelastingen (SA-2026-033)",
          "Fix"
        ],
        [
          "21",
          "Geëxporteerde schaalfiguren tonen het veld en de schaal van het scherm",
          "Fix"
        ],
        [
          "22",
          "2D: een mechanisme achter een starre verbinding of een diafragma wordt geweigerd",
          "Weigering"
        ],
        [
          "23",
          "2D-knik van staven waarvan de normaalkracht langs hen varieert (SA-2026-042)",
          "Fix"
        ],
        [
          "24",
          "3D corotationele analyse met grote rotaties om meerdere assen (SA-2026-037)",
          "Fix"
        ],
        [
          "25",
          "Randvoorwaarden van een 2D-model uitgesneden uit een Y–Z- of X–Y-vlak (SA-2026-036)",
          "Fix"
        ],
        [
          "26",
          "De maatgevende waarde van een staaf en de 2D-omhullende lezen de ware piek",
          "Fix"
        ],
        [
          "27–29",
          "Drie Basic-wijzigingen die door versie 15 waren ingetrokken komen terug, beoordeeld: plastisch bezwijken, P-Δ en het teken van momenteninvloedslijnen",
          "Fix"
        ]
      ]
    },
    {
      "k": "h",
      "t": "De melding voor een nieuwe controle"
    },
    {
      "k": "p",
      "t": "Wanneer een project wordt geopend, vergelijkt de app zijn stempel met het register en toont ze de wijzigingen sindsdien die dat model raken. Een vlak raamwerk met een knikberekening hoort over de 2D-knikfix; een staalraamwerk zonder beton hoort niet over de toetsing van betonkolommen. De lijst is geen toast die verdwijnt: de melding heeft geen sluitknop, negeert Escape en klikken erbuiten, en wordt alleen gesloten door “Ik heb deze wijzigingen gelezen” aan te vinken en te kiezen om door te gaan of opnieuw te berekenen."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic opent een vlak raamwerk uit de voorbeelden, opgeslagen als berekend met resultatenversie 15. Een dialoogvenster met de titel “Results have changed since this project was last solved” toont de wijzigingen die het raken, onder andere de 2D-knikfix voor staven waarvan de normaalkracht varieert en de maatgevende waarde gelezen op de ware piek, elk met zijn uitleg, en vraagt om “I have read these changes” aan te vinken voordat je doorgaat of de analyse opnieuw uitvoert.",
      "caption": "Een vlak raamwerk berekend met versie 15, vandaag geopend: alleen de wijzigingen die dit model raken staan in de lijst, elk met wat je opnieuw moet controleren."
    },
    {
      "k": "p",
      "t": "Totdat het model opnieuw is berekend, zijn de resultaten als verouderd gemarkeerd: een banner zegt het, en elk rapport, elke werkmap en elke CSV die in de tussentijd wordt geëxporteerd drukt een STALE-waarschuwing af in zijn herkomst. “Analyse en ontwerp opnieuw uitvoeren” rekent opnieuw en toetst in PRO de betonstaven opnieuw met de wapening die al is gekozen; ze ontwerpt ze niet opnieuw, omdat dat de staven van de ingenieur zou overschrijven."
    },
    {
      "k": "p",
      "t": "Sinds 4 november (#1406) legt de melding elke wijziging uit in de taal van de lezer, in alle zes de talen van de app. Daarvoor kregen Duitse, Franse en Turkse lezers de titel en uitleg in het Engels: 66 van de 72 geregistreerde wijzigingen hadden geen tekst in die talen. Elke vertaling werd gecontroleerd door haar zonder het origineel terug te vertalen naar het Engels en de betekenis te vergelijken: getallen, tekens, welke belasting, welke toetsing, veilige of onveilige kant. Die controle corrigeerde zinnen in alle drie de talen, en liet zien dat vier Engelse uitleggen aan de bron dubbelzinnig waren; die zijn in alle zes de talen aangepast."
    },
    {
      "k": "h",
      "t": "Vóór de fix: waarschuwen of weigeren"
    },
    {
      "k": "p",
      "t": "Een fout wordt meestal gevonden vóór hij is opgelost, soms dagen ervoor. In die tijd staat het resultaat dat hij raakt nog op het scherm. De regel die we volgen is eerst inperken en daarna oplossen (issue #447): elke openstaande fout die een fout resultaat kan geven krijgt, bij elk toegangspunt dat hij raakt, een waarschuwing of een weigering."
    },
    {
      "k": "ul",
      "items": [
        "Een waarschuwing behoudt het resultaat en toont ernaast welke bekende kwestie het kan beïnvloeden en wat je met de hand moet controleren.",
        "Een weigering houdt het resultaat achter en zegt waarom, wanneer het getal met een grote factor fout kan zijn zonder dat je dat aan de uitvoer kunt merken, zoals een factor die meerdere malen verandert met de nummering van de staven."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met het voorbeeld van het verborgen mechanisme: een ligger met twee overspanningen op drie opleggingen die allemaal horizontaal rollen, onder een gelijkmatige belasting van 10 kN/m. Na Berekenen wordt geen lijn getekend; een rode melding in de hoek zegt “Unstable structure (mechanism): no horizontal restraint at any support.” met een knop om de kinematische analyse te bekijken.",
      "caption": "Dezelfde regel buiten het register: een model dat een mechanisme is krijgt een melding die zegt waarom, en geen getallen."
    },
    {
      "k": "p",
      "t": "De inperking wordt bijgehouden in een register dat elke openstaande veiligheidskwestie vermeldt, haar waarschuwing of weigering, de voorwaarde die haar activeert en de test die laat zien dat ze afgaat, of het bewijs dat geen inperking nodig is. Een test houdt het register en de lijst van bekende kwesties van de rekenkern in overeenstemming, en een geplande taak vergelijkt het register met de issues die op GitHub openstaan. De voorwaarden zijn met opzet smal: over de 39 modellen van het resultatencorpus gaat elke waarschuwing bij hooguit twee af. De pull request die dit register voor elke openstaande kwestie voltooit (#807) werd op 5 november samengevoegd, vóór release 0.5.0."
    },
    {
      "k": "p",
      "t": "Een inperking eindigt wanneer haar fix binnenkomt, en ze eindigt in dezelfde pull request. Deze week verwijderde #1295 de weigering van 3D-naar-2D-sneden die staven om de verkeerde as bogen, omdat de snede nu klopt; #1301 verving een waarschuwing bij elke 3D corotationele berekening door een die alleen afgaat wanneer een staafuiteinde meer dan 0,02 rad ten opzichte van zijn koorde draait, waar de resterende benadering ertoe kan doen."
    },
    {
      "k": "h",
      "t": "De fixes van deze week"
    },
    {
      "k": "p",
      "t": "2D-knik met normaalkrachtbelastingen langs staven (#1324, versie 23). De geometrische stijfheid van elke staaf gebruikte zijn gemiddelde normaalkracht. Waar de druk toeneemt naar het uiteinde dat het meest roteert, zoals onder zwaartekracht op een dakspant of bij een axiale puntlast binnen de overspanning, kwam de knikfactor te hoog uit en waarschuwde niets daarvoor. Elke staaf integreert nu zijn veranderlijke normaalkracht."
    },
    {
      "k": "table",
      "caption": "Eén staaf, λP·L²/EI. Bron: SA-2026-042.",
      "head": [
        "Geval",
        "Exact",
        "Voorheen",
        "Nu"
      ],
      "rows": [
        [
          "Console, druk oplopend van 0 bij de inklemming tot P aan de top",
          "3,477",
          "4,972 (+43 %)",
          "3,542 (+1,9 %)"
        ],
        [
          "Console, drukkracht P aan de top en een tegengestelde normaalkracht P op halve overspanning: druk P alleen van halve overspanning tot de top",
          "2,961",
          "4,972 (+68 %)",
          "3,056 (+3,2 %)"
        ],
        [
          "Euler's zware kolom, druk het grootst bij de inklemming",
          "7,837",
          "4,972 (−37 %)",
          "7,889 (+0,7 %)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "De resterende paar procent is de gewone discretisatiefout van één element per staaf, en ze neemt af naarmate de staaf wordt opgedeeld. P-Delta gebruikt nog steeds de gemiddelde normaalkracht, en 3D-knik met belastingen langs staven behoudt zijn waarschuwing tot zijn eigen fix."
    },
    {
      "k": "p",
      "t": "3D corotationele analyse (#1301, versie 24). Rotaties van staafuiteinden werden afgetrokken als rotatievectoren, wat alleen exact is wanneer alle rotaties dezelfde as delen. De Bathe–Bolourchi 45°-bocht kwam 1,3 % naast zijn gepubliceerde oplossing uit, en het net verfijnen bewoog hem van de referenties af, niet ernaartoe. Rotaties worden nu samengesteld als rotatiematrices: dezelfde bocht ligt binnen 0,4 % van twee onafhankelijke gepubliceerde oplossingen en convergeert tussen hen in. Een staaf waarvan de uiteinden meer dan 0,9π ten opzichte van elkaar draaien wordt geweigerd, omdat het resultaat niet kan zeggen welke hele draai wordt bedoeld."
    },
    {
      "k": "p",
      "t": "Een verborgen mechanisme in 2D (#1298, versie 22). Een starre verbinding of een diafragma vanuit een knoop waarvan alle staven scharnierend zijn aangesloten naar het uiteinde van een vakwerkstaaf is een mechanisme, maar de solver hield het vast met een piepkleine kunstmatige veer en gaf verplaatsingen van honderden kilometers terug, die het certificaat vervolgens certificeerde. Zo'n model wordt nu geweigerd. De fix stelde hiervoor geen veiligheidsbericht voor: in de gevonden gevallen waren de verplaatsingen absurd, rond 10⁵ m, en kwamen ze met de waarschuwing van de app voor een waarschijnlijk mechanisme. Dat is een oordeel over die gevallen, geen bewijs dat geen enkel getroffen resultaat aannemelijk leek. Wat fout was, was de bewering van het certificaat, en de versie-invoer vertelt de projecten die ze raakt. Een soortgelijk geval via een connector in plaats van een starre verbinding werd achteraf gevonden (#1414); de fix ervan (#1415) werd op 5 november samengevoegd."
    },
    {
      "k": "p",
      "t": "Een 3D-model naar 2D snijden (#1295). De snede gebruikte de traagheid om de sterke as van elke doorsnede voor elke staaf, dus kolommen in een Y–Z-snede, liggers in een X–Y-snede en staven die 90° waren gedraaid bogen om de verkeerde as: een portaal IPN 300 dat in Y–Z stond zwaaide in 2D 0,96 mm uit tegen 13,0 mm in 3D. Elke staaf buigt nu in 2D om de as waarom hij in 3D buigt, en sneden die een vlak model niet kan weergeven worden geweigerd. Deze fix heeft geen resultatenversie, en dat is bewust: een opgeslagen 2D-model rekent precies zoals voorheen, omdat wat fout was het model was dat de snede opleverde. De melding voor een nieuwe controle kan die bestanden niet bereiken, dus het veiligheidsbericht (SA-2026-035) is het kanaal: snijd het model opnieuw uit 3D, of bereken het in 3D."
    },
    {
      "k": "h",
      "t": "Na de fix: veiligheidsberichten"
    },
    {
      "k": "p",
      "t": "Een fout die in een uitgebrachte versie een fout of onveilig resultaat kon opleveren krijgt een veiligheidsbericht: wat er fout was, welke modellen het raakt, hoe je ze herkent, wat je moet controleren in resultaten die al zijn geleverd, en het geval dat het reproduceert. De berichten voor de fixes van deze week zijn nu in de repository opgesteld en worden met release 0.5.0 gepubliceerd, zoals SA-2026-001 tot 024 dat met 0.3.0 en 0.4.0 werden."
    },
    {
      "k": "table",
      "caption": "Berichten opgesteld voor de fixes die op 4 en 5 november 2026 zijn samengevoegd.",
      "head": [
        "Bericht",
        "Wat er fout was",
        "Ernst"
      ],
      "rows": [
        [
          "SA-2026-033",
          "De belastinggenerator liet de oppervlaktebelastingen van een vloer weg wanneer één lage staaf boven een deel ervan stond",
          "Hoog"
        ],
        [
          "SA-2026-034",
          "De evenwichtscontrole kwam overeen voor gevallen waarbij de controle belastingen wegliet",
          "Gemiddeld"
        ],
        [
          "SA-2026-035",
          "3D-naar-2D-snede boog staven om de verkeerde doorsnedeas",
          "Hoog"
        ],
        [
          "SA-2026-036",
          "3D-naar-2D-snede op Y–Z of X–Y las de randvoorwaarden alsof het raamwerk in X–Z stond",
          "Hoog"
        ],
        [
          "SA-2026-037",
          "3D corotationele analyse trok rotatievectoren af",
          "Gemiddeld"
        ],
        [
          "SA-2026-040",
          "Toetsingen volgens ACI 318 en EN 1992 lieten betonstaven slagen zonder hun torsie te toetsen",
          "Hoog"
        ],
        [
          "SA-2026-041",
          "De toetsing van de kolom van gewapend beton combineerde alleen het grootste moment met de grootste drukkracht",
          "Hoog"
        ],
        [
          "SA-2026-042",
          "2D-knik overschatte de factor van staven waarin de druk het grootst is waar de knikvorm de grootste dwarshelling heeft",
          "Hoog"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "De pagina met het wijzigingslogboek van Stabileo op de website: de nieuwste invoer eerst, van 6 november, met de titel “Wrong results fixed in design checks and dynamics, corrected generated loads, and PRO’s analysis mode completed”, die opent met de wijzigingen aan de rekenkern, en links filters per gebied.",
      "caption": "De pagina met het wijzigingslogboek, nieuwste eerst, openend met de fixes van deze week die resultaten veranderen."
    },
    {
      "k": "h",
      "t": "Wat dit niet doet"
    },
    {
      "k": "ul",
      "items": [
        "De melding kent alleen geregistreerde wijzigingen. Een fout die nog niet is gevonden staat in geen enkel register; daar is de verificatie achter de solver voor, en dat dekt de inperking zodra er iets is gevonden.",
        "Ze leest de kenmerken van het model uit het opgeslagen bestand, en wanneer ze het niet kan bepalen, telt ze het kenmerk als aanwezig: één melding te veel is beter dan een wijziging die wordt verborgen voor het model dat ze raakt.",
        "Ze kan een getal niet volgen zodra het de app verlaat, in een tekening, een spreadsheet of een rapport dat al is geleverd. Daar is het veiligheidsbericht voor.",
        "Ingeperkt, geweigerd of opgelost, het resultaat is nog steeds aan de ingenieur om te controleren voordat het wordt ondertekend."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Elk gepubliceerd bericht, met wat je bij elk opnieuw moet controleren:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "Melding voor nieuwe controle, herkomst en reproduceerbaarheid",
      "t": "Hoe resultatenversies, stempels en de melding werken, in detail:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index van veiligheidsberichten",
      "t": "De berichten, inclusief de concepten voor 0.5.0:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "Issue #447: eerst inperken, daarna oplossen",
      "t": "Het inperkingsbeleid en de voortgang ervan:"
    }
  ]
};

export default body;
