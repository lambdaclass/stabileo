import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Rúdelemek vagy végeselemek? Két modell, nem két módszer",
  "excerpt": "Prizmatikus rúdra a merevségi módszer a végeselem-módszer pontos különleges esete. Ami változik, az a modell, és magas gerendánál a rúdmodell 19–34%-kal kisebb lehajlást ad.",
  "blocks": [
    {
      "k": "p",
      "t": "„Merevségi módszert vagy végeselemeket használjak?” Ez a kérdés minden tanteremben és minden tervezőirodában felmerül, és rossz kérdés. Az a baj vele, hogy a kettőt felcserélhető alternatívákként kezeli, pedig nem azok."
    },
    {
      "k": "p",
      "t": "A merevségi módszer a rúdelemekre alkalmazott végeselem-módszer. Egy „rúdszerkezeti” és egy „végeselemes” programot a modell választ el egymástól. A rúdelem egydimenziós elméletet hordoz arról, hogyan alakváltozik egy rúd; a héjháló egy diszkretizált kétdimenziós kontinuum. A kettő közötti választás mérnöki döntés, és ez a bejegyzés arról szól, mikor kell meghozni, és mibe kerül, ha rosszul hozzuk meg."
    },
    {
      "k": "h",
      "t": "Egy egyenes rúdnak nem kell háló"
    },
    {
      "k": "p",
      "t": "A végeselemekben az elmozdulást minden elemen belül alakfüggvényekkel közelítjük. Hajlított rúdnál a szokásosak a harmadfokú Hermite-polinomok. Az Euler–Bernoulli-gerenda egyenletének megoldása pedig a fesztáv mentén működő teher nélkül maga is harmadfokú polinom, így a közelítés egybeesik a pontos megoldással."
    },
    {
      "k": "p",
      "t": "Ezért pontos a prizmatikus rúd merevségi mátrixa, az, amelyik bármelyik mátrixos szerkezetszámítási tankönyvben szerepel, és ezért nem javít semmit, ha egy rudat több elemre bontunk. Megoszló teherrel ugyanez érvényes a csomópontokban, feltéve, hogy az egyenértékű csomóponti terheket konzisztensen számítjuk."
    },
    {
      "k": "table",
      "caption": "6 m-es kéttámaszú gerenda, 20×60-as keresztmetszet, 10 kN/m, E = 30 000 MPa. Lehajlás a fesztáv közepén, a gerendát különböző számú rúdelemre bontva.",
      "head": [
        "Rúdelemek száma a gerendában",
        "Lehajlás a fesztáv közepén [mm]"
      ],
      "rows": [
        [
          "2",
          "1,5625"
        ],
        [
          "4",
          "1,5625"
        ],
        [
          "10",
          "1,5625"
        ],
        [
          "50",
          "1,5625"
        ],
        [
          "Zárt alak, 5qL⁴/384EI",
          "1,5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Két elem vagy ötven, a motor ugyanazt a számot adja vissza, és ez egyezik a zárt alakkal."
    },
    {
      "k": "quote",
      "t": "Egy egyenes rúd hálózása nem teszi pontosabbá: csak lassabbá."
    },
    {
      "k": "note",
      "t": "Ez a pontosság a gerendaelméleten belül érvényes. A mátrix pontosan megoldja az Euler–Bernoulli-egyenletet, de ha a rúd nem Euler–Bernoulli-gerendaként viselkedik, ennek az egyenletnek a pontos megoldása sem segít. A bejegyzés többi része ezekről az esetekről szól."
    },
    {
      "k": "h",
      "t": "Ahol elválnak"
    },
    {
      "k": "p",
      "t": "Az Euler–Bernoulli-elmélet feltételezi, hogy a keresztmetszetek síkok maradnak és merőlegesek a tengelyre, ami a nyírási alakváltozás elhanyagolását jelenti. Karcsú gerendánál ez nagyon jó közelítés. Magas gerendánál nem az."
    },
    {
      "k": "p",
      "t": "Ugyanazt a 6 m-es gerendát vettük ugyanazzal a teherrel, és lépésenként növeltük a magasságát. Minden esetet kétszer számítottunk ki: rúdelemekkel, ahogy az Alap mód teszi, és a gerenda síkjában hálózott MITC4 héjként, amire a PRO mód képes."
    },
    {
      "k": "table",
      "caption": "6 m-es kéttámaszú gerenda, 20 cm széles, 10 kN/m, E = 30 000 MPa, ν = 0,2. Lehajlás a fesztáv közepén, a tengelyen.",
      "head": [
        "L/h",
        "Magasság, h [m]",
        "Rúdelemek [mm]",
        "Héjak [mm]",
        "A rúdmodell alulbecslése"
      ],
      "rows": [
        [
          "20",
          "0,30",
          "12,500",
          "12,567",
          "0,5%"
        ],
        [
          "10",
          "0,60",
          "1,5625",
          "1,5961",
          "2,1%"
        ],
        [
          "5",
          "1,20",
          "0,19531",
          "0,21206",
          "7,9%"
        ],
        [
          "3",
          "2,00",
          "0,042188",
          "0,052145",
          "19,1%"
        ],
        [
          "2",
          "3,00",
          "0,012500",
          "0,019017",
          "34,3%"
        ]
      ]
    },
    {
      "k": "p",
      "t": "L/h = 10-nél, egy szokványos gerendánál az eltérés 2%. L/h = 5-nél majdnem 8%. L/h = 3-nál a rúdmodell 19%-kal kisebb lehajlást ad, L/h = 2-nél pedig egyharmadával kisebbet."
    },
    {
      "k": "quote",
      "t": "A rúdmodell a gerendát mindig merevebbnek veszi, mint amilyen valójában."
    },
    {
      "k": "h",
      "t": "Ellenőrzés számológéppel"
    },
    {
      "k": "p",
      "t": "Nem kell a héjra hagyatkoznia. A Timoshenko-féle gerendaelmélet figyelembe veszi a nyírási alakváltozást, és egyenletesen megoszló teherrel terhelt kéttámaszú gerendánál egyetlen tagot ad a lehajláshoz: q·L² / (8·κ·G·A), ahol téglalap keresztmetszetre κ = 5/6 és G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "Gerenda L/h = 3 esetén (6 m-es fesztáv, 2 m magas): négy válasz ugyanarra a kérdésre.",
      "head": [
        "Modell",
        "Lehajlás a fesztáv közepén [mm]"
      ],
      "rows": [
        [
          "Rúdelemek (Euler–Bernoulli)",
          "0,0422"
        ],
        [
          "Rúdelemek a nyírási taggal, kézzel",
          "0,0530"
        ],
        [
          "MITC4 héjak",
          "0,0521"
        ],
        [
          "Síkbeli rugalmasságtan, zárt alak",
          "0,0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "L/h = 3-nál ez a tag 0,0108 mm; az Euler–Bernoulli-féle 0,0422 mm-hez hozzáadva 0,0530 mm-t ad. A héj 0,0521 mm-t ad, Timoshenko és Goodier zárt alakú síkbeli rugalmasságtani megoldása pedig 0,0523 mm-t. A nyírást figyelembe vevő három válasz 2%-on belül egyezik. Az, amelyik elhanyagolja, 19%-kal alulbecsül."
    },
    {
      "k": "note",
      "t": "A lehajlás nem minden. Ennél a magasságnál a normálfeszültségek eloszlása már nem lineáris, így a Navier-képlet sem érvényes. Ezért kezeli az ACI 318, a CIRSOC 201 alapja, faltartóként minden olyan elemet, amelynek szabad fesztávja legfeljebb a magasságának négyszerese, és olyan méretezést ír elő, amely figyelembe veszi a nemlineáris alakváltozás-eloszlást, például rácsos modellel (rúd-csomópont modellel)."
    },
    {
      "k": "h",
      "t": "Számít néhány század milliméter?"
    },
    {
      "k": "p",
      "t": "Önmagában ebben a gerendában nem sokat. Statikailag határozott szerkezetben a merevségi hiba csak a lehajlást befolyásolja, egy 2 m magas gerenda pedig amúgy is nagyon keveset hajlik le. A hiba akkor kezd számítani, amikor a merevség dönti el, hogyan oszlanak meg a terhek, és ez minden statikailag határozatlan szerkezetben így van."
    },
    {
      "k": "p",
      "t": "A tipikus eset a merevítőfal. Rúdmodellben a fal egy nagyon széles oszlop: megkapja a fal inerciáját, és a fal középvonalán áll. Zömök, a magasságához képest hosszú falnál a rúdelem a valóságosnál jóval merevebbnek veszi."
    },
    {
      "k": "table",
      "caption": "20 cm vastag, alul befogott fal, a tetején vízszintesen működő 100 kN-nal. A felső él elmozdulása.",
      "head": [
        "Fal, hossz × magasság [m]",
        "Magasság / hossz",
        "Rúdelem [mm]",
        "Héj [mm]",
        "A rúdelem ennyivel merevebb"
      ],
      "rows": [
        [
          "4 × 3",
          "0,75",
          "0,0281",
          "0,0627",
          "2,23-szoros"
        ],
        [
          "3 × 3",
          "1,00",
          "0,0667",
          "0,1129",
          "1,69-szoros"
        ],
        [
          "2 × 3",
          "1,50",
          "0,2250",
          "0,2943",
          "1,31-szoros"
        ],
        [
          "3 × 6",
          "2,00",
          "0,533",
          "0,625",
          "1,17-szoros"
        ],
        [
          "3 × 9",
          "3,00",
          "1,800",
          "1,937",
          "1,08-szoros"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Egy 4 m hosszú és 3 m magas, egyszintes fal rúdelemmel modellezve 2,2-szer merevebbnek adódik. Egy 3 m hosszú és 9 m magas, háromszintes fal csak 8%-kal merevebb. Az eltérés a zömök falaknál számít a legtöbbet."
    },
    {
      "k": "p",
      "t": "Ez pedig megváltoztatja a nyíróerő megoszlását. Vegyünk két falat ugyanabban a vonalban, az egyik 4 m, a másik 2 m hosszú, mindkettő 3 m magas, és a födém köti össze őket. Rúdelemekkel a rövid fal a nyíróerő 11,1%-át kapja. Héjakkal 17,6%-át, 58%-kal többet, mint amit a rúdmodell előre jelez. Azt a többletterhet, amelyet a rúdmodell a hosszú falra rak, a rövidtől veszi el, így azt kisebb nyíróerőre méretezik, mint amit valójában viselni fog."
    },
    {
      "k": "h",
      "t": "Kérdések, amelyekre egy rúdmodell nem tud válaszolni"
    },
    {
      "k": "p",
      "t": "Eddig olyan esetekről volt szó, amelyekben a rúdelemek hibás számot adnak. Más esetekben egyáltalán nem tudnak számot adni, mert a kérdésnek nincs helye a modellben."
    },
    {
      "k": "ul",
      "items": [
        "Gombafödém. Hogy a nyomaték hogyan oszlik meg az oszlopsáv és a mezősáv között, és mennyi koncentrálódik belőle az egyes oszlopok fölött, az kétdimenziós információ. Egy gerendarács közelítheti, de ez az információ nincs benne a modellben.",
        "Áttöréses fal. A rúdelemnek a tengelye mentén minden pontban egyetlen keresztmetszete van, így egy ablaknak a fal közepén nincs hova kerülnie.",
        "A csomópont. Rúdmodellben a gerenda–oszlop csomópont egy pont, így a nyomatékcsúcs a középvonalon jelenik meg. A valóságban a csomópont akkora, mint az oszlop, és a méretezett keresztmetszet az oszlop síkjában lévő.",
        "Támasz közelében működő koncentrált teher. Ebben a tartományban a keresztmetszetek nem maradnak síkok, ugyanazért, mint a magas gerendánál."
      ]
    },
    {
      "k": "h",
      "t": "Ahol egyezniük kell"
    },
    {
      "k": "p",
      "t": "Az érvelés másik fele ugyanilyen fontos. Az első sor karcsú gerendájánál, L/h = 20-nál a rúdelemek és a héjak 0,5%-kal térnek el. Ez nem nulla, mert a nyírás mindig jelen van, de elhanyagolható. És így is kell lennie: ha a két modell egy karcsú rúdnál nem egyezik, először a végeselemes modellt ellenőrizze, különösen a hálót."
    },
    {
      "k": "note",
      "t": "A nyírási reteszelődés (shear locking) a meghibásodó elem klasszikus példája. Egy naivan megfogalmazott vastaglemez-négyszögelem vékony lemeznél sokkal merevebbé válik a kelleténél, és a födém úgy viselkedik, mintha vastagabb lenne. A Stabileo MITC4 eleme éppen ennek megelőzésére való: a nyírási alakváltozásokat másként interpolálja, így az elem nem reteszelődik."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "Az elmélet vastagság szerinti megválasztása, és hogy mibe kerül a rossz választás, ugyanaz a kérdés, amelyet a csavarás is felvet:"
    },
    {
      "k": "h",
      "t": "Mindkét modell egy programban"
    },
    {
      "k": "p",
      "t": "Rúdelemek és héjak egy programban nem újdonság. A SAP2000, az ETABS, a Robot és a midas mindkettőt egyesíti egy modellben, és ez a szakmai szoftverek alapszintje. Ezek azonban nem arra készültek, hogy elmagyarázzák, mit számítanak. A másik végen az olyan oktatási eszközök, mint az Ftool és a MASTAN2, nagyon jól tanítják a rúdszerkezetek számítását, de a végeselemekig nem jutnak el."
    },
    {
      "k": "p",
      "t": "A Stabileóban mindkét mód egy programban van. Az Alap mód rúdelemekkel számít, és kilenc lépésben vezet végig a merevségi módszeren: a szabadságfokok számozása, a helyi mátrixok, a transzformáció, az összeállítás, a tehervektor, a peremfeltételek, a megoldás, a támaszerők és az igénybevételek. A PRO mód végeselemekkel számít, MITC4 héjakkal és DKT lemezekkel a rúdelemek mellett. Az általunk áttekintett eszközök között nem találtunk másik programot, amelyben megtanulható, hogyan működik a számítás, és aztán eszközváltás nélkül alkalmazható egy teljesebb modellre."
    },
    {
      "k": "img",
      "base": "blog/deep-beam-shell",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, Analízis munkaterület, a 6 m-es, 2 m magas gerenda héjelemekből álló falként modellezve és kiszámítva. Az eredménypanel 225 elmozdulást és 192 héjfeszültséget sorol fel; az Eredményellenőrzések alatt energianormában körülbelül 11%-ra becsüli a diszkretizációs hibát, és kéri a háló finomítását vagy a konvergenciavizsgálat futtatását, mielőtt az eredményeket felhasználnák.",
      "caption": "A lenti héjmodell kiszámítva: az alkalmazás megbecsüli a saját hálóhibáját, és jelzi, ha a háló túl durva ahhoz, hogy megbízzunk benne."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "Az L/h = 3-as gerenda Alap módban: 6 m-es fesztáv, 20×200 cm-es keresztmetszet és 10 kN/m, két rúdelemként modellezve. Vigye az egeret a gerenda közepe fölé, és „uz: -0,042 mm” olvasható, ami egyezik az Euler–Bernoulli-képlettel."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "Ugyanez a gerenda PRO módban, 192 darab 25 cm-es MITC4 elemből álló héjként modellezve. Az Analízis → Elmozdulások alatt a 113-as csomópont (fesztávközép, a magasság felénél) értéke „-5,19e-5” m, azaz 0,0519 mm. A fenti táblázat finomabb hálót használ, és 0,0521 mm-t ad."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Mit magyaráznak el és mit nem az ingyenes eszközök, eszközről eszközre:"
    },
    {
      "k": "h",
      "t": "Röviden"
    },
    {
      "k": "ol",
      "items": [
        "Prizmatikus rúdra a merevségi módszer a végeselemek pontos különleges esete. Amit választ, az a modell.",
        "Egy egyenes rúdnak nem kell háló. Ha a felosztása megváltoztatja az eredményt, valami más a hiba.",
        "L/h ≈ 5 alatt a rúdmodell több mint 8%-kal alulbecsüli a lehajlást, 3 alatt több mint 19%-kal. A gerendát mindig merevebbnek veszi.",
        "Határozatlan szerkezetben ez a hiba megváltoztatja a terhek megoszlását. A zömök falakat a gerendák előtt ellenőrizze.",
        "A gombafödémek, az áttöréses falak és a támaszok közelében működő terhek olyan kérdéseket vetnek fel, amelyekre egy rúdmodell nem tud válaszolni.",
        "Ahol a rúd karcsú, a két modellnek egyeznie kell. Ha nem egyezik, ellenőrizze a hálót."
      ]
    },
    {
      "k": "note",
      "t": "Hogyan számítottuk a számokat: mind a Stabileo motorjából származik, ugyanabból, amelyet az alkalmazás használ. Rúdelemek: Euler–Bernoulli, a tengelyen lévő támaszokkal. Héjak: MITC4 a gerenda síkjában, a magasság mentén 24 elemmel (16 elem a negyedik számjegyet változtatja meg), a teher a felső élen, a támaszok a végkeresztmetszetek teljes magasságán szétosztva. Falak: ugyanez a megfogalmazás, a talp teljes hosszán befogva, a vízszintes teher a felső él mentén szétosztva. A nyírási tag és a síkbeli rugalmasságtani megoldás zárt alakok, amelyeket kézzel is ellenőrizhet."
    }
  ]
};

export default body;
