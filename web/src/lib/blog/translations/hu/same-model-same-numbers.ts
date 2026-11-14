import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Ugyanaz a modell, ugyanazok a számok: determinizmus és eredet",
  "excerpt": "Ugyanannak a modellnek két számítása egy munkameneten belül eltérhetett az utolsó számjegyekben. Miért történt, hogyan javítottuk, és hogyan mondja meg most minden jelentés, melyik verzió és milyen adatok állították elő, hogy bárki reprodukálhassa.",
  "blocks": [
    {
      "k": "p",
      "t": "Egy aláírt statikai számításnak reprodukálhatónak kell lennie. Ha valaki egy év múlva újra megnyitja a projektet, vagy egy másik mérnök átnézi, ugyanannak a modellnek ugyanazokat a számokat kell adnia, és egyértelműnek kell lennie, a program melyik verziója állította elő őket."
    },
    {
      "k": "p",
      "t": "Amikor megmértük, kiderült, hogy ez nem mindig teljesült: ugyanannak a modellnek két számítása egy munkameneten belül eltérhetett az utolsó számjegyekben, és egyes eredmények más sorrendben jöttek ki. Az eltérések parányiak voltak, de egy szám, amely megváltozik, miközben semmi sem változott, nem ellenőrizhető."
    },
    {
      "k": "h",
      "t": "Honnan jött az eltérés"
    },
    {
      "k": "p",
      "t": "A motor a csomópontokat, rudakat, támaszokat és terheket hash-táblákban tárolja, és minden tábla véletlen kezdőértékkel jön létre: ugyanazt a fájlt kétszer beolvasva kétféle sorrendben járja be. Lebegőpontos számok más sorrendben való összeadása megváltoztathatja az utolsó bitet, mert a számítógépes összeadás nem asszociatív. A 3D összeállítók már rendezték a rudakat, de a 2D-sek, a teher- és támaszciklusok és a legtöbb további analízis nem."
    },
    {
      "k": "ul",
      "items": [
        "A bemeneti táblák minden bejárása most rögzített sorrendben, a kulcsaik sorrendjében halad: a motorban 587 helyen.",
        "Az egyensúlyi összegeket és a ferde támaszok vegyes tagjait is rögzített sorrendben járja be.",
        "A figyelmeztetések csomópont- vagy rúdszám szerint rendezve jelennek meg, nem véletlenszerűen."
      ]
    },
    {
      "k": "table",
      "caption": "Mi változott a motorban, és hogyan ellenőrizzük.",
      "head": [
        "Mi",
        "Szám"
      ],
      "rows": [
        [
          "Rögzített sorrendűvé tett bejárások bemeneti táblákon",
          "587"
        ],
        [
          "Minden véletlen modell bitre pontosan összevetett beolvasásai",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Egy teszt minden véletlen modellt hatszor olvas be, kiszámítja, és az eredményeket szövegként, bitre pontosan összeveti lineáris, modális, kihajlási és P-Delta analízisben. Egy rendezetlen bejárás, amely megváltoztat egy eredményt, eltérésként jelenik meg a futtatások között."
    },
    {
      "k": "h",
      "t": "Minden jelentés megmondja, honnan származik"
    },
    {
      "k": "p",
      "t": "Minden statikai számítás, PRO-jelentés, munkafüzet és CSV most eredetblokkot tartalmaz: az alkalmazás és a motor verzióját és commitját, a számítást végző WebAssembly-modul SHA-256 ujjlenyomatát, a pontos modell, a beállítások és a megjelenített eredmények ujjlenyomatát, valamint a tanúsítványok állapotát (a mozgó teher burkolója kevesebbet rögzít: a modelljét és a beállításait). Ha a projekt az exportálás előkészítése közben megváltozott, semmi sem exportálódik: egy jelentés soha nem hordozza az egyik állapot számait egy másik állapot eredetével."
    },
    {
      "k": "p",
      "t": "Ezzel a blokkal az alkalmazás reprodukálni tud egy jelentést: újra kiszámítja a projektet, és összeveti az összes ujjlenyomatot. Az ítélet csak akkor „reprodukálva”, ha mind egyezik (az eltérő WebAssembly-buildet mellette jelzi, nem számítja eltérésnek); ha valamelyiket nem lehetett újraszámítani, „hiányos” az ítélet, sosem „reprodukálva”. Van egy parancssori eszköz is, amely ugyanazt a bemenetet kétszer számítja ki, és ellenőrzi az ujjlenyomatokat."
    },
    {
      "k": "img",
      "base": "blog/reproduce",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód a „Reprodukálás az eredetből” párbeszédablakkal: egy mező egy jelentés eredetblokkjának beillesztéséhez vagy a mentett jelentés betöltéséhez, valamint „A megoldó bemenetének letöltése” és „Újraszámítás és összevetés” gombok.",
      "caption": "„Exportált jelentés ellenőrzése”: a megnyitott projektet újra kiszámítja, és minden ujjlenyomatot összevet a jelentésben szereplővel."
    },
    {
      "k": "h",
      "t": "A régi projektek jelzik magukat"
    },
    {
      "k": "p",
      "t": "Minden mentett projekt rögzíti, melyik eredményverzióval számították ki. Ha egy olyan projektet nyitnak meg, amelyet a funkcióit érintő változtatás előtt számítottak ki, az alkalmazás felsorolja ezeket a változtatásokat az Ön nyelvén elmagyarázva, és az eredményeket elavultként jelöli, amíg újra ki nem számítják. Kétség esetén egy változtatás alkalmazandónak számít: egy fölösleges értesítés egy percbe kerül, egy hiányzó pedig elrejthet egy elmozdult számot."
    },
    {
      "k": "h",
      "t": "Egy korlát"
    },
    {
      "k": "p",
      "t": "Az alkalmazás mindig WebAssemblyt vet össze WebAssemblyvel. A natív eszköz a tesztmodellen bitre pontosan reprodukálta a böngésző ujjlenyomatait, de a trigonometrikus függvények platformonként más könyvtárból származnak, így egy olyan modell, amelynek összeállítása ezeket úgy használja, hogy a kettő eltérően kerekít, az utolsó bitben különbözhet a parancssor és a böngésző között."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "A számokba vetett bizalom másik fele: az eredmény összevetése a modellel:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "A teljes műszaki leírás:"
    }
  ]
};

export default body;
