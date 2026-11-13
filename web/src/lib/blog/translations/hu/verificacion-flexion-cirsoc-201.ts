import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Hajlítási ellenőrzés a CIRSOC 201 szerint, lépésről lépésre",
  "excerpt": "Szinte mindenki emlékszik a φMn ≥ Mu feltételre. Ez az ellenőrzés utolsó sora, nem maga az ellenőrzés. Az eredmény korábban dől el, és az egyik ilyen lépés 0,9 alá viheti a φ-t.",
  "blocks": [
    {
      "k": "p",
      "t": "A legtöbben egyetlen egyenlőtlenségként emlékeznek a hajlítási ellenőrzésre: φMn ≥ Mu. Ez igaz, és ez az utolsó sor. Ami az eredményt eldönti, az korábban történik, olyan lépésekben, amelyeket ritkán néznek meg közelebbről, mert adminisztrációnak tűnnek."
    },
    {
      "k": "p",
      "t": "A Stabileo CIRSOC 201 modulja ezt adja egy 20×40 cm-es, H-25 betonból készült, fy 420 acéllal, 25 mm betonfedéssel és 8 mm-es kengyelekkel kialakított gerendára, 60 kN·m nyomaték alatt:"
    },
    {
      "k": "ol",
      "items": [
        "d = 35,9 cm, d' = 4,1 cm",
        "Mu = 60,00 kN·m",
        "As,min = 2,39 cm²",
        "As,max (csak húzott vasalással) = 11,58 cm²",
        "As,req (húzott) = 4,73 cm²",
        "Húzott vasalás: 2 Ø20 (6,28 cm²)",
        "a = 6,21 cm, c = 7,31 cm",
        "εt = 11,74‰",
        "εt ≥ 5‰ → húzás által vezérelt → φ = 0,90",
        "φMn = 77,90 kN·m"
      ]
    },
    {
      "k": "p",
      "t": "Tíz lépés. A tizedikre mindenki emlékszik. Az eredményt a harmadik és a kilencedik dönti el."
    },
    {
      "k": "h",
      "t": "3. lépés: a minimum gyakrabban mértékadó, mint gondolnánk"
    },
    {
      "k": "p",
      "t": "A 9.6.1.2. cikk minimális hajlítási vasalást ír elő, amely a 0,25·√f'c/fy·bw·d és az 1,4/fy·bw·d közül a nagyobb. Általában olyan alsó határnak tekintik, amelyet szinte sosem érünk el. Lakóépületek gerendáinál folyton elérjük."
    },
    {
      "k": "table",
      "caption": "Ugyanaz a 20×40-es H-25 gerenda növekvő nyomatékok alatt: mi dönti el a vasalást.",
      "head": [
        "Mu [kN·m]",
        "As teherbírásból [cm²]",
        "As,min [cm²]",
        "Mértékadó"
      ],
      "rows": [
        [
          "15",
          "1,12",
          "2,39",
          "a minimum"
        ],
        [
          "30",
          "2,28",
          "2,39",
          "a minimum"
        ],
        [
          "60",
          "4,73",
          "2,39",
          "teherbírás"
        ],
        [
          "90",
          "7,38",
          "2,39",
          "teherbírás"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A váltópont Mu = 31,5 kN·m-nél van. E nyomaték alatt a teherbírásra méretezés semmit sem ér el: a keresztmetszet így is, úgy is 2,39 cm²-t kap. Érdemes tudni, hogy egy gerenda a váltópont melyik oldalán áll, mielőtt a vasalásáról vitatkozunk."
    },
    {
      "k": "h",
      "t": "És a minimum ritkán függ a betontól"
    },
    {
      "k": "p",
      "t": "A cikk két kifejezése közül a √f'c-s csak meglehetősen nagy szilárdságú betonnál haladja meg a másikat."
    },
    {
      "k": "table",
      "caption": "A minimumra vonatkozó két kifejezés fy 420 esetén, ezrelékben.",
      "head": [
        "Beton",
        "0,25·√f'c/fy",
        "1,4/fy",
        "Mértékadó"
      ],
      "rows": [
        [
          "H-20",
          "2,6620",
          "3,3333",
          "1,4/fy"
        ],
        [
          "H-25",
          "2,9762",
          "3,3333",
          "1,4/fy"
        ],
        [
          "H-30",
          "3,2603",
          "3,3333",
          "1,4/fy"
        ],
        [
          "H-35",
          "3,5215",
          "3,3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A váltópont f'c = 31,36 MPa-nál van. A lakóépületekben használt teljes tartományban (H-20, H-25, H-30) a minimális vasalás nem függ a betontól: kizárólag az 1,4/fy-ból adódik. H-20-ról H-30-ra váltva a minimum egyetlen négyzetcentiméterrel sem csökken."
    },
    {
      "k": "h",
      "t": "9. lépés: φ nem automatikusan 0,9"
    },
    {
      "k": "p",
      "t": "A teherbírási csökkentő tényezőt hajlításra 0,90-ként tanítják, aztán állandóként kezelik. Pedig nem az. A húzott acél határállapotbeli alakváltozásából adódik, és a modul ezt a 9. lépésben ki is mondja: εt ≥ 5‰ → húzás által vezérelt → φ = 0,90. Tegyen több acélt a keresztmetszetbe, és εt csökken, vele együtt a φ is."
    },
    {
      "k": "table",
      "caption": "Ugyanaz a gerenda, minden alkalommal jobban terhelve. εt és φ a 8. és 9. lépésből származik.",
      "head": [
        "Mu [kN·m]",
        "Vasalás",
        "εt [‰]",
        "φ",
        "φMn [kN·m]"
      ],
      "rows": [
        [
          "30",
          "2 Ø16",
          "20,03",
          "0,90",
          "51,6"
        ],
        [
          "60",
          "2 Ø20",
          "11,74",
          "0,90",
          "77,9"
        ],
        [
          "90",
          "2 Ø25",
          "6,44",
          "0,90",
          "115,2"
        ],
        [
          "120",
          "2 Ø32",
          "2,76",
          "0,707",
          "133,5"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Az utolsó sorban a keresztmetszet átmeneti tartományba került, és φ 0,707-re esett. A teherbírás nem nőtt úgy, mint az acél: az utolsó két sor között a betonacél-keresztmetszet névlegesen 9,82-ről 16,08 cm²-re nő, φMn viszont csak 115,2-ről 133,5 kN·m-re mozdul. A hozzáadottak jó része elvész a tényezőben."
    },
    {
      "k": "quote",
      "t": "Egy túlvasalt keresztmetszet nem bukik el az ellenőrzésen. A φ-ben bukik el, és az eredmény mégis azt mondja, hogy megfelel."
    },
    {
      "k": "h",
      "t": "Miért kerül be nyomott vasalás"
    },
    {
      "k": "p",
      "t": "A szokásos válasz: „hogy elférjenek a vasak”. Ez a következmény, nem az ok. Ugyanennél a gerendánál Mu = 200 kN·m esetén a modul εt = 1,51‰ értéket talál, a határ alatt, és nyomott vasalást ad hozzá. Ezzel a semleges tengely feljebb kerül, εt visszatér 7,46‰-re, φ pedig 0,90-re."
    },
    {
      "k": "p",
      "t": "A nyomott vasalás tehát azért van ott, hogy visszaadja a keresztmetszet duktilitását és visszahozza a tényezőt. A teherbírás ennek eredményeként következik."
    },
    {
      "k": "note",
      "t": "A modul által erre az esetre kiadott lépések ebben a sorrendben mondják ki: „εt = 1,51‰ < 2,1‰ → A's szükséges”, majd „ΔM = 144,50 kN·m, A's,req = 11,40 cm²”, és csak a végén „εt = 7,46‰ → húzás által vezérelt → φ = 0,90”."
    },
    {
      "k": "h",
      "t": "Próbálja ki egy valódi gerendán"
    },
    {
      "k": "p",
      "t": "Lent a modell: egy 5 m-es kéttámaszú gerenda, 20×40, H-25, 12 kN/m állandó és 8 kN/m hasznos teherrel, valamint az önsúlyával. A PRO méretezési munkafolyamatában nyílik meg, a CIRSOC 201 a hatályos szabvány."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, Méretezés munkaterület, Méretfelvétel lépés, a 20×40-es gerenda kijelölve a számítás és a méretezés után. A rúd paneljén „Ellenőrizve · helyi η 0,90” olvasható a CIRSOC 201 (2025) alatt, 13 ellenőrzéssel az My és Vz tengelyen, 0,900-as legrosszabb kihasználtsággal.",
      "caption": "A lenti gerenda a „Méretfelvétel…” után: a CIRSOC 201 0,90-es kihasználtsággal ellenőrzi."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "A gerenda a Stabileóban, a PRO méretezési munkafolyamatában. Ha a méretezés ki van kapcsolva, nyomja meg az értesítésben a „Méretezés bekapcsolása erre a látogatásra” gombot. Három gomb, ebben a sorrendben: „Igénybevételek számítása”, „Szükséges acél számítása” és „Méretfelvétel…”. Csak a harmadik választja ki a vasakat, és amíg nincs vasalás, nincs mit ellenőrizni: a táblázat „nincs vasalás” értéket mutat. Az 5 m-es fesztáv két elemként van modellezve; mindkettő D/C = 0,90-nel zárul, a mezőbeli nyírás a mértékadó: a hajlítás és a vasak lehorgonyzása alatta marad. Változtassa meg a terhet, és futtassa újra. A szabvány szerinti méretezés a PRO-ban még fejlesztés alatt áll; a betonmodul az a rész, amely implementált és tesztelt."
    },
    {
      "k": "h",
      "t": "Röviden"
    },
    {
      "k": "ol",
      "items": [
        "Méretezés előtt nézze meg, hogy a nyomaték a minimummal adódó váltópont felett vagy alatt van. Alatta a vasalás már eldőlt.",
        "H-20 és H-30 között a minimum nem függ a betontól. Az 1,4/fy-ból adódik.",
        "φ az εt-től függ: mindig együtt olvassa a kettőt.",
        "Ha nyomott vasalás jelenik meg, az azért van, mert a keresztmetszet elvesztette a duktilitását, nem azért, mert hiányzik a teherbírása."
      ]
    },
    {
      "k": "note",
      "t": "Itt minden szám a Stabileo CIRSOC 201 moduljából származik, a megnevezett keresztmetszetekre futtatva, nem táblázatból. Egy figyelmeztetést érdemes továbbadni, mert a bejegyzés első vázlata elrontotta: a kézi számítás D/C = 0,74-et adott, az alkalmazás 0,81-et. A különbség az önsúly volt, 2 kN/m, amelyet az alkalmazás hozzáad az állandó teheresethez. Az alkalmazásnak volt igaza. És egy megjegyzés a fenti szerkesztőhöz, hogy a két szám ne ütközzön: az a 0,81 2 Ø25 vasalást feltételez, amellyel ez a bejegyzés dolgozik; a szerkesztőben látható 0,90 azokkal a vasakkal adódik, amelyeket méretezéskor saját maga választ. Ugyanaz a gerenda, két különböző vasalás. Ha egy itteni szám egyszer nem egyezik a szerkesztővel, a szerkesztőnek higgyen."
    }
  ]
};

export default body;
