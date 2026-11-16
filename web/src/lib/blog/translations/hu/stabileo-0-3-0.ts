import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0: újabb tizenhat javítás, és minden figyelmeztetés nyilvános",
  "excerpt": "Mi változott a 0.2.0 óta: tizenhat hiba, amely hibás eredményt adhatott, javítva és biztonsági figyelmeztetésként közzétéve; tanúsítványok, amelyek az eredményt a modellel vetik össze; és minden futtatásnál ugyanazok a számok.",
  "blocks": [
    {
      "k": "p",
      "t": "A 0.3.0-s verzió 2026. október 21-én jelent meg. A 0.2.0 óta több, egymástól független módon ellenőriztük tovább a megoldót, és további tizenhat olyan hibát találtunk, amely hibás eredményt adhatott. Mindegyiket kijavítottuk, és mindegyikhez közzétettünk egy biztonsági figyelmeztetést, amely leírja, mi volt a hiba, kit érint, és mit kell újraellenőrizni."
    },
    {
      "k": "note",
      "t": "A stabileo.com minden változtatást azonnal közzétesz, amint beolvasztják, így ezek a javítások október 19., 20. vagy 21. óta élesek. Az alkalmazás egyszer jelzi, hogy az eredmények megváltozhattak, az érintett változtatás előtt mentett projektek pedig megnyitáskor újraellenőrzést kérnek."
    },
    {
      "k": "h",
      "t": "Futtassa újra a projektjeit"
    },
    {
      "k": "p",
      "t": "Ezek azok az esetek, amelyek a legjobban elmozdíthatnak egy méretezési eredményt. Minden figyelmeztetés tartalmazza a teljes kidolgozott esetet, és azt, hogy mit kell tenni a már leadott eredményekkel."
    },
    {
      "k": "img",
      "base": "blog/recheck-notice",
      "w": 1600,
      "h": 1000,
      "alt": "A Stabileo PRO egy szeptemberben mentett betonkeretet nyit meg. Az „Az eredmények megváltoztak a projekt legutóbbi számítása óta” című párbeszédablak felsorolja a modellt érintő változásokat, köztük az eredménytanúsítványok által talált megoldójavításokat és a CIRSOC 201 alakváltozási kompatibilitását, és kéri az „Elolvastam ezeket a változásokat” bejelölését, mielőtt az elavult eredményekkel folytatná vagy újrafuttatná a számítást.",
      "caption": "Egy őt érintő javítás előtt kiszámított projekt megnyitása: az alkalmazás felsorolja ezeket a változásokat, és az eredményeket elavultként kezeli, amíg újra ki nem számítják őket."
    },
    {
      "k": "table",
      "caption": "A 0.3.0 néhány javítása: a helyes érték és az, amit az előző verzió adott.",
      "head": [
        "Figyelmeztetés",
        "Eset",
        "Helyes",
        "Korábban"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Nyeregtető szarufája: normálerő a talppontban (kN)",
          "-56,67",
          "-41,67"
        ],
        [
          "SA-2026-007",
          "1,5 m-es kereszt keresztmetszetű oszlop: kritikus teher (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Átszámozott térbeli keret: képlékeny tönkremeneteli tényező",
          "176,47",
          "424,3"
        ],
        [
          "SA-2026-015",
          "Kikötött árboc: húzóerő a kikötésben (kN)",
          "5,18",
          "4,34"
        ],
        [
          "SA-2026-013",
          "Görbe héjakból álló konzol: nyomaték a befogásnál (kN·m/m)",
          "35,0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A többi figyelmeztetés a CQC-vel kombinált válaszspektrumot, a 3D-ben számított, csomóponti nyomatékokkal terhelt síkbeli modelleket, a rugósról merevre változtatott támaszokat, az X–Z síkon kívüli íveket, a p-y, t-z és q-z talajgörbéket, vékony lemezekben a tömör héjelemet, valamint azoknak, akik közvetlenül a motort vagy annak API-ját használják, az anyagi nemlinearitású analízist, a görbe MITC9 elemeket és a rudakon működő hőmérsékleti terheket érinti."
    },
    {
      "k": "h",
      "t": "Figyelmeztetés a csendben hibás eredmény helyett"
    },
    {
      "k": "ul",
      "items": [
        "Az az eredmény, amelyet egy még nyitott hiba érinthet, figyelmeztetést kap, amely a hibát az Ön nyelvén megnevezi. Egy maradt: az anyagi nemlinearitású analízis egész rúdra vonatkozó szelőmodell.",
        "Ha egy hőmérsékleti teher nem adja meg a hőtágulási együtthatót vagy a keresztmetszet magasságát, az eredmény megmondja, milyen értéket feltételezett.",
        "Amire nincs megoldás, azt elutasítja: nyomatékot egy olyan csomóponton, amelyet semmi sem tud elfordítani, héjterhet más típusú elemen, talajgörbét azok a bemenetek nélkül, amelyeket a hivatkozott forrás igényel."
      ]
    },
    {
      "k": "h",
      "t": "Mélyebb ellenőrzés"
    },
    {
      "k": "ul",
      "items": [
        "Végponttól végpontig tartó tanúsítványok keretekre és rácsos tartókra: egy független ellenőrző a modellből újraépíti a merevséget és a terheket, és az elmozdulásokat a modellhez képest tanúsítja, nem csak a motor által összeállított mátrixokhoz képest. Már három olyan esetet talált, ahol a motor és a modell nem egyezett.",
        "Ugyanaz a modell mindig bitre pontosan ugyanazokat a számokat adja, és minden jelentés, munkafüzet és CSV rögzíti, melyik verzió és milyen adatok állították elő.",
        "A CIRSOC 201 szerinti betonméretezés egyetlen implementációból származik, a motorból.",
        "Hibabecslés a lemezek és héjak hálójára, becslésként megjelenítve, sosem tanúsítottként."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "A figyelmeztetések teljes listája, mindegyiknél azzal, mit kell újraellenőrizni:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "A 0.3.0 kiadási megjegyzései",
      "t": "A teljes megjegyzések, az ismert korlátokkal:"
    }
  ]
};

export default body;
