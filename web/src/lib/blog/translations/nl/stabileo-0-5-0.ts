import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0: 23 nieuwe veiligheidsberichten; elk open probleem met foute resultaten waarschuwt of weigert",
  "excerpt": "Wat er sinds 0.4.0 is veranderd: drieëntwintig fouten die een onjuist of onveilig resultaat konden geven, uitgeschreven als veiligheidsberichten. Daarvan zijn er 21 opgelost, is de torsietoets onvolledig en blijft 2D plastisch bezwijken geweigerd; een waarschuwing of een weigering voor elke fout die nog openstaat; en de stap-voor-stap-cursus in Basic.",
  "blocks": [
    {
      "k": "p",
      "t": "Sinds 0.4.0 bleven we Stabileo van meerdere kanten tegelijk controleren: de solver tegen gepubliceerde oplossingen en andere programma’s, de toetsingen tegen uitgewerkte voorbeelden, dezelfde constructie opnieuw genummerd, geschaald en verplaatst, en de bestanden die eerdere releases hebben opgeslagen. Dat leverde nog drieëntwintig fouten op die een onjuist of onveilig resultaat konden geven. Voor elke fout is er een veiligheidsbericht dat zegt wat er mis was, wie het raakt en wat je opnieuw moet controleren. Eenentwintig zijn opgelost. De torsietoets is als onvolledig gemarkeerd (SA-2026-040); 2D plastisch bezwijken (SA-2026-044) blijft geweigerd tot #758 is opgelost."
    },
    {
      "k": "note",
      "t": "stabileo.com publiceert elke wijziging zodra die is samengevoegd, dus de meeste van deze oplossingen zijn al live, elk vanaf de dag dat het is samengevoegd. Projecten die zijn opgeslagen vóór een wijziging die ze raakt, vragen bij het openen om een nieuwe controle, in de taal van de lezer. Twee oplossingen kunnen dat niet: een 2D-model dat vóór #1295 uit 3D is gesneden, opent zonder melding, omdat het model zelf fout was (SA-2026-035). Snij het opnieuw uit 3D, of bereken het in 3D. Hetzelfde geldt voor een rechthoek of buis die vóór #1310 uit Excel of IFC is geïmporteerd (SA-2026-039): importeer die opnieuw."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic opent een vlak raamwerk uit de voorbeelden, opgeslagen als berekend met resultatenversie 15. Een dialoogvenster met de titel “Resultaten zijn veranderd sinds dit project voor het laatst is berekend” somt de wijzigingen op die het raken, onder andere de 2D-knikcorrectie voor staven waarvan de normaalkracht varieert en de maatgevende waarde die op de werkelijke piek wordt afgelezen, elk met uitleg, en vraagt om “Ik heb deze wijzigingen gelezen” aan te vinken voordat je doorgaat of de analyse opnieuw uitvoert.",
      "caption": "Een project dat is opgeslagen vóór een wijziging die het raakt, vraagt bij het openen om een nieuwe controle en toont elke wijziging."
    },
    {
      "k": "h",
      "t": "Voer je projecten opnieuw uit"
    },
    {
      "k": "p",
      "t": "Dit zijn de gevallen die een ontwerpresultaat het meest verschuiven. Elk veiligheidsbericht bevat het uitgewerkte geval en wat je moet doen met resultaten die je al hebt opgeleverd."
    },
    {
      "k": "table",
      "caption": "Een aantal oplossingen van 0.5.0, zoals elk veiligheidsbericht ze beschrijft, met de resultatenversie waarin elke oplossing is doorgevoerd; SA-2026-035 heeft er geen, dus het bericht is daar de enige melding.",
      "head": [
        "Veiligheidsbericht",
        "Resultatenversie",
        "Wat er mis was",
        "Ernst"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "3D-toetsingen lazen het zijdelingse moment of de zijdelingse dwarskracht: een CIRSOC 201-kolom met buiging om Mz werd over zijn hoogte getoetst, 36 % te weinig staal in een voorbeeld",
          "Kritiek"
        ],
        [
          "SA-2026-028",
          "8",
          "EN 1992-1-1-buiging ging ervan uit dat het trekstaal vloeit: MRd tot 22 % te hoog",
          "Hoog"
        ],
        [
          "SA-2026-030",
          "12",
          "CIRSOC 301 druk: een doorsnede met Qa ≤ 0 kreeg een capaciteit boven zijn volledige plastische drukkracht, en voldeed",
          "Hoog"
        ],
        [
          "SA-2026-041",
          "19",
          "De toetsing van de kolom van gewapend beton combineerde het grootste moment alleen met de grootste drukkracht: tot 15 % onveilig in een voorbeeld",
          "Hoog"
        ],
        [
          "SA-2026-042",
          "23",
          "2D-knik overschatte de factor van staven waarvan de drukkracht langs de staaf toeneemt: +43 % tot +68 % voor één staaf",
          "Hoog"
        ],
        [
          "SA-2026-038",
          "35",
          "3D-knik gebruikte de gemiddelde normaalkracht van elke staaf: +43 % op de factor van één staaf met een belasting langs de staaf",
          "Hoog"
        ],
        [
          "SA-2026-043",
          "32",
          "Harmonische analyse verloor de correctie van de weggelaten eigenvormen wanneer één eigenvorm veel slapper was dan de rest: 79 keer ernaast bij 2.3 Hz in een voorbeeld",
          "Hoog"
        ],
        [
          "SA-2026-035",
          "—",
          "Een 3D-naar-2D-snede liet staven buigen om de verkeerde doorsnedeas: een Y–Z-portaal 13.5 keer te stijf",
          "Hoog"
        ],
        [
          "SA-2026-033",
          "20",
          "De belastinggenerator liet de volledige vlaktebelasting van een verdieping weg wanneer één lage staaf over een deel ervan stond",
          "Hoog"
        ],
        [
          "SA-2026-027",
          "11",
          "De omhullende van schalen hield de combinatie met de grootste Von Mises aan, niet het uiterste van elke component: mx 14 % te laag in een voorbeeld",
          "Hoog"
        ],
        [
          "SA-2026-047",
          "49",
          "In een model met schalen verloor een belastinggeval dat een oplegverplaatsing oplegde al zijn schaalspanningen, waardoor combinaties en omhullenden alleen de schaalspanningen van de andere gevallen optelden: de gecombineerde schaalspanningen konden onveilig zijn, zonder waarschuwing. In 0.2.0, 0.3.0 en 0.4.0 (#1676)",
          "Hoog"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Elk project met schalen dat vóór #1676 is berekend, noemt SA-2026-047 bij het openen (#1691): als geraakt wanneer het model een belastinggeval heeft dat een oplegverplaatsing oplegt en belastingcombinaties, en anders als mogelijk geraakt, omdat een opgeslagen project niet kan aantonen dat het zo’n belastinggeval nooit heeft gehad. Opnieuw berekenen haalt de melding weg; vergelijk daarna de schaalspanningen van de combinaties waarin dat geval zit."
    },
    {
      "k": "p",
      "t": "De andere veiligheidsberichten gaan over betonnen elementen met wringing volgens ACI 318 en EN 1992 (SA-2026-040), de randvoorwaarden van een model dat vanuit een Y–Z- of X–Y-vlak naar 2D is gesneden (SA-2026-036), 3D co-roterende analyse met grote rotaties (SA-2026-037), een belasting op t = 0 op een massaloze vrijheidsgraad in tijdsdomeinanalyse (SA-2026-031), de nul-eigenvorm van een mechanisme in modale analyse (SA-2026-032), de evenwichtscontrole van het rapport na de analyse (SA-2026-034), 2D plastisch bezwijken, dat geweigerd blijft tot #758 is opgelost (SA-2026-044), 3D plastisch bezwijken met een staaf zonder bruikbaar plastisch moment, nu geweigerd (SA-2026-045), harmonische analyse die per belasting koos tussen modale superpositie en de directe oplossing, waardoor de superpositie fout ging (SA-2026-046), rechthoeken en buizen die uit Excel of IFC zijn geïmporteerd met verwisselde Iy en Iz (SA-2026-039) en, voor wie de rekenkern rechtstreeks aanroept, staalafschuiving zonder afschuifoppervlak volgens AISC 360 en EN 1993 (SA-2026-025 en 026)."
    },
    {
      "k": "h",
      "t": "Andere wijzigingen die resultaten verschuiven"
    },
    {
      "k": "p",
      "t": "Andere wijzigingen verschuiven ook getallen, dus elke wijziging staat in de melding voor een nieuwe controle; de meeste hebben geen eigen veiligheidsbericht, en de modale nul-eigenvorm is SA-2026-032 hierboven:"
    },
    {
      "k": "ul",
      "items": [
        "De maatgevende waarde van een staaf en de 2D-omhullende lezen de werkelijke piek van de lijn af, niet de dichtstbijzijnde van 21 posities: ze kunnen stijgen, met 0,23 % onder een driehoeksbelasting en 1,05 % onder een korte partiële belasting in de gedocumenteerde gevallen, en nooit dalen.",
        "Mechanismen worden geweigerd in plaats van berekend: achter een stijve koppeling of een schijf in 2D, achter een verbinding in 2D (#1415) en in modale analyse, die vroeger de nul-eigenvorm liet vallen en de andere als volledig teruggaf, inclusief een mechanisme dat langs schuine opleggingen glijdt.",
        "3D materieel niet-lineaire analyse berekent raamwerken met en zonder welfconstante naast elkaar, en knopen die alleen door vakwerken worden bereikt, in plaats van te crashen of ze te weigeren; modellen die eerder werden berekend, geven dezelfde getallen.",
        "Herhaalde eigenwaarden behouden hun multipliciteit, en statische en modale resultaten controleren hun eigen evenwicht en orthogonaliteit voordat ze worden getoond.",
        "In Basic splitsen P-Δ en de kritieke last elke staaf in elementen, sluit plastisch bezwijken scharnieren die ontlasten, en neemt de invloedslijn van het buigend moment een doorbuigend moment als positief, net als elk ander moment in Basic.",
        "Een toetsing die niet kan worden geëvalueerd, wordt geweigerd in plaats van te voldoen, en een slappe maar echte knooprotatie wordt niet langer vergrendeld wanneer het model een veel stijver deel heeft.",
        "Lineaire analyse waarschuwt wanneer een rotatie 0.1 rad overschrijdt, ook binnen de overspanning van een staaf (inclusief de helling die afschuifvervorming aan de as toevoegt en de kromming van een temperatuurgradiënt bij een vrijgemaakt uiteinde, #1569) en op de eigen verplaatsingen van een combinatie, en wanneer drukkracht de momenten met meer dan 10 % kan versterken; zolang die tweede waarschuwing getoond wordt, worden de CIRSOC 301-toetsingen vastgehouden. Waar een rotatie wordt gewaarschuwd, voer je een geometrisch niet-lineaire analyse (grote rotaties) uit; waar de versterking wordt gewaarschuwd, een P-Δ- of andere tweede-orde-analyse."
      ]
    },
    {
      "k": "h",
      "t": "Gewaarschuwd of geweigerd, totdat elke oplossing er is"
    },
    {
      "k": "p",
      "t": "Elk openstaand probleem dat een onjuist resultaat kan geven, heeft nu een waarschuwing of een weigering op elke plek waar het de ingenieur kan bereiken (#807). Een waarschuwing behoudt het resultaat en noemt het probleem ernaast; een weigering houdt het resultaat achter en zegt waarom. Een register in de repository somt elk openstaand veiligheidsprobleem op met zijn waarschuwing of weigering, de voorwaarde die het activeert en de test die bewijst dat het afgaat, en een test houdt het in overeenstemming met de rekenkern."
    },
    {
      "k": "ul",
      "items": [
        "Geweigerd: de 2D-factor voor plastisch bezwijken, die tot 4.6 keer kan veranderen met de nummering, de richting van staven en de eenheden (#758); een knikfactor buiten de grenzen van zijn eigen certificaat (#741); MITC4-schalen op vervormde elementennetten onder aanzienlijke buiging in het vlak (#798); en MITC4- en MITC9-schalen op gedraaide geometrie (#1057).",
        "Gewaarschuwd: onder andere tijdsdomeinanalyse, 3D modale superpositie, bijna singuliere modellen, contact, materieel niet-lineaire analyse en verbindingen met ongelijke stijfheden.",
        "Behalve wat het weigert, verandert de beperking één getal: de 2D-reactie van een scharnierende oplegging die ook een veer in de vastgehouden richting draagt, bevat nu de kracht van die veer. Elke andere waarde van de 145.515 in het resultatencorpus is identiek."
      ]
    },
    {
      "k": "note",
      "t": "Twee weigeringen nemen resultaten weg die sommige lezers gebruiken. Factoren voor plastisch bezwijken van vlakke raamwerken worden achtergehouden tot #758 is opgelost. Sommige vervormde schaalnetten waarvan de resultaten binnen 2 % van hun referenties lagen, worden ook achtergehouden: we kozen liever voor een weigering te veel dan voor een onjuiste stijfheid die zonder waarschuwing wordt getoond, en het verkleinen daarvan staat op de roadmap."
    },
    {
      "k": "h",
      "t": "Ook in 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Basic leert constructieanalyse stap voor stap: statica, de krachten- en verplaatsingsmethode, invloedslijnen, tweede orde en knik, plastische analyse en dynamica, elk stap voor stap uitgelegd in de app. De eenheid over plastisch bezwijken wordt achtergehouden met de rest van 2D plastisch bezwijken tot #758 is opgelost.",
        "Duits, Frans en Turks worden weer aangeboden.",
        "De AI-assistent werkt met je eigen Anthropic- of OpenAI-sleutel, die alleen in je browser wordt bewaard, en /tools heeft live modellen die de rekenkern opnieuw berekent wanneer een schuifregelaar beweegt.",
        "PRO: hoofd- en vergelijkbare verdiepingen, plaatresultaten per eenheidsbreedte met hoofdmomenten en richtingen, het rapport na de analyse, een alleen-lezenweergave met “Dupliceren en bewerken” en een gekoppelde IFC die als 3D-referentie wordt getekend.",
        "Bestanden die zijn opgeslagen door 0.2.0, 0.3.0 en 0.4.0 openen, migreren en geven bij elke wijziging dezelfde resultaten, behalve waar een geregistreerde resultaatwijziging van toepassing is; een bestand dat door een nieuwere versie is opgeslagen, wordt geweigerd met een bericht dat dat zegt.",
        "Na een eenhedenconversie of hernummering moeten dezelfde fysieke resultaten volgen, gecontroleerd over 17 analysetypen bij elke wijziging en op 8.192 gegenereerde modellen elke nacht.",
        "Ook opgelost: grond-constructie-interactie rapporteert zijn opleggingsreacties, die het vroeger leeg teruggaf (#1675); schalen van twee families met dezelfde nummering worden door de combinaties en omhullenden geweigerd in plaats van dat de ene in plaats van de andere wordt gecombineerd (#1669); en von Mises- en hoofdspanningen van schalen lopen bij extreme ordes van grootte niet meer over of onder, met bitidentieke resultaten in het normale bereik (#1688).",
        "Een project dat is berekend met een versie die een bekende fout met een onjuist resultaat had in een functie die het gebruikt, noemt het veiligheidsbericht totdat het opnieuw wordt berekend (#1657), en projecten leggen elke analyse vast die ze hebben uitgevoerd, zodat een veiligheidsbericht over één analyse blijft staan totdat die analyse opnieuw wordt uitgevoerd (#1663).",
        "Sneller: de automatische opslag elke 30 s slaat een ongewijzigd project over (#1664), een grote 3D-werkruimte heropent met minder afval om op te ruimen (#1668), en gepubliceerde 3D-resultaten worden bevroren zodat de weigeringscontrole voor bekende problemen één keer per resultaat draait (#1689).",
        "Meer controles van de rekenkern: reciprociteit met momenten, gefactoreerde combinaties en superpositie van elke schaalspanningscomponent (#1665), en één resultaatrecord per knoop, oplegging, element en schaal voor elke analyse (#1674), wat de hierboven genoemde SSI- en schaalcombinatiefouten vond.",
        "Stabileo Research en Stabileo Tools: uitvoerbare reproducties van gepubliceerde artikelen en benchmarks, herzien na een ronde met drie beoordelaars, en gratis rekenhulpen die op dezelfde rekenkern draaien."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Hoe veiligheidsberichten werken, en de eerste vierentwintig:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Overzicht van veiligheidsberichten",
      "t": "Elk veiligheidsbericht, met zijn ernst, issue en oplossing:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Wijzigingslogboek",
      "t": "Het volledige technische verslag:"
    }
  ]
};

export default body;
