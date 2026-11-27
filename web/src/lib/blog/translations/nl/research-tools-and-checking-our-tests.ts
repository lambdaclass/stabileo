import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Onderzoek, tools en het controleren van onze eigen tests",
  "excerpt": "Wat we de afgelopen dagen hebben uitgebracht: uitvoerbaar onderzoek, acht rekenhulpen en controles op de benchmarkmodellen zelf. Wat werkt, wat fout was en wat nog beoordeeld moet worden.",
  "blocks": [
    {
      "k": "p",
      "t": "De afgelopen dagen hebben we Stabileo Research en Stabileo Tools toegevoegd en de controles erachter aangescherpt. Stabileo is gratis, open-source constructieve software met AI, uitgegeven door Ergodic Group. LambdaClass is het ontwikkelteam."
    },
    {
      "k": "h",
      "t": "Onderzoek dat je kunt uitvoeren"
    },
    {
      "k": "p",
      "t": "We brengen gepubliceerde artikelen uit de constructieve techniek en klassieke benchmarks naar de browser, met de eigen viewer van Stabileo. Elke pagina vermeldt wat ze reproduceert, hoe dat is gecontroleerd en wat de grenzen van de vergelijking zijn. Pagina’s die nog openstaande vergelijkingen tonen, maken we af."
    },
    {
      "k": "img",
      "base": "blog/research",
      "w": 1600,
      "h": 1000,
      "alt": "De pagina van Stabileo Research, “Onderzoek in de constructieve techniek”, met de opmerking “Onderzoek, geen ontwerptool” en het eerste uitvoerbare onderdeel, het Lee-raamwerk (1968), getoond met zijn getekende krachtenverloop.",
      "caption": "stabileo.com/research: elke pagina vermeldt wat ze reproduceert en hoe dat is gecontroleerd."
    },
    {
      "k": "p",
      "t": "De live artikelpagina’s behandelen: Shauer (2025), breuk met fasenveld; Grossman en Boudaoud (2026), veernetwerken; Andreassen et al. (2011), topologieoptimalisatie; Ferrari en Sigmund (2025), stabiliteit van Roorda-raamwerken; Pastrana et al. (2026), vormzoeking van kabelnetten; Zmyślony, Khan en Biggins (2026), doorklappende bogen; en Fairclough et al. (2026), roosterschalen."
    },
    {
      "k": "p",
      "t": "De klassiekers voor de rekenkern zijn MacNeal–Harder, de hindernisbaan voor schalen, de elastica van Mattiasson, Riks/Crisfield, Newmark, CQC, plastisch bezwijken, de plaat van Navier, het Lee-raamwerk en de boog van DaDeppo–Schmidt. De pagina’s maken onderscheid tussen live berekening en opgenomen weergave en tonen de grenzen van hun vergelijking. De Koiter-vergelijking van Ferrari is onvoltooid; Fairclough behandelt één voorbeeld met vijf knopen; de evenwichtssprong van de doorklappende boog is geen transiënte simulatie."
    },
    {
      "k": "p",
      "t": "We publiceren de reikwijdte en het bewijs en laten ze openlijk beoordelen. Onderzoeksresultaten zijn geen ontwerpresultaten, en overeenstemming met een benchmark is geen certificering."
    },
    {
      "k": "table",
      "caption": "Vandaag live:",
      "head": [
        "Aanbod",
        "Aantal"
      ],
      "rows": [
        [
          "Uitvoerbare artikelpagina’s",
          "7"
        ],
        [
          "Benchmarkpagina’s voor de rekenkern",
          "10"
        ],
        [
          "Rekenhulpen",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Ook de tests moeten worden gecontroleerd"
    },
    {
      "k": "p",
      "t": "Sommige pagina’s waren fout omdat onze testmodellen fout waren. Elke benchmarkpagina voor de rekenkern en de bijbehorende CI-test van de rekenkern lezen nu hetzelfde bestand met het geval, dus een correctie van het model werkt beide bij. Enkele voorlopige vergelijkingen worden in CI nog uitdrukkelijk genegeerd en blokkeren samenvoegen nog niet; die vergelijkingen maken we af."
    },
    {
      "k": "p",
      "t": "We hebben de referenties van Mattiasson en de behandeling van axiale rek gecorrigeerd (#845), een raamwerk met stijve knopen dat werd vergeleken met een vakwerkformule die alleen axiaal rekent (#846), en onjuiste modellen voor schaalopleggingen en schaalbelasting (#810). We veranderen hoe benchmarks worden opgebouwd, zodat dit soort fouten niet opnieuw kan passeren. Het eerste deel is er: elke benchmark is een specificatie met twee onafhankelijke referenties die moeten overeenkomen, en automatische controles van de aangebrachte belasting, het reactiesaldo en de symmetrie, inclusief een half model tegen het volledige model. We voegen convergentie over drie of meer elementennetten toe, een test met een tekenfout die bewijst dat elke benchmark kan falen, en goedkeuring van de kernset door een ingenieur."
    },
    {
      "k": "img",
      "base": "blog/research-mattiasson",
      "w": 1600,
      "h": 1000,
      "alt": "De benchmarkpagina voor de elastica van de console van Mattiasson (1981), tabblad Resultaten: een grafiek van u/L en v/L tegen PL²/EI met de krommen van Stabileo en cirkels voor de analytische referenties, en een tabel met de waarden en hun relatieve fouten. Links staat “5 van 5 controles geslaagd” en “Onderzoek, geen ontwerptool”.",
      "caption": "De gecorrigeerde pagina van Mattiasson: de respons van de rekenkern tegen twee onafhankelijke analytische referenties."
    },
    {
      "k": "p",
      "t": "We bouwen ook eenheden in het typesysteem in (#864), zodat verwisselingen van kN/N of m/mm bij het compileren worden opgemerkt. Het eerste deel, voor het materiaal- en doorsnedepad van 2D-raamwerken, is op 3 november samengevoegd."
    },
    {
      "k": "h",
      "t": "Ronde 2: elke pagina opnieuw beoordeeld"
    },
    {
      "k": "p",
      "t": "Elke live onderzoekspagina is daarna een tweede keer beoordeeld, door drie AI-modellen achter elkaar (eerst Kimi, dan Codex, dan Claude), en elke bevinding die we konden verifiëren is opgelost. Vijftien pagina’s zijn samen herzien en op 4 november gepubliceerd (#1068): zes artikelen (Shauer, Pastrana, Ferrari, Zmyślony, Grossman en Fairclough) en negen benchmarks voor de rekenkern (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, het voorbeeld van plastisch bezwijken naar Horne, SRSS/CQC en Mattiasson, die een derde ronde kreeg). Er is geen enkele tolerantie versoepeld en geen enkele test verwijderd. Beoordeling door praktiserende ingenieurs moet nog komen."
    },
    {
      "k": "ul",
      "items": [
        "MacNeal–Harder vergeleek absolute waarden, dus een resultaat met het verkeerde teken zou zijn geslaagd. Referenties hebben nu hun teken, en een test weigert voor elk geval een omgekeerde respons.",
        "Riks/Crisfield kon een limietpunt melden zonder dat de belasting daalde. Een limiet vereist nu een daling tussen geconvergeerde stappen; de pagina zegt dat de berekening het bovenste limietpunt passeert in plaats van “de doorklapping te volgen”, en de toleranties gingen van 5 % naar tussen 5e-3 en 1e-5.",
        "Navier verklaarde de MITC4-fout in plaats van hem te meten. Hij wordt nu vergeleken met een onafhankelijke Reissner–Mindlin-reeks, en de MITC4-fout bij een harde oplegging daalt van −1,951 % bij 4×4 naar −0,036 % bij 32×32, met convergentie van de tweede orde.",
        "Pagina’s zeggen waarmee ze worden vergeleken. Newmark wordt getoetst aan exacte oplossingen in gesloten vorm, niet aan “de code van de auteur”; SRSS/CQC is een illustratie van de methode, geen reproductie van het gebouw uit het artikel; de grenzen voor plastisch bezwijken zijn onze eigen handmatige afleidingen, geen citaat; de referentie van 1,83 kN van het Lee-raamwerk is een afgelezen waarde uit een gepubliceerde figuur, dus alleen verschillen van hele procenten worden beweerd."
      ]
    },
    {
      "k": "h",
      "t": "Op telefoons en tablets"
    },
    {
      "k": "p",
      "t": "Gemeten op de live site liepen de onderzoekspagina’s op een telefoon niet over, maar stond het experiment onder het hele artikel, was de viewer krap (356×189 px voor een vierkante plaat) en had elke pagina 25 tot 40 bedieningselementen onder 32 px en 14 tot 20 stukken tekst onder 12 px. Nu komt het experiment direct na de titel, past de viewer zich aan het model aan, zijn bedieningselementen minstens 44 px en tekst minstens 12 px (#831)."
    },
    {
      "k": "img",
      "base": "blog/research-phone",
      "w": 1600,
      "h": 1000,
      "alt": "Twee schermafbeeldingen van Stabileo Research op een telefoon naast elkaar, 390 px breed. Links de pagina over het kabelnet naar Pastrana et al. (2026), “Vier kabels, één evenwicht”, met de viewer direct onder de titel; rechts de benchmark voor de plaat van Navier, waarvan de viewer de volledige schermbreedte vult en de verplaatsing van de plaat naar beneden toont.",
      "caption": "Onderzoek op een telefoon: het experiment na de titel en een viewer zo breed als het scherm."
    },
    {
      "k": "p",
      "t": "Een permanente controle rendert de galerij en elke uitvoerbare pagina op 360, 390, 844×390 en 810 px, in het Spaans, Engels en Portugees, en faalt bij horizontale overloop, kleine bedieningselementen, kleine tekst, of een viewer die ontbreekt, te klein is of te ver naar beneden staat. De eerste runs vonden echte fouten, en we pasten de indelingen aan, niet de controle: de viewer van Mattiasson was 187 px hoog in liggende telefoonstand en is nu 280 px, en een convergentiegrafiek drukte zijn labels af op 9 px. Een reflowtest vond dat de tabbladen van Shauer in het Portugees en Turks bij 360 px overliepen."
    },
    {
      "k": "h",
      "t": "Acht rekenhulpen, met een weg naar de editor"
    },
    {
      "k": "p",
      "t": "Stabileo Tools heeft nu gratis rekenhulpen voor liggers op twee steunpunten, consoles, elastische kolomknik, doorlopende liggers, portalen met één veld, vlakke vakwerken, invloedslijnen voor bewegende belasting en buigingseigenfrequenties van liggers. Ze gebruiken de productierekenkern, tonen onafhankelijke klassieke vergelijkingen en vermelden hun aannamen. Elke rekenhulp opent zijn model in de volledige editor. Dit zijn analysetools, geen volledige normtoetsingen."
    },
    {
      "k": "img",
      "base": "blog/tools",
      "w": 1600,
      "h": 1000,
      "alt": "De pagina van Stabileo Tools, “Gratis rekenhulpen voor de constructeur”, die opent met de rekenhulp voor een ligger op twee steunpunten: een ligger onder een verdeelde belasting met zijn vervormde vorm en een knop Openen.",
      "caption": "stabileo.com/tools: acht rekenhulpen op de productierekenkern."
    },
    {
      "k": "h",
      "t": "Onjuiste resultaten indammen"
    },
    {
      "k": "p",
      "t": "We dammen elk bekend probleem met een onjuist resultaat in: weigeringen of waarschuwingen in de rekenkern dragen de ID van het bekende probleem, in plaats van een ongecontroleerd getal terug te geven (#807, samengevoegd op 5 november). Elke weigering wordt getest, inclusief niet-ondersteunde dynamische modellen met staaf- of schaaloffsets."
    },
    {
      "k": "p",
      "t": "Metamorfe tests legden fouten in de invariantie bloot: gelijkwaardige modellen konden worden geweigerd na rotatie, spiegeling of eenheidsschaling. We draaien de metamorfe testreeks nu bij elke wijziging om deze regressies op te sporen. We voegen een nachtelijke run met willekeurige modellen toe die bevindingen groepeert per grondoorzaak en één issue per grondoorzaak aanmaakt."
    },
    {
      "k": "h",
      "t": "Sindsdien: 1 tot 3 november"
    },
    {
      "k": "ul",
      "items": [
        "De analysemodus van PRO is klaar. Resultaten die zonder waarschuwing onjuist waren, zijn opgelost: de belastinggenerator belast de dakrand van een loods niet langer als een vloer, en het seismische gewicht van een verdieping bevat nu de vloeren en wanden die als schalen zijn getekend, die het eerder wegliet (#1076).",
        "Exports werken op echte gebouwen. Grote Excel-bladen worden rij voor rij geschreven, en het rapport van een gebouw met zes verdiepingen duurt ongeveer tien seconden in plaats van vier minuten. “Een geëxporteerd rapport controleren” vergelijkt nu de afgedrukte getallen, niet alleen de vingerafdrukken (#1076).",
        "PRO kreeg inline hulp die kan worden uitgezet, een opslagstatus in de koptekst, een rapport na de analyse, plaatresultaten en een alleen-lezenweergave voor gedeelde modellen met “Dupliceren en bewerken” (#1077, #1078).",
        "Een knikfactor boven zijn onafhankelijk gecertificeerde bovengrens wordt nu geweigerd, in 2D en 3D (#817, resultatenversie 6). Voer de certificering opnieuw uit voordat je op een eerder knikcertificaat vertrouwt.",
        "Deellinks met niet-eindige getallen, of met staven, opleggingen of belastingen die naar iets ontbrekends verwijzen, worden geweigerd in plaats van geopend (#1058).",
        "De invariantietestreeks controleert nu zes prioritaire analyses onder rotatie, spiegeling en superpositie, en vier ervan onder uniforme stijfheidsschaling (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Controles die binnen twintig minuten antwoord geven"
    },
    {
      "k": "p",
      "t": "Voordat een wijziging in main komt, doorloopt elke wijziging aan Stabileo de controles die ze kan raken, en een wijziging aan de rekenkern doorloopt ze allemaal: tests van de rekenkern, unittests van het web, productiebuilds, end-to-endtests in een browser, de resultatensnapshots en de determinismecontrole. Een veiligheidsoplossing is maar zo snel als die controles, dus op 4 november hebben we aan hun snelheid gewerkt. We hebben eerst gemeten. In een schone run van de samenvoegwachtrij van 44 tot 47 minuten waren de tests van de rekenkern en de unittests 8 tot 15 minuten voor het einde klaar, dus meer ervan parallel toevoegen zou niets hebben opgeleverd. De tijd ging naar het na elkaar bouwen van de onderzoeksbundels en naar het langzaamste end-to-endonderdeel. Toen die korter waren, was het langzaamste onderdeel traag door de voorbereiding: in één run besteedde het 7.2 van zijn 16 minuten aan tests en zes en een halve aan het downloaden van browserpakketten van een trage mirror."
    },
    {
      "k": "ul",
      "items": [
        "Eén keer bouwen, testen wat is gebouwd. De tests van de productiebuild maakten vijf eigen builds extra, vier daarvan van dezelfde boom die CI zojuist had gebouwd; die vier lezen nu die build (#1411). Elke build draagt een stempel van alles waaruit hij is gebouwd, en een test faalt, en slaat nooit over, als het stempel niet overeenkomt met de boom waarop hij draait.",
        "Cachen op invoer. Elke onderzoeksbundel wordt gecachet onder een sleutel van zijn eigen invoer, inclusief de rekenkern waaraan elke bundel is gekoppeld, dus een wijziging aan één artikel bouwt alleen dat artikel opnieuw en een wijziging aan de rekenkern bouwt ze allemaal opnieuw. Een pull request hergebruikt bundels die de samenvoegwachtrij al uit dezelfde invoer heeft gebouwd, nadat elk bestand tegen zijn controlesom is gecontroleerd, en het kan die cache lezen maar nooit schrijven (#1395). Browserpakketten komen ook uit een cache, in plaats van van de mirror (#1413).",
        "Alleen draaien wat een wijziging kan raken. Een wijziging aan documentatie bouwt niets, in een of twee minuten in plaats van een hele run. Een wijziging aan alleen de site slaat de taken van de rekenkern over maar behoudt elk end-to-endonderdeel, omdat 59 van de 281 specificaties tekst op het scherm lezen (#1381). In de wachtrij wordt elk item afgebakend door zijn eigen verschil met het item ervoor, wat verantwoord is omdat een item alleen wordt samengevoegd als elk item ervoor is geslaagd; wanneer het verschil ontbreekt of onduidelijk is, draait alles (#1400).",
        "Het langzaamste pad in balans brengen. End-to-endtests draaien nu in 14 onderdelen in plaats van 10, in balans gebracht op gemeten tijden (#1382). De oude tijdentabel voorspelde 41.5 minuten aan tests waar een run 69.8 duurde."
      ]
    },
    {
      "k": "table",
      "caption": "Doorlooptijd van geslaagde CI-runs waarin elke taak draaide, van aanmaak tot de laatste taak, gemeten met de GitHub Actions API. Ervoor: 4 november, vanaf 08:00 UTC (pull requests) of 13:48 UTC (samenvoegwachtrij) tot 21:10 UTC; erna: vanaf 21:15 UTC tot 03:00 UTC op 5 november.",
      "head": [
        "Runs",
        "Aantal",
        "Mediaan",
        "Bereik"
      ],
      "rows": [
        [
          "Samenvoegwachtrij, ervoor",
          "20",
          "42 min",
          "25 tot 56 min"
        ],
        [
          "Samenvoegwachtrij, erna",
          "10",
          "20 min",
          "15 tot 26 min"
        ],
        [
          "Pull requests (eerste poging), ervoor",
          "69",
          "59 min",
          "35 tot 127 min"
        ],
        [
          "Pull requests (eerste poging), erna",
          "19",
          "27 min",
          "16 tot 45 min"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Een rode controle die niet aan de wijziging ligt"
    },
    {
      "k": "p",
      "t": "Een fout door het netwerk of een verloren machine is ruis, maar het is ook een rode controle waar iemand naar moet kijken, en een gewoonte om rode controles opnieuw te draaien is hoe een echte fout erdoor wordt gewuifd. Daarom worden de mislukte taken van een pull request automatisch één keer opnieuw gedraaid, alleen wanneer elke mislukte taak positief bewijs van een infrastructuurfout draagt: een time-out in een downloadstap, een CI-machine die midden in een taak verloren gaat, een netwerkfout die de laatste poging van een download beëindigt (#1380). Alles wat ergens in het logboek op een testfout lijkt, blokkeert het opnieuw draaien, en ook alles wat de classificator niet herkent. Dat houdt het behoudend: het draait hooguit één keer opnieuw en nooit na een mislukte teststap. Het is geen garantie: een onregelmatige fout die de classificator voor infrastructuur aanziet, kan bij het opnieuw draaien slagen, en daarom blokkeert alles wat hij niet herkent het opnieuw draaien."
    },
    {
      "k": "p",
      "t": "Twee andere oplossingen haalden valse alarmen weg. Een run van een pull request die werd geannuleerd omdat een nieuwere run op dezelfde commit hem verving, toonde vroeger een rode vereiste controle; nu slaat hij die controle over, maar pas nadat is bevestigd dat de nieuwere run bestaat en niet is mislukt, omdat een overgeslagen vereiste controle als geslaagd telt (#1397). En een vastgelopen download kon een proces de vergrendeling van de pakketbeheerder laten vasthouden, waardoor de nieuwe poging op de vergrendeling faalde en niet op de download; een poging telt nu pas als vastgelopen na minuten zonder uitvoer, wordt samen met alles wat hij heeft gestart gestopt, en de nieuwe poging wacht op de vergrendeling (#1408)."
    },
    {
      "k": "h",
      "t": "Wat er daarna komt"
    },
    {
      "k": "p",
      "t": "We maken de openstaande vergelijkingen af en maken de site en de solver sneller. Als volgende staan op de roadmap een Python-pakket (pip install stabileo) en een openbaar verificatiehandboek dat uit de benchmarks wordt gegenereerd."
    }
  ]
};

export default body;
