import type { StandingPage } from '../../pages';
import { COMPANY } from '../../pages/legal-company';

const body: StandingPage['i18n']['en'] = {
  title: 'A Stabileo Adatvédelmi tájékoztatója',
  description: 'Milyen adatokat kezel a Stabileo, miért, meddig őrzi meg őket, és hogyan élhet hozzáférési, helyesbítési és törlési jogaival.',
  eyebrow: 'Jogi tudnivalók',
  lead: 'E tájékoztató ismerteti, milyen személyes adatokat kezel a Stabileo SAS a stabileo.com használatakor, mire használja őket, és hogyan rendelkezhet felettük. 2026. október 27-től hatályos.',
  blocks: [
    { k: 'h', t: 'Adatkezelő' },
    { k: 'p', t: COMPANY },
    { k: 'h', t: 'Milyen adatokat kezelünk' },
    {
      k: 'ul',
      items: [
        'Fiók: a Google által a Google-fiókkal történő bejelentkezéskor átadott név, e-mail-cím és azonosító, valamint ha megadja, a vállalat, munkakör, ország és nyelv. Jelszavakat nem tárolunk.',
        'Munkamenetek: minden bejelentkezés IP-címe és böngészője, a fiók védelme érdekében.',
        'Hozzájárulások: mit és mikor fogadott el, az ehhez használt IP-címmel és böngészővel.',
        'Felhőprojektek: amelyeket fiókjából menteni kíván. A fiók létrehozásakor be van kapcsolva anonimizált felhasználásuk a Stabileo fejlesztésére, és ezt profiljában bármikor kikapcsolhatja.',
        'Visszajelzés: amit profiljából ír nekünk, és ha csatolja, a megnyitott modell.',
        'Névtelen használat: fiókkal a létrehozásától be van kapcsolva; fiók nélkül csak akkor, ha a megosztást választja. A Beállításokban vagy profiljában bármikor módosíthatja. A használt eszközök, a modellek adatai nélkül, a fiókhoz nem kapcsolva.',
      ],
    },
    { k: 'h', t: 'Mi marad a böngészőjében' },
    { k: 'p', t: 'A számítások a saját számítógépén futnak. Az automatikus mentés, a beállítások és a megnyitott projektek a böngészőben tárolódnak, és nem kerülnek a szervereinkre.' },
    { k: 'h', t: 'Mire használjuk az adatokat' },
    {
      k: 'ul',
      items: [
        'Hozzáférés biztosítására a fiókjához és projektjeihez.',
        'A szolgáltatás és fiókja védelmére.',
        'Annak megértésére, hogy mely funkciókat használják és melyek hibásodnak meg, a Stabileo fejlesztéséhez.',
        'Visszajelzéseinek megválaszolására.',
      ],
    },
    { k: 'h', t: 'MI-asszisztens' },
    { k: 'p', t: 'Az MI-funkciók használatakor a modell kéréshez kapcsolódó részét elküldjük a nyelvi modell szolgáltatójának a válasz előállításához.' },
    { k: 'h', t: 'Hirdetési mérések' },
    { k: 'p', t: 'Annak megismeréséhez, mely hirdetésekből lesznek fiókok, minden új fióknál megőrizzük, honnan érkezett a látogatás (csatorna, kampány, hirdetés és érkezési oldal), és mi kérte a fiókot. Ha megosztja a használati adatokat, rögzítjük az első számítást, első mentést, első exportálást és az alkalmazás használatának napjait is. A Meta pixelt és a Google Tag Managert csak a hirdetési sütik elfogadásakor töltjük be; ettől kezdve megkapják a meglátogatott oldalakat (a megosztott modellt hordozó címrész nélkül) és a fiókhoz vezető lépéseket: az új látogató kattintását a fiók létrehozására, az indítást és a feltételek lépését, a fiók létrejöttét, minden bejelentkezést és az első mentett projektet. A Google Tag Manager ezeket az eseményeket a Google Analytics és a Google Ads részére továbbítja. Ugyanezzel az engedéllyel a fiók létrehozásakor vagy az első projekt mentésekor szerverünkről a Meta Conversions API-n keresztül is jelentjük az eseményt, az e-mail-cím és fiókazonosító SHA-256 kivonatával, az IP-címmel, a böngésző user agent adatával és a pixel sütiazonosítóival (_fbp és _fbc). A Meta és a Google saját szabályzataik szerint használják ezeket az adatokat a kampányok mérésére és fejlesztésére. A modellek tartalmát egyikük sem kapja meg.' },
    { k: 'h', t: 'Kivel osztjuk meg az adatokat' },
    { k: 'p', t: 'Nem értékesítünk adatokat. A Stabileo SAS által szerződött szervereken tároljuk őket, és csak a szolgáltatás működéséhez szükséges szolgáltatókkal osztjuk meg, illetve ha illetékes hatóság követeli. A bejelentkezéshez a Google bejelentkezését használjuk, amely saját adatvédelmi szabályzata szerint kezeli az adatait. A hirdetések méréséhez a Hirdetési mérések alatt leírt eseményeket megosztjuk a Metával és a Google-lel.' },
    { k: 'h', t: 'Meddig őrizzük meg az adatokat' },
    {
      k: 'ul',
      items: [
        'A fiókot és projekteket a törlésükig vagy a fiók bezárásáig.',
        'A névtelen használati adatokat legfeljebb tizenhárom hónapig.',
        'A hozzájárulási nyilvántartást bizonyítékként a fiók fennállásáig.',
        'A fiók forrását és aktivitását a fiók fennállásáig.',
      ],
    },
    { k: 'h', t: 'Az Ön jogai' },
    { k: 'p', t: 'Kérheti az adataihoz való hozzáférést, helyesbítésüket és törlésüket, valamint visszavonhatja hozzájárulásait profiljából vagy a stabileo.com oldalon közzétett csatornákon írva. A hozzáférés legalább hathavi időközönként ingyenes, kivéve igazolt jogos érdek esetén (az argentin 25.326. törvény 14. cikkének 3. bekezdése).' },
    { k: 'p', t: 'Az argentin Közérdekű Információkhoz Való Hozzáférés Ügynöksége a 25.326. törvény szerinti felügyeleti hatóságként jogosult eljárni mindazok panaszai és bejelentései ügyében, akiknek jogait a hatályos személyesadat-védelmi szabályok megsértése érinti.' },
    { k: 'h', t: 'Sütik' },
    { k: 'p', t: 'A böngésző helyi tárhelyét használjuk a munkamenethez és beállításaihoz, a hirdetési sütikre vonatkozó választását is beleértve. Csak elfogadásuk esetén állítjuk be a stb_visit saját sütit, amely 30 napig őrzi meg, honnan érkezett a látogatás (a hivatkozás paramétereit és a hivatkozó webhelyet); ekkor a Meta pixel és a Google Tag Manager is beállítja saját sütijeit. Választását bármikor módosíthatja az oldalak alján található Hirdetési sütik pontban.' },
  ],
  faqTitle: 'Gyakran ismételt kérdések',
  faq: [],
};

export default body;
