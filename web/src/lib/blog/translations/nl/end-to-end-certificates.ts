import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "End-to-end certificaten: het resultaat toetsen aan het model",
  "excerpt": "Een certificaat dat bewijst dat een verkeerd opgebouwd stelsel correct is opgelost, is niet veel waard. Hoe Stabileo elk raamwerkmodel zelfstandig opnieuw opbouwt en het resultaat tegen het model certificeert, wat dat opleverde en wat het buiten beschouwing laat.",
  "blocks": [
    {
      "k": "p",
      "t": "Al weken gaat elke lineaire statische berekening in Stabileo door een certificaat dat, wanneer het wordt verkregen, een machinaal gecontroleerde grens geeft voor de fout waarmee het stelsel vergelijkingen K·u = f is opgelost. Maar de rekenkern bouwt dat stelsel zelf op. Als de opbouw een fout had, een verkeerd teken in een transformatie, een ontbrekende Timoshenko-term, een verkeerde inklemmingskracht, zou het certificaat met volle rigoureusheid bewijzen dat het verkeerde stelsel correct is opgelost."
    },
    {
      "k": "p",
      "t": "End-to-end certificaten dichten die kloof voor raamwerken en vakwerken, in 2D en 3D: het resultaat wordt getoetst aan het model zoals het is opgeschreven, niet aan de matrices die de rekenkern heeft opgebouwd."
    },
    {
      "k": "h",
      "t": "Een tweede, onafhankelijke opbouw"
    },
    {
      "k": "p",
      "t": "Een apart geschreven controleprogramma bouwt de stijfheid en de belastingen opnieuw op uit de modelgegevens, zonder een van de element- of opbouwfuncties van de rekenkern aan te roepen. Het gebruikt eigen formules en een eigen nummering van de vrijheidsgraden:"
    },
    {
      "k": "ul",
      "items": [
        "de buiging van elke staaf uit de flexibiliteit van de ingeklemde ligger, geïnverteerd, en het andere uiteinde uit evenwicht, met Timoshenko-schuifvervorming;",
        "scharnieren door statische condensatie, één vrijgegeven rotatie tegelijk;",
        "staafbelastingen als arbeid op de exacte vervormde vormen van de onbelaste staaf, met de integralen in gesloten vorm;",
        "lokale assen, schuine opleggingen, veren, starre verbindingen, diafragma's en meerpuntsbeperkingen, afgeleid uit de conventies van het model."
      ]
    },
    {
      "k": "p",
      "t": "Alles wordt berekend in intervalrekenen, sinussen en cosinussen inbegrepen, met rigoureuze grenzen: elke modelinvoer komt binnen als het decimale getal dat is getypt, ingesloten in een interval. Wanneer een beslissing afhangt van een drempel die het interval niet kan beslechten, weigert het controleprogramma in plaats van te gokken."
    },
    {
      "k": "h",
      "t": "Wat het certificaat stelt"
    },
    {
      "k": "p",
      "t": "Met die exacte stijfheid bewijst het controleprogramma dat het model een unieke oplossing heeft en begrenst het de afstand tussen de verplaatsingen die de rekenkern teruggaf en die oplossing, over elke vrijheidsgraad die het model bepaalt. De matrices van de rekenkern spelen in die uitspraak geen rol. Ze worden apart vergeleken: ze moeten tot op één deel in 10¹⁰ overeenkomen met de opnieuw opgebouwde, en de verplaatsingen moeten tot op één deel in 10⁹ voldoen aan de opleggingen en beperkingen van het model. Zo niet, dan wordt het resultaat gemeld als niet end-to-end gecontroleerd, met de reden."
    },
    {
      "k": "p",
      "t": "De stelling achter de grens is in Lean bewezen. In de app toont het resultatenpaneel de regel “Checked end to end” met de grens op de verplaatsingsfout, of de reden waarom het niet kon worden gecontroleerd."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met het voorbeeld van het portaal berekend. Onder Result checks in het resultatenpaneel staat de regel “Checked end to end: an independent re-assembly of the model agrees; displacement error ≤ 3.68e-15” onder het certificaat.",
      "caption": "De regel in het resultatenpaneel, bij het voorbeeld van het portaal."
    },
    {
      "k": "h",
      "t": "Wat het vond"
    },
    {
      "k": "table",
      "caption": "Modellen die in continue integratie end-to-end zijn gecontroleerd: bij alle komt de opbouw van de rekenkern overeen met de opnieuw opgebouwde.",
      "head": [
        "Set",
        "Modellen",
        "Gecertificeerd"
      ],
      "rows": [
        [
          "2D-testmodellen",
          "82",
          "82"
        ],
        [
          "3D-testmodellen",
          "32",
          "32"
        ],
        [
          "Willekeurige 2D-raamwerken",
          "200",
          "200"
        ],
        [
          "Willekeurige 3D-raamwerken",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Elk testmodel en honderden willekeurig gegenereerde raamwerken komen overeen en worden gecertificeerd, en opbouwfouten die met opzet in de rekenkern zijn aangebracht laten de controle falen. Het vond ook echte problemen:"
    },
    {
      "k": "ul",
      "items": [
        "een 3D-diafragma in het XZ-vlak koppelde de knopen met de rotatie met het verkeerde teken;",
        "in 2D werd een moment op een knoop waar elke staaf is voorzien van een scharnier opgenomen door een kunstmatige veer, en het certificaat van het opgebouwde stelsel liet het door hoewel het model geen oplossing heeft;",
        "een starre verbinding vanuit zo'n knoop verborg een echt mechanisme."
      ]
    },
    {
      "k": "p",
      "t": "De eerste twee zijn opgelost: het diafragma volgt de starre-lichaamsrotatie, en dat moment wordt geweigerd vóór de berekening. En toen de rekenkern veranderde wat een diafragma betekent, zodat de hele vloer als één lichaam roteert, liet het controleprogramma niets onwaars door: het bleef eerlijk, met onbruikbare grenzen, totdat zijn conventies waren bijgewerkt. Daar is een onafhankelijke controle precies voor."
    },
    {
      "k": "h",
      "t": "Wat het buiten beschouwing laat"
    },
    {
      "k": "ul",
      "items": [
        "Schalen, volumes, connectoren, gekromde liggers en welvingstorsie worden nog niet opnieuw opgebouwd: ze worden gemeld als buiten bereik, nooit als gecontroleerd.",
        "De formules van het controleprogramma leggen de mechanica van het model vast. Ze zijn apart van de rekenkern geschreven en ermee vergeleken, maar ze zijn niet bewezen.",
        "De Rust-implementatie is niet bewezen equivalent aan het Lean-algoritme, zoals bij elk certificaat.",
        "Een certificaat zegt dat het resultaat bij het model hoort. Het zegt niet dat het model de constructie goed weergeeft: dat blijft het werk van de ingenieur."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "De andere manieren waarop we naar fouten zoeken, en hun grenzen:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/CERTIFY.md",
      "label": "CERTIFY.md, “End-to-end certificates”",
      "t": "De volledige technische beschrijving, met de formules en de tests:"
    }
  ]
};

export default body;
