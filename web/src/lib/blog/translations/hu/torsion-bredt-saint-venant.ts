import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt vagy Saint-Venant: melyik csavaráselmélet érvényes, és mibe kerül a rossz választás",
  "excerpt": "Három képlet, egy keresztmetszet, három különböző szám. Hogy melyik érvényes, az a faltól függ; ahol egyszerre kettő is érvényes, ott Bredt 2–15%-kal alulbecsül.",
  "blocks": [
    {
      "k": "p",
      "t": "Három különböző képlet adja meg a csavarásból származó nyírófeszültséget. Ugyanarra a keresztmetszetre nagyságrendekkel eltérhetnek, és hogy melyik érvényes, az a keresztmetszet falának jellegétől függ."
    },
    {
      "k": "p",
      "t": "Ennyi minden tankönyvben benne van. Amit ritkán magyaráznak el: mi történik, ha a háromból kettő ugyanarra a keresztmetszetre érvényes. Különböző eredményt adnak, és az eltérés mindig ugyanabba az irányba mutat."
    },
    {
      "k": "h",
      "t": "A három képlet"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Csak kör keresztmetszetre, ott viszont pontos: ez az egyetlen eset, amelyben a keresztmetszetek síkok maradnak. A feszültség a sugárral lineárisan nő, a belső felületen mért minimumtól a külső felületen mért maximumig.",
        "Bredt, τ = T / (2·Aₘ·t). Zárt, vékony falú keresztmetszetekre. A csavarónyomatékot egy nyírási folyam viseli, amely a bezárt terület körül kering. Aₘ a fal középvonala által bezárt terület, nem a külső felületé; a kettő összekeverése gyakori hiba.",
        "Saint-Venant, τ = T·t / J, ahol J = (1/3)·Σb·t³. Nyitott, vékony falú keresztmetszetekre. Zárt út híján a folyamnak a vastagságon belül kell visszafordulnia, ezért szerepel a vastagság a köbön."
      ]
    },
    {
      "k": "note",
      "t": "A Saint-Venant-elméletet gyakran „a nyitott keresztmetszetek elméleteként” mutatják be, pedig ez az általános elmélet, a másik kettő pedig zárt alakban megoldható különleges esete. Kör keresztmetszeten a megoldása pontosan egyezik Cauchyéval, mert a körszimmetria miatt a keresztmetszet nem öblösödik. Vékony, zárt falon a megoldása a Bredt-féle."
    },
    {
      "k": "h",
      "t": "Ha kettő érvényes, nem értenek egyet"
    },
    {
      "k": "p",
      "t": "Vegyünk egy kör keresztmetszetű csövet. Cauchy érvényes, és pontos. Bredt is érvényes: a fal zárt, és nyírási folyam kering körülötte. Bredt viszont állandó feszültséget feltételez a vastagság mentén, míg Cauchynál a feszültség a sugárral nő. Így Bredt az átlagot adja, Cauchy a maximumot."
    },
    {
      "k": "table",
      "caption": "Kör keresztmetszetű üreges cső: mennyivel marad Bredt a pontos érték alatt, a relatív falvastagság függvényében.",
      "head": [
        "t / rₘ",
        "Példa (rₘ = 50 mm)",
        "τ Bredt / τ pontos",
        "Bredt alulbecslése"
      ],
      "rows": [
        [
          "0,05",
          "2,5 mm-es fal",
          "0,976",
          "2,4%"
        ],
        [
          "0,10",
          "5,0 mm-es fal",
          "0,955",
          "4,5%"
        ],
        [
          "0,20",
          "10,0 mm-es fal",
          "0,918",
          "8,2%"
        ],
        [
          "0,50",
          "25,0 mm-es fal",
          "0,850",
          "15,0%"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt mind a négy esetben alulbecsül. Egy 5 mm-es falú, 50 mm közepes sugarú csőnél, amely a szokásos ökölszabály szerint még vékony falúnak számít, a tényleges feszültség 4,5%-kal nagyobb a számítottnál. 10 mm-es falnál 8,2%-kal."
    },
    {
      "k": "quote",
      "t": "A hiba előjele mindig ugyanaz: Bredt alulbecsül."
    },
    {
      "k": "p",
      "t": "Egy 4,5%-os eltérés nem tűnik fel egy méretezési ellenőrzésben, így egy meg nem felelő rúd megfelelőnek látszhat."
    },
    {
      "k": "img",
      "base": "blog/torsion-tube",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Alap mód egy CHS 105×5 konzollal 1 kN·m csavarónyomaték alatt. A keresztmetszet panelje a Csavarás részen van nyitva: T = 1,00 kN·m, τmax = 13,34 MPa, J = 393,7 cm⁴, „Kör – pontos” felirattal, alatta a három elmélet, Saint-Venanttal kezdve.",
      "caption": "A táblázat csöve a Stabileóban: 13,34 MPa, alatta mindegyik elmélet a képletével."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Ugyanez a cső a Stabileóban: egy CHS 105×5 konzol 1 kN·m csavarónyomaték alatt. A panel a Csavarás résznél nyílik meg, és Cauchyra 13,34 MPa-t, Bredtre 12,73 MPa-t mutat, a fenti táblázat 95%-át. Mozgassa a pontot vagy változtassa meg a keresztmetszetet, és mindhárom érték frissül."
    },
    {
      "k": "h",
      "t": "A fal felnyitása a nagyságrendet változtatja meg"
    },
    {
      "k": "p",
      "t": "Az egymást átfedő elméletek között néhány százalék az eltérés. Zárt és nyitott fal között nagyságrendek. Vegyünk egy 100×100 mm-es, 5 mm falvastagságú négyzetes csövet, és vágjuk fel hosszában: megtartja a keresztmetszeti területét, a súlyát és szinte a teljes hajlítási merevségét."
    },
    {
      "k": "table",
      "caption": "Ugyanaz a 100×100×5-ös négyzetes cső zártan és hosszirányban felvágva, 1 kN·m csavarónyomaték alatt.",
      "head": [
        "",
        "Zárt",
        "Felvágott",
        "Szorzó"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4 286 875",
          "15 833",
          "271"
        ],
        [
          "τ [MPa]",
          "11,08",
          "315,79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "A csavarási merevség 271-ed részére csökken, a feszültség 29-szeresére nő. Egy azonos súlyú U-szelvény és négyzetes cső csavarásra nagyon különbözően viselkedik."
    },
    {
      "k": "note",
      "t": "Van egy másik tag is, amely gyakran kimarad: az öblösödés. Ha egy nyitott keresztmetszet nem öblösödhet szabadon, mert befogott, vagy mert a csavarónyomaték változik a rúd mentén, a Saint-Venant-féle csavarás mellé gátolt csavarás is társul. Ennek elhanyagolása szintén alulbecsléshez vezet."
    },
    {
      "k": "h",
      "t": "Mit kezd ezzel a Stabileo"
    },
    {
      "k": "p",
      "t": "A Stabileo mindhármat megmutatja, mindegyiket a képletével, a tagjaival és az értékével. Azokat is megjeleníti, amelyek nem érvényesek, az okkal együtt. És ha kettő érvényes ugyanarra a keresztmetszetre, a köztük lévő eltérést mutatja, ahelyett hogy csendben választana egyet."
    },
    {
      "k": "p",
      "t": "A súlypontot, a nyírási középpontot és a keresztmetszeti magot ugyanígy kezeli: lépésről lépésre, teljesen láthatóan számítja, a keresztmetszet tényleges sokszögén, nem pedig alakonként egy-egy képletből."
    },
    {
      "k": "note",
      "t": "Ehhez nyissa meg a szerkesztőt, rajzoljon vagy válasszon ki egy rudat, és lépjen a Haladó → Keresztmetszeti analízis → Csavarás menüpontra. Kör keresztmetszetű csőnél Cauchyt és Bredtet egymás mellett látja, a köztük lévő százalékos eltéréssel. U-szelvénynél Bredt nem alkalmazhatóként jelenik meg, az okkal együtt."
    },
    {
      "k": "h",
      "t": "Röviden"
    },
    {
      "k": "ol",
      "items": [
        "Zárt kört alkot a fal? Bredt, a középvonalon mért Aₘ-mel.",
        "Nyitott? Saint-Venant, és a vastagság a köbön szerepel: a legvastagabb fal a mértékadó.",
        "Kör alakú? Cauchy, és pontos. Ha Bredtet is használja, számítson rá, hogy alulbecsül.",
        "Gátolt az öblösödés? Akkor a Saint-Venant-elmélet önmagában nem elég."
      ]
    },
    {
      "k": "p",
      "t": "Akárhogy is, rögzítse az érték mellett, melyik elméletet használta."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "Ugyanez a kérdés (melyik elmélet érvényes, és mibe kerül a rossz választás) a rúdelemek és a végeselemek közötti választásnál is felmerül:"
    },
    {
      "k": "note",
      "t": "A bejegyzés számai a megadott keresztmetszetek zárt alakú megoldásaiból származnak: egy kör keresztmetszetű üreges cső, Aₘ a középvonalon, és egy 100×100×5-ös négyzetes cső, a zárt J Bredt, a nyitott J Saint-Venant szerint. Ugyanezekkel a keresztmetszetekkel a Stabileóban reprodukálhatók."
    }
  ]
};

export default body;
