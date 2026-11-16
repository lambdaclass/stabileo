import type { PostBody } from '../../types';
import { flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

const body: PostBody = {
  "title": "Hajlítási ellenőrzés a CIRSOC 201 szerint, lépésről lépésre",
  "excerpt": "A hajlítási ellenőrzéshez a tényleges vasalásból számított hasznos magasság és a minimális húzási alakváltozás is hozzátartozik. A csökkentett φ nem tesz megfelelővé egy nem duktilis gerendát.",
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
      "items": flexureExampleSteps("Húzott vasalás: 2 Ø20 (6,28 cm²)")
    },
    {
      "k": "p",
      "t": "Az ellenőrzés a kiválasztott vasak tényleges helyzetét használja. A hasznos magasság minden átmérőnél újraszámítandó."
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
      "t": "A váltópont Mu = 31,5 kN·m-nél van. E nyomaték alatt a teherbírásra méretezés semmit sem ér el: a keresztmetszet így is, úgy is 2,39 cm²-t kap. Érdemes tudni, hogy egy gerenda a váltópont melyik oldalán áll, mielőtt a vasalásáról vitatkozunk. A fenti előzetes méretezési táblázat d = 35,9 cm értéket feltételez; a kiválasztott vasalás tényleges d értékével az ellenőrzést meg kell ismételni."
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
      "caption": "A tényleges átmérőhöz tartozó d alapján számított értékek. A teherbírás önmagában nem teljes ellenőrzés; εt,min = 5,10‰.",
      "head": [
        "Mu [kN·m]",
        "Vasalás",
        "εt [‰]",
        "φ",
        "φMn [kN·m]",
        "Duktilitás"
      ],
      "rows": flexureExampleRows("Megfelel", "Nem felel meg")
    },
    {
      "k": "p",
      "t": "Az utolsó sorban a 2 Ø32 vasalás nem duktilis: εt = 2,63‰ < 5,10‰. Nem felel meg, akkor sem, ha φMn meghaladja Mu értékét. A gerendát újra kell méretezni."
    },
    {
      "k": "quote",
      "t": "A 2 Ø32 vasalású keresztmetszet nem felel meg: a húzási alakváltozás az előírt minimum alatt van. A csökkentett φ nem helyettesíti a duktilitás ellenőrzését. A keresztmetszetet vagy a vasalást újra kell méretezni."
    },
    {
      "k": "h",
      "t": "Miért kerül be nyomott vasalás"
    },
    {
      "k": "p",
      "t": "A nyomott vasalás már a duktilitási határ elérésekor szükségessé válhat. Másik lehetőség a keresztmetszet növelése vagy a húzott vasalás áttervezése; az új vasalást ismét ellenőrizni kell."
    },
    {
      "k": "p",
      "t": "A nyomott vasalás tehát azért van ott, hogy visszaadja a keresztmetszet duktilitását és visszahozza a tényezőt. A teherbírás ennek eredményeként következik."
    },
    {
      "k": "note",
      "t": "A CIRSOC 201-2025 szerinti εt,min határát kell használni. Nem szabad megvárni, amíg a húzott acél alakváltozása a folyási alakváltozás alá esik."
    },
    {
      "k": "h",
      "t": "Próbálja ki egy valódi gerendán"
    },
    {
      "k": "p",
      "t": "Lent a modell: egy 5 m-es kéttámaszú gerenda, 20×40, H-25, 12 kN/m állandó és 8 kN/m hasznos teherrel, valamint az önsúlyával. A PRO vasalási táblázataiban nyílik meg, a CIRSOC 201-2025 szabvánnyal."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-sheets",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, vasalási táblázatok a CIRSOC 201-2025 szerint, a gerendák táblázata a V1-en megnyitva a számítás és a méretezés után. A sor alul 2 végigfutó Ø25-öt, felül 2 végigfutó Ø12-t és 18 cm-es osztású Ø8 kengyeleket javasol, 0,79-es kihasználtsággal és Bőséges állapottal. Alatta a nézet a vasak pozícióival, valamint a nyomatéki és nyíróerő-burkolók a teherbírással szemben.",
      "caption": "A lenti gerenda a gerendák táblázatában, a „Vasalás méretezése” után: a Stabileo által javasolt 2 Ø25 0,79-es kihasználtsággal zárul."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=rcSheets",
      "label": "A gerenda a Stabileóban, a PRO vasalási táblázataiban. Négy gomb, ebben a sorrendben: „Számítás”, „Vasalási táblázatok” (a Kimenet csoportban), „Vasalás méretezése” és „Gerendák”. Az első kiszámítja a modellt és megmutatja az eredményeket, a második visszavisz a táblázatokhoz, a harmadik méretezi a vasalást, a negyedik megnyitja a gerendák táblázatát: a V1 sora alul 2 végigfutó Ø25-öt és felül 2 Ø12-t javasol, 0,79-es kihasználtsággal zárul, és „Bőséges” állapotot mutat. Nyissa meg, hogy lássa a nyomatéki burkolót a teherbírással szemben és az egyes ellenőrzéseket; ezt a kihasználtságot „A burkoló a teljes gerendán lefedve, a vasak lehorgonyozva” ellenőrzés adja. Változtassa meg a terhet, és számítson újra. A vasalási táblázatok még fejlesztés alatt állnak: ellenőrizze az eredményeket."
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
      "t": "Minden szám a Stabileo CIRSOC 201 moduljából származik, a megnevezett keresztmetszeteken futtatva, és nem táblázatból. Egy továbbadásra érdemes figyelmeztetés, mert ennek a bejegyzésnek az első változata itt tévedett: a kézi számítás D/C = 0,74-et adott, mert kihagyta az önsúlyt, azt a 2 kN/m-t, amelyet az alkalmazás az állandó teherhez ad. Vele együtt a kéttámaszú gerenda terhe 1,2·14 + 1,6·8 = 29,6 kN/m, Mu = 29,6·5²/8 = 92,5 kN·m, és 2 Ø25-tel (φMn = 113,55 kN·m) D/C = 0,81. A fenti táblázat pontosan 2 Ø25-öt javasol alulra, és 0,79-cel zárul. Ha egy itteni szám valaha eltér attól, amit a szerkesztő mutat, a szerkesztőnek higgyen."
    },
    {
      "k": "note",
      "t": "A hasznos magasságot minden választott átmérőnél újra kell számítani. A teherbírás önmagában nem teljes ellenőrzés; a kapacitástáblázatot a jelenlegi számítómaggal ellenőrzött teszt védi."
    }
  ]
};

export default body;
