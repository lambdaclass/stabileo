import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  title: 'Milyen névtelen használati adatokat küld a Stabileo',
  description: 'A Stabileo által küldött névtelen használati adatok teljes listája, amit soha nem küld el, és a küldés kikapcsolása.',
  eyebrow: 'Adatvédelem',
  lead: 'Fiókkal a Stabileo a létrehozásától megoszt névtelen használati adatokat; fiók nélkül csak akkor, ha Ön ezt választja. A Beállításokban vagy profiljában ezt bármikor módosíthatja. Az adatok megmutatják, mely eszközöket használják és melyek hibásodnak meg, hogy eldönthessük, mit fejlesszünk először. Itt található az elküldött adatok teljes listája.',
  blocks: [
    { k: 'h', t: 'Milyen adatokat küldünk' },
    {
      k: 'ul',
      items: [
        'Melyik eszközt választja (például rúd, támasz vagy teher), és melyik ábrát jeleníti meg.',
        'Minden számításról: sikerült-e vagy meghiúsult, mennyi ideig tartott, 2D vagy 3D volt-e, és a modell mérete tartományokban (például 11–50 rúd).',
        'A megnyitott példák, a használt haladó számítások és lépésről lépésre bemutatott módszerek.',
        'Exportálások a formátumukkal.',
        'A mód (Alap vagy PRO), az alkalmazás verziója és a nyelv.',
        'Véletlen azonosító ehhez a látogatáshoz. Ha az értesítésre „Értem” választ ad, a böngészőhöz is egy, benne tárolva, a különböző böngészők számlálásához. Egyik sem kapcsolódik a fiókjához.',
      ],
    },
    { k: 'h', t: 'Mit nem küldünk el soha' },
    {
      k: 'ul',
      items: [
        'Geometriát, terheket, keresztmetszeteket vagy a modellek bármely értékét.',
        'A projektek vagy fájlok nevét.',
        'Az Ön nevét, e-mail-címét vagy IP-címét az eseményekkel együtt.',
      ],
    },
    { k: 'h', t: 'Meddig őrizzük meg' },
    { k: 'p', t: 'Az eseményeket legfeljebb tizenhárom hónapig őrizzük meg, és összesítve elemezzük.' },
    { k: 'h', t: 'Hogyan módosíthatja' },
    { k: 'p', t: 'A Beállítások Adatvédelem részében, vagy fiókkal a profiljában. Ha leállítja a megosztást, a még el nem küldött eseményeket elvetjük.' },
  ],
  faqTitle: 'Gyakran ismételt kérdések',
  faq: [],
};

export default body;
