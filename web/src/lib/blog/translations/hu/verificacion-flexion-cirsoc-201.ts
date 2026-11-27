import type { PostBody } from '../../types';
import { minimumSteelExampleDepthMm, minimumSteelExampleRows, flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

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
      "rows": minimumSteelExampleRows("a minimum", "teherbírás", ",")
    },
    {
      "k": "p",
      "t": `A váltópont Mu = 31,1 kN·m-nél van. Ez a példa a §9.6.1.2 szerinti minimumot használja. Ha a §9.6.1.3 kivétele alkalmazható, minden keresztmetszetben elegendő a számítás szerint szükséges vasalás legalább 4/3-át biztosítani. Érdemes tudni, hogy egy gerenda a váltópont melyik oldalán áll, mielőtt a vasalásáról vitatkozunk. A fenti előzetes méretezési táblázat d = ${(minimumSteelExampleDepthMm / 10).toLocaleString('hu-HU')} cm értéket feltételez; a kiválasztott vasalás tényleges d értékével az ellenőrzést meg kell ismételni.`
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
      "t": "Lent a modell: egy 5 m-es kéttámaszú gerenda, 20×40, H-25, 12 kN/m állandó és 8 kN/m hasznos teherrel, valamint az önsúlyával. A PRO méretezési munkafolyamatában nyílik meg, a CIRSOC 201 a hatályos szabvány."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "A Stabileo PRO méretezési felülete a kijelölt 20×40-es gerendával.",
      "caption": "A képernyőkép a támaszok javítása előtt készült. Az alábbi interaktív példában az aktuális eredmény látható."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "A gerenda a Stabileóban, a PRO méretezési munkafolyamatában. Ha a méretezés ki van kapcsolva, nyomja meg az értesítésben a „Méretezés bekapcsolása erre a látogatásra” gombot. Három gomb, ebben a sorrendben: „Igénybevételek számítása”, „Szükséges acél számítása” és „Méretfelvétel…”. Csak a harmadik választja ki a vasakat, és amíg nincs vasalás, nincs mit ellenőrizni: a táblázat „nincs vasalás” értéket mutat. Az 5 m-es fesztáv két elemként van modellezve; mindkettő megfelel, D/C = 0,91 értékkel. A mezőbeli pozitív hajlítás (My+) a mértékadó. Változtassa meg a terhet, és futtassa újra. A szabvány szerinti méretezés a PRO-ban még fejlesztés alatt áll; a betonmodul az a rész, amely implementált és tesztelt."
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
      "t": "A hasznos magasságot minden választott átmérőnél újra kell számítani. A teherbírás önmagában nem teljes ellenőrzés; a kapacitástáblázatot a jelenlegi számítómaggal ellenőrzött teszt védi."
    }
  ]
};

export default body;
