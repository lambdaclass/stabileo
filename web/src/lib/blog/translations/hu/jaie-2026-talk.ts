import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "A Stabileo bemutatása a 29. Argentin Szerkezetépítő Mérnöki Konferencián",
  "excerpt": "Szeptember 18-án Córdobában bemutattuk a 86N számú cikket: egy szerkezetszámító ágenst, amely módosításokat javasol, és minden számot egy ellenőrzött megoldóra bíz. Mit mutattunk, miért kell az ágenst elválasztani a számítástól, és mit hoztunk haza.",
  "blocks": [
    {
      "k": "p",
      "t": "A 29. Argentin Szerkezetépítő Mérnöki Konferenciát (JAIE) szeptember 16. és 18. között rendezte Córdobában az Asociación de Ingenieros Estructurales. Az utolsó napon mutattuk be a 86N számú cikket („Szerkezetszámító ágens fejlesztése ellenőrzött megoldóra”; szerzők: Bautista Chesta, Raúl Bertero, Federico Carrone és Diego Kingston) a mesterséges intelligencia építőmérnöki alkalmazásairól szóló szekcióban."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta a közönséghez beszél; a kivetítőn egy négymezős keret, egyik gerendája pirossal bekarikázva, és „A szerkezetet újraszámítjuk” felirat.",
      "caption": "A 86N számú cikk előadása. A kivetítőn az a pillanat, amikor egy gerenda már nem felel meg, és az egész modellt újra kiszámítjuk."
    },
    {
      "k": "h",
      "t": "Mit mutattunk"
    },
    {
      "k": "p",
      "t": "A cikk egyetlen architekturális szabályra épül: a mesterségesintelligencia-ágens értelmezi, mit kér a mérnök, és lépéseket javasol, de minden szám a megoldóból és a CIRSOC-modulokból származik, amelyeket az ágens nem módosíthat. Ezt determinizmushatárnak nevezzük."
    },
    {
      "k": "p",
      "t": "Az előadásban egy vasbeton keretállással mutattuk be, amely nem felel meg az ellenőrzésen. Az ágens magasabb gerendát javasol, a megoldó az egész modellt újra kiszámítja, a CIRSOC 201 szerinti ellenőrzést pedig az új szerkezeten végezzük el újra: az igénybevétel/teherbírás arány 1,10-ről 0,97-re csökken. A cikk ezt az ellenőrzést kézzel, lépésről lépésre is levezeti."
    },
    {
      "k": "p",
      "t": "A második eset egy négymezős, háromszintes épület volt, amelyből eltávolítottunk egy oszlopot. Néhány gerenda már nem felel meg, a keresztmetszetüket újraméretezzük, és újra minden elem megfelel; a megoldó minden lépésben a teljes modellt kiszámítja."
    },
    {
      "k": "h",
      "t": "Miért kell a határ"
    },
    {
      "k": "p",
      "t": "Ennek bemutatására általános célú MI-asszisztenseknek tizenötször adtuk ki ugyanazt az előméretezési feladatot. Hét különböző keresztmetszetet adtak vissza. A legbeszédesebb rész: tizenegy futtatás ugyanarra a mértékadó nyomatékra jutott, és mégis hat különböző keresztmetszetet javasolt."
    },
    {
      "k": "table",
      "caption": "Ugyanaz az előméretezési kérés többször megismételve, és a megoldóval javított keretállás.",
      "head": [
        "Mi",
        "Érték"
      ],
      "rows": [
        [
          "Ugyanannak a kérésnek a futtatásai",
          "15"
        ],
        [
          "Visszaadott különböző keresztmetszetek",
          "7"
        ],
        [
          "A legnagyobb és a legkisebb terület aránya",
          "1,80"
        ],
        [
          "Futtatások, amelyek Mu = 207 kN·m-re jutottak",
          "11"
        ],
        [
          "Különböző keresztmetszetek ezek között",
          "6"
        ],
        [
          "A keretállás D/C értéke a javítás előtt",
          "1,10"
        ],
        [
          "A keretállás D/C értéke a javítás után",
          "0,97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Ha megoldó áll mögötte, ugyanaz a modell mindig ugyanazt a számot adja, és ez a szám ellenőrizhető. Ezt szeretnénk: hogy a mérnök nyugodtan alá tudja írni."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Diego Kingston és Bautista Chesta szerzői kitűzővel a konferencia szponzorfala előtt.",
      "caption": "Diego Kingstonnal, a cikk társszerzőjével a konferencián."
    },
    {
      "k": "h",
      "t": "Mit hoztunk haza"
    },
    {
      "k": "p",
      "t": "Az ország minden részéről származó szerkezettervező mérnökökkel szereztünk kapcsolatokat, és meghívást kaptunk a szerkezettervező mérnökök hálózatába. Córdobai egyetemekkel is beszéltünk arról, hogy oktatásukban használják."
    },
    {
      "k": "p",
      "t": "A teljes cikk a stabileo.com/paper oldalon érhető el, a Stabileo pedig a böngészőben fut, telepítés nélkül."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "A cikk összefoglalója, mindkét esettel és a számaikkal:"
    }
  ]
};

export default body;
