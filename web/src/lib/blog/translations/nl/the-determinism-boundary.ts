import type { PostBody } from '../../types';

const body: PostBody =  {
  "title": "De determinismegrens: waarom een AI-agent de rekensom niet mag doen",
  "excerpt": "Een taalmodel kan niet garanderen dat een getal juist is. In de architectuur die we voor de constructietechniek voorstellen, interpreteert en stelt de agent voor, en komt elk getal van een geverifieerde solver.",
  "blocks": [
    {
      "k": "p",
      "t": "Tientallen jaren commerciële software hebben het zuiver numerieke deel van constructieanalyse snel gemaakt. Een stijfheidsmatrix assembleren en een lineair stelsel oplossen is een goed begrepen probleem, en een goedkoop om te berekenen. De tijd van de ingenieur gaat elders heen: het model opbouwen, het opnieuw opbouwen elke keer dat de architectuur verandert, belastingen en combinaties definiëren, elk element toetsen aan de ontwerpnorm en het rekenrapport en de tekeningen maken."
    },
    {
      "k": "p",
      "t": "De bottleneck is dat handwerk rond de berekening. Het model opbouwen, wijzigen, toetsen en documenteren is waar een AI-agent kan helpen, onder één voorwaarde: ze mag de berekening zelf nooit aanraken."
    },
    {
      "k": "h",
      "t": "Wat een taalmodel niet kan garanderen"
    },
    {
      "k": "p",
      "t": "Een taalmodel genereert tekst probabilistisch. Het heeft geen kennis van natuurkunde of van hoe echte systemen zich gedragen, en het kan hallucineren: antwoorden geven die aannemelijk klinken en nergens op slaan. In constructieanalyse is het risico concreet. Modelleren vereist ruimtelijk redeneren en topologische consistentie, en wanneer een model in meerdere stappen wordt opgebouwd, stapelen fouten zich op."
    },
    {
      "k": "p",
      "t": "De sterkste beperking komt echter uit de beroepspraktijk. Elk constructief resultaat wordt ondertekend, met de auteurschap en wettelijke aansprakelijkheid die bij een handtekening horen. Het getal dat een kolom dimensioneert, is een verbintenis van de bevoegde ingenieur die het goedkeurt. Een agent die ongecontroleerde resultaten aanreikt, laat de professional het risico dragen een berekening te ondertekenen die niemand heeft geverifieerd."
    },
    {
      "k": "quote",
      "t": "Juistheid moet een eigenschap van de solver zijn, niet van de taal."
    },
    {
      "k": "h",
      "t": "De determinismegrens"
    },
    {
      "k": "p",
      "t": "De architectuur scheidt redeneren in natuurlijke taal van numerieke berekening. De agent stelt ontwerpen en scenario's voor, maar een resultaat telt pas als het uit een programma komt dat de agent niet kan wijzigen, een programma dat de fysica van het probleem codeert. Het model kiest welke deterministische tool het aanroept en met welke parameters, en werkt met wat de tool teruggeeft. Het produceert nooit een eigen getal en verzint nooit geometrie."
    },
    {
      "k": "p",
      "t": "In de praktijk zijn daarvoor drie lagen nodig. De intentielaag is de agent: ze interpreteert natuurlijke taal, stelt verduidelijkende vragen en geeft getypeerde acties af. De deterministische berekeningslaag bevat alles wat engineeringgegevens produceert: de solver, de CIRSOC-modules die de normtoetsingen uitvoeren en de generatoren die een constructietypologie uitwerken tot een compleet model. De documentatielaag maakt rapporten, tekeningen en hoeveelheidsstaten op basis van resultaten die al zijn berekend."
    },
    {
      "k": "p",
      "t": "Dit is geen nieuw patroon. Het domineert de recente literatuur over engineeringagenten en komt voor in aangrenzende vakgebieden: codeeragenten werken omdat een compiler en een testsuite hun vertellen of de code bouwt en slaagt, en AlphaProof bewijst stellingen omdat een formele verificatie geen enkele fout doorlaat. We nemen het bewust over als ontwerpprincipe."
    },
    {
      "k": "h",
      "t": "Wat de grens garandeert en wat erbuiten valt"
    },
    {
      "k": "p",
      "t": "Het helpt om specifiek te zijn over wat deze grens garandeert en wat ze buiten beschouwing laat. Wat ze garandeert:"
    },
    {
      "k": "ul",
      "items": [
        "Elk getal dat de agent noemt, is te herleiden tot een specifiek solverresultaat: combinatie, snede, element.",
        "Elke AI-uitvoer wordt vóór het importeren gevalideerd tegen het modelschema en afgewezen als hij onjuist is opgebouwd of onbekende velden bevat.",
        "Als de AI-dienst uitvalt, blijven de solver, de editor en de normtoetsingen werken."
      ]
    },
    {
      "k": "p",
      "t": "Wat ze niet garandeert: dat het geïdealiseerde model het juiste is voor het echte probleem (dat is een engineeringbeslissing), dat het ontwerp optimaal is, dat de belastingen en aannames volledig zijn of dat de lezing van de norm geen beoordeling nodig heeft."
    },
    {
      "k": "note",
      "t": "De grens laat je controleren waar elk resultaat vandaan komt; ze garandeert niet dat het model dat je opzet het echte probleem juist weergeeft. De agent werkt als een tekenassistent: ze stelt een wijziging voor, de gebruiker ziet een samenvatting van wat zal worden aangepast en kan die toepassen, opnieuw proberen of annuleren. Elke toegepaste wijziging is één stap ongedaan maken."
    },
    {
      "k": "h",
      "t": "Een geval waarin het model opnieuw moet worden berekend"
    },
    {
      "k": "p",
      "t": "De ingenieur beschrijft een gewapendbetonnen portaal met een overspanning van 6 m en een hoogte van 4 m, ingeklemde voeten en een verdeelde belasting op de ligger. De agent vraagt wat ontbreekt: staal of beton? Ingeklemde of scharnierende voeten? Enige horizontale belasting? Daarna geeft ze de actie af die het raamwerk aanmaakt. De backend werkt die deterministisch uit tot een model met 4 knopen, 3 elementen en 6 vrije vrijheidsgraden. Het ontwerp gebruikt H-21-beton, om mee te beginnen een ligger van 25×40 cm, kolommen van 30×30 cm en 30 kN/m op de ligger."
    },
    {
      "k": "p",
      "t": "Zodra het model is berekend, draagt elke kolom een verticale reactie van 90 kN en geldt het globale evenwicht exact: ΣRz = 180 kN = q·L. Het maatgevende liggermoment is Mu = 80,8 kN·m in het midden van de overspanning. De buigtoetsing van de ligger van 25×40 met 3Ø16 volgens CIRSOC 201 geeft een capaciteit van φMn = 73,3 kN·m, dus de ligger voldoet niet."
    },
    {
      "k": "img",
      "base": "blog/determinism-portal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met een betonnen portaal, 6 m breed en 4 m hoog op ingeklemde voeten, berekend onder 30 kN/m op de ligger. De momentenlijn toont 80,8 kN·m in het midden van de overspanning, −54,2 kN·m aan de liggeruiteinden en 27,0 kN·m aan de kolomvoeten.",
      "caption": "Het raamwerk uit deze sectie in Stabileo (H-21, kolommen 30×30, ligger 25×40): de solver geeft het hierboven genoemde moment van 80,8 kN·m in het midden van de overspanning."
    },
    {
      "k": "table",
      "caption": "Buigtoetsing van de raamwerkligger, vóór en na de correctie.",
      "head": [
        "Toestand",
        "Doorsnede",
        "Wapening",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Voldoet"
      ],
      "rows": [
        [
          "Initieel",
          "25×40 cm",
          "3Ø16",
          "80,8",
          "73,3",
          "1,10",
          "Nee"
        ],
        [
          "Gecorrigeerd",
          "30×55 cm",
          "3Ø16",
          "105,6",
          "108,6",
          "0,97",
          "Ja"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Kijk naar de kolom Mu. De ligger vergroten van 25×40 naar 30×55 verhoogt de vraag van 80,8 naar 105,6 kN·m. Voor dit symmetrische, gelijkmatig belaste veld geeft evenwicht M_midden − M_eind = 80,8 − (−54,2) = 135,0 kN·m = qL²/8. De stijfheid bepaalt hoe groot beide momenten afzonderlijk zijn. Een ligger die stijver is ten opzichte van zijn kolommen, krijgt minder inklemming van hen en gedraagt zich meer als een vrij opgelegde ligger, dus gaat zijn moment in het midden, dat hier maatgevend is, omhoog."
    },
    {
      "k": "quote",
      "t": "Een agent die het effect schatte zonder opnieuw te berekenen, zou het fout hebben, en zou daarbij net zo overtuigend klinken."
    },
    {
      "k": "p",
      "t": "Het voorbeeld laat zien waarom het model opnieuw moet worden berekend, bovenop het herberekenen van de capaciteit van de nieuwe doorsnede. In een onbepaalde constructie verandert het vergroten van een doorsnede hoe de snedekrachten worden verdeeld, en kan de vraag stijgen in precies de staaf die je wilde ontlasten."
    },
    {
      "k": "h",
      "t": "Een kolom weghalen uit een gebouw dat al is ontworpen"
    },
    {
      "k": "p",
      "t": "Het tweede geval begint bij een raamwerk met vier velden van 5 m en drie verdiepingen van 3 m, ingeklemde voeten, liggers van 25×50 cm (4Φ16), kolommen van 35×35 cm en 25 kN/m op elke ligger: 20 knopen, 27 elementen en 45 vrije vrijheidsgraden. Na berekening en toetsing voldoet elke ligger ruimschoots."
    },
    {
      "k": "p",
      "t": "Een architectonische wijziging haalt een binnenkolom op de begane grond weg. De bewerkingsactie verwijdert hem met een validatie van de constructieve integriteit, en het model wordt opnieuw berekend; het globale evenwicht geldt ervoor en erna (ΣRz = 1500 kN). De liggers die door die kolom werden gedragen, overspannen nu 10 m en nemen, samen met de liggers die erboven in lijn liggen, de verloren oplegging over. Zes liggers overschrijden D/C = 1."
    },
    {
      "k": "table",
      "caption": "De maatgevende ligger van het gebouw in zijn drie toestanden.",
      "head": [
        "Toestand",
        "Doorsnede",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Voldoet"
      ],
      "rows": [
        [
          "Intact",
          "25×50 (4Φ16)",
          "54,2",
          "125,3",
          "0,43",
          "Ja"
        ],
        [
          "Kolom weggehaald",
          "25×50 (4Φ16)",
          "203,9",
          "125,3",
          "1,63",
          "Nee"
        ],
        [
          "Aangepast",
          "30×65 (5Φ20)",
          "189,8",
          "313,7",
          "0,61",
          "Ja"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Het moment van de maatgevende ligger vervierdubbelt bijna. Met 30×65 cm en 5Φ20 in de getroffen liggers en een nieuwe berekening voldoet elke ligger weer. Het geval laat ook zien dat een wijziging die met de hand betekent: opnieuw modelleren, opnieuw analyseren, opnieuw toetsen en veel staven opnieuw detailleren, in een kort gesprek kan worden afgehandeld, met elk getal herleidbaar tot de solver en onderworpen aan de goedkeuring van de ingenieur."
    },
    {
      "k": "h",
      "t": "Vier ontwerpbeslissingen achter de grens"
    },
    {
      "k": "ol",
      "items": [
        "Getypeerde acties in plaats van vrije codegeneratie. In verschillende eerdere systemen schrijft het model Python-scripts die vervolgens tegen een externe solver worden uitgevoerd. Hier is de uitvoer van de agent beperkt tot een gesloten verzameling aanroepen met expliciete invoer- en uitvoercontracten, elk gevalideerd tegen een schema voordat het wordt uitgevoerd. Die grens is smaller dan willekeurige code en makkelijker te auditen.",
        "Onze eigen solver, in plaats van een laag bovenop die van een ander. De engine is vanaf nul geschreven in Rust, zonder externe lineaire-algebraafhankelijkheden, en heeft een eigen verificatiesuite tegen analytische oplossingen en referentiebenchmarks: ongeveer 6.800 geslaagde tests, plus vergelijkingen met een commercieel programma op dezelfde modellen, met verschillen onder 0,1%.",
        "Native normconformiteit. Toetsingen aan CIRSOC 201 en 301, die we in geen enkele open-sourcesoftware native geïmplementeerd hebben gevonden. De betonmodule is geïmplementeerd en getest; de staalmodule leeft nog alleen in de frontend en heeft geen eigen testsuite. We zeggen dat om te voorkomen dat we overdrijven hoe rijp ze is.",
        "Draait in de browser. De engine compileert naar WebAssembly en draait lokaal op de machine van de gebruiker, zonder rekenserver en zonder iets te installeren."
      ]
    },
    {
      "k": "note",
      "t": "Update, 20 oktober 2026: sinds versie 0.2.0 controleert de engine elke staaltoetsing van CIRSOC 301 opnieuw (een resultaat dat ze niet bevestigt, wordt getoond als falen of als niet geverifieerd), en de module wordt getest tegen gepubliceerde uitgewerkte voorbeelden; ze blijven als experimenteel gemarkeerd tot een onafhankelijke beoordeling. De cijfers in dit bericht zijn die van het gepubliceerde paper, berekend met de versie van augustus 2026, vóór de correcties van 0.2.0 op de betontoetsingen (bericht SA-2026-002); ze worden geciteerd zoals ze daar staan."
    },
    {
      "k": "h",
      "t": "Van een geteste solver naar een bewezen solver"
    },
    {
      "k": "p",
      "t": "De grens garandeert dat elke bewering van de agent herleidbaar is tot een solveruitvoer. Die garantie erft een beperking: de solver is betrouwbaar omdat hij uitgebreid is getest, maar zijn juistheid is niet formeel bewezen. Een testsuite, hoe grondig ook, dekt alleen de gevallen waar de auteurs aan hebben gedacht."
    },
    {
      "k": "p",
      "t": "Dit is in deze context nog belangrijker. Een agent bouwt modellen, wijzigt ze in meerdere stappen en leest de resultaten om nieuwe acties voor te stellen; onderweg ontvangt de solver invoer die geen enkele ingenieur heeft beoordeeld voordat die de engine bereikte. Als de engine zich bij een randgeval misdraagt (een bijna singuliere stijfheidsmatrix, gedegenereerde geometrie, een extreme belastingcombinatie), kan de agent dat resultaat zonder enige waarschuwing citeren."
    },
    {
      "k": "p",
      "t": "Twee technieken kunnen die kloof verkleinen. Property-based fuzzing genereert duizenden geldige willekeurige modellen en controleert invarianten die voor elke invoer moeten gelden:"
    },
    {
      "k": "ul",
      "items": [
        "Globaal evenwicht: ΣR + ΣF_applied = 0 voor reacties en aangelegde krachten in dezelfde assen, ongeacht geometrie, materialen of opleggingen.",
        "Symmetrie van de stijfheidsmatrix: K = Kᵀ per constructie.",
        "Positieve definietheid van de gereduceerde elastische stijfheidsmatrix van een stabiel, voldoende ondersteund lineair model met positieve staafstijfheden.",
        "Invariantie onder starrelichaamstransformaties: bij een gezamenlijke verschuiving of rotatie van de geometrie, belastingen, oplegrichtingen en lokale assen blijven de lokale snedekrachten gelijk."
      ]
    },
    {
      "k": "p",
      "t": "Formele verificatie benadert dezelfde kloof van de andere kant: een wiskundige specificatie van die eigenschappen opstellen en met een bewijsassistent zoals Lean 4 bewijzen dat de implementatie eraan voldoet. Testen kan fouten vinden; formele verificatie kan laten zien dat ze binnen het gespecificeerde domein afwezig zijn. De twee vullen elkaar aan: wanneer de fuzzer een invoer vindt die een eigenschap breekt, wordt die eigenschap een kandidaat voor een bewijs."
    },
    {
      "k": "note",
      "t": "Het doel is een solver waarvan de kritieke numerieke kern formeel is geverifieerd. Op dat punt zou de determinismegrens een wiskundige garantie worden: elk getal dat in een rekenrapport wordt genoemd, zou herleidbaar zijn tot een bewezen juiste berekening."
    },
    {
      "k": "h",
      "t": "Waar dit nu staat"
    },
    {
      "k": "p",
      "t": "Tot slot: wat beschikbaar is en wat niet. De solver, de editor, de CIRSOC-toetsingen, de onderwijsmodus en het genereren van rapporten en tekeningen draaien vandaag in de browser op stabileo.com, zonder iets te installeren en zonder account. De agentlaag is in actieve ontwikkeling: haar routes draaien in ontwikkeling en test tegen onze eigen backend, op dezelfde solver en dezelfde getallen als al het andere, maar die backend maakt nog geen deel uit van de openbare site."
    },
    {
      "k": "p",
      "t": "De gesloten cyclus met de solver in de lus, waarin de agent voorstelt, berekent, evalueert en wijzigt zonder menselijk ingrijpen, staat op de roadmap en is niet geïmplementeerd. De native normdekking is beperkt tot CIRSOC 201 en 301; de rest is toekomstig werk."
    },
    {
      "k": "p",
      "t": "CAD nam het mechanische deel van het tekenen over en de spreadsheet het repetitieve rekenwerk, terwijl het engineeringoordeel bij de ingenieur bleef. De agent is de volgende stap op die lijn: ze neemt het opbouwen en wijzigen van het model, het invoeren van belastingen, het uitvoeren van de toetsingen en het voorbereiden van de documentatie op zich. Niets hiervan draagt verantwoordelijkheid over: het ondertekende getal blijft dat van de ingenieur."
    },
    {
      "k": "note",
      "t": "Dit stuk is bewerkt naar \"Desarrollo de un agente estructural de cálculo sobre un solver verificado\" (Chesta, Bertero, Carrone en Kingston), gepresenteerd op JAIE 2026. De genoemde cijfers zijn uitvoer van de Stabileo-solver en zijn CIRSOC 201-module, overgenomen uit dat paper."
    }
  ]
};

export default body;
