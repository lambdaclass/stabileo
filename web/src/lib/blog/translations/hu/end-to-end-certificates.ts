import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Végponttól végpontig tartó tanúsítványok: az eredmény ellenőrzése a modellel szemben",
  "excerpt": "Keveset ér egy tanúsítvány, amely azt bizonyítja, hogy egy hibásan összeállított rendszert helyesen oldottak meg. Hogyan építi újra a Stabileo önállóan minden keretmodelljét, és hogyan tanúsítja az eredményt a modellel szemben, mit talált ez, és mit hagy ki.",
  "blocks": [
    {
      "k": "p",
      "t": "Hetek óta a Stabileo minden lineáris statikai analízise átmegy egy tanúsítványon, amely, ha sikerül megszerezni, géppel ellenőrzött korlátot ad arra a hibára, amellyel a K·u = f egyenletrendszert megoldották. Csakhogy ezt a rendszert maga a motor állítja össze. Ha az összeállításban hiba lenne, egy rossz előjel egy transzformációban, egy hiányzó Timoshenko-tag, egy hibás befogási erő, a tanúsítvány teljes szigorral bizonyítaná, hogy a rossz rendszert helyesen oldották meg."
    },
    {
      "k": "p",
      "t": "A végponttól végpontig tartó tanúsítványok ezt a rést zárják be keretek és rácsos tartók esetén, 2D-ben és 3D-ben: az eredményt a modellel vetik össze, ahogy azt megadták, nem a motor által összeállított mátrixokkal."
    },
    {
      "k": "h",
      "t": "Egy második, független összeállítás"
    },
    {
      "k": "p",
      "t": "Egy külön megírt ellenőrző a modell adataiból újraépíti a merevséget és a terheket, anélkül hogy a motor bármely elem- vagy összeállítási függvényét meghívná. Saját képleteit és a szabadságfokok saját számozását használja:"
    },
    {
      "k": "ul",
      "items": [
        "minden rúd hajlítását a konzol hajlékonyságából, invertálva, a másik végét pedig egyensúlyból, Timoshenko-féle nyírási alakváltozással;",
        "a csuklókat statikus kondenzációval, egyszerre egy felszabadított elfordulással;",
        "a rúdterheket a terheletlen rúd pontos deformált alakjain végzett munkaként, zárt alakú integrálokkal;",
        "a helyi tengelyeket, ferde támaszokat, rugókat, merev kapcsolatokat, tárcsákat és többpontos kényszereket a modell konvencióiból levezetve."
      ]
    },
    {
      "k": "p",
      "t": "Minden intervallumaritmetikával számítódik, a szinuszokat és koszinuszokat is beleértve, szigorú korlátokkal: a modell minden bemenete abban a tizedes alakban lép be, ahogy beírták, egy intervallumba zárva. Ha egy döntés olyan küszöbtől függ, amelyet az intervallum nem tud eldönteni, az ellenőrző inkább elutasít, mint hogy találgasson."
    },
    {
      "k": "h",
      "t": "Mit állít a tanúsítvány"
    },
    {
      "k": "p",
      "t": "Ezzel a pontos merevséggel az ellenőrző bizonyítja, hogy a modellnek egyértelmű megoldása van, és korlátot ad a motor által visszaadott elmozdulások és e megoldás távolságára, a modell által meghatározott összes szabadságfokon. A motor mátrixai ebben az állításban semmilyen szerepet nem játszanak. Ezeket külön vetjük össze: 10¹⁰-ben egy rész pontossággal egyezniük kell az újraépítettekkel, az elmozdulásoknak pedig 10⁹-ben egy rész pontossággal teljesíteniük kell a modell támaszait és kényszereit. Ha nem így van, az eredményt nem végponttól végpontig ellenőrzöttként jelentjük, az okkal együtt."
    },
    {
      "k": "p",
      "t": "A korlát mögötti tételt Leanben bizonyítottuk. Az alkalmazásban az eredménypanelen megjelenik a „Végponttól végpontig ellenőrizve” sor az elmozdulási hiba korlátjával, vagy az ok, amiért nem lehetett ellenőrizni."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód a kiszámított keretállás-példával. Az eredménypanel Eredményellenőrzések részében, a tanúsítvány alatt a „Végponttól végpontig ellenőrizve: a modell független újra-összeállítása egyezik; elmozdulási hiba ≤ 3,68e-15” sor látható.",
      "caption": "A sor az eredménypanelen, a keretállás-példán."
    },
    {
      "k": "h",
      "t": "Mit talált"
    },
    {
      "k": "table",
      "caption": "A folyamatos integrációban végponttól végpontig ellenőrzött modellek: mindegyikben a motor összeállítása egyezik az újraépítettel.",
      "head": [
        "Halmaz",
        "Modellek",
        "Tanúsítva"
      ],
      "rows": [
        [
          "2D tesztmodellek",
          "82",
          "82"
        ],
        [
          "3D tesztmodellek",
          "32",
          "32"
        ],
        [
          "Véletlen 2D keretek",
          "200",
          "200"
        ],
        [
          "Véletlen 3D keretek",
          "150",
          "150"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Minden tesztmodell és több száz véletlenszerűen generált keret egyezik és tanúsított, a motorba szándékosan elhelyezett összeállítási hibák pedig az ellenőrzés bukását okozzák. Valódi problémákat is talált:"
    },
    {
      "k": "ul",
      "items": [
        "egy XZ síkú 3D tárcsa rossz előjelű elfordulással kötötte össze a csomópontokat;",
        "2D-ben egy olyan csomóponton működő nyomatékot, ahol minden rúd csuklós, egy mesterséges rugó nyelt el, és az összeállított rendszer tanúsítványa átengedte, holott a modellnek nincs megoldása;",
        "egy ilyen csomópontból induló merev kapcsolat egy valódi mechanizmust rejtett el."
      ]
    },
    {
      "k": "p",
      "t": "Az első kettőt kijavítottuk: a tárcsa a merevtest-elfordulást követi, az ilyen nyomatékot pedig a számítás előtt elutasítjuk. És amikor a motor megváltoztatta, mit jelent a tárcsa, úgy, hogy az egész födém egy testként forduljon el, az ellenőrző semmi hamisat nem engedett át: becsületes maradt, használhatatlan korlátokkal, amíg a konvencióit nem frissítettük. Pontosan erre való egy független ellenőrzés."
    },
    {
      "k": "h",
      "t": "Mit hagy ki"
    },
    {
      "k": "ul",
      "items": [
        "A héjakat, tömör testeket, kapcsolóelemeket, görbe rudakat és a gátolt csavarást még nem építi újra: ezeket a hatókörön kívülinek jelzi, sosem ellenőrzöttnek.",
        "Az ellenőrző képletei a modell mechanikáját kódolják. A motortól külön írtuk meg őket, és összevetjük velük, de nincsenek bizonyítva.",
        "A Rust-implementáció ekvivalenciája a Lean-algoritmussal nincs bizonyítva, ahogy egyik tanúsítványnál sem.",
        "Egy tanúsítvány azt mondja, hogy az eredmény a modellhez tartozik. Azt nem mondja, hogy a modell jól képviseli a szerkezetet: ez továbbra is a mérnök dolga."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "A hibakeresés további módjai és korlátaik:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/CERTIFY.md",
      "label": "CERTIFY.md, „End-to-end certificates”",
      "t": "A teljes műszaki leírás, a képletekkel és a tesztekkel:"
    }
  ]
};

export default body;
